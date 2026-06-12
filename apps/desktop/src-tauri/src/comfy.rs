use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use std::time::Duration;

use crate::search;
use std::sync::LazyLock;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to create ComfyUI HTTP client")
});

fn clean_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

async fn read_comfy_json_response(
    response: reqwest::Response,
    label: &str,
) -> Result<serde_json::Value, String> {
    if let Some(len) = response.content_length() {
        if len > 10 * 1024 * 1024 {
            return Err(format!("{label} response exceeds 10 MB limit"));
        }
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "{label} failed: {status} {}",
            search::short_body(&body)
        ));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("{label} returned invalid JSON: {err}"))
}

#[tauri::command]
pub(crate) async fn comfy_get_system_stats(base_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/system_stats", clean_base_url(&base_url));
    let response = CLIENT
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI connection failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI connection").await
}

#[tauri::command]
pub(crate) async fn comfy_queue_prompt(
    base_url: String,
    prompt: serde_json::Value,
    client_id: String,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/prompt", clean_base_url(&base_url));
    let response = CLIENT
        .post(url)
        .json(&json!({ "prompt": prompt, "client_id": client_id }))
        .send()
        .await
        .map_err(|err| format!("ComfyUI prompt request failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI prompt").await
}

#[tauri::command]
pub(crate) async fn comfy_get_history(
    base_url: String,
    prompt_id: String,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/history/{}", clean_base_url(&base_url), prompt_id);
    let response = CLIENT
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI history request failed: {err}"))?;

    read_comfy_json_response(response, "ComfyUI history").await
}

#[tauri::command]
pub(crate) async fn comfy_get_image_data_url(
    base_url: String,
    filename: String,
    subfolder: Option<String>,
    image_type: Option<String>,
) -> Result<String, String> {
    let mut url = reqwest::Url::parse(&format!("{}/view", clean_base_url(&base_url)))
        .map_err(|err| format!("Invalid ComfyUI image URL: {err}"))?;

    {
        let mut query = url.query_pairs_mut();
        query.append_pair("filename", &filename);
        if let Some(subfolder) = subfolder.as_deref().filter(|value| !value.is_empty()) {
            query.append_pair("subfolder", subfolder);
        }
        if let Some(image_type) = image_type.as_deref().filter(|value| !value.is_empty()) {
            query.append_pair("type", image_type);
        }
    }

    let response = CLIENT
        .get(url)
        .send()
        .await
        .map_err(|err| format!("ComfyUI image request failed: {err}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "ComfyUI image fetch failed: {status} {}",
            search::short_body(&body)
        ));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    if let Some(len) = response.content_length() {
        if len > 50 * 1024 * 1024 {
            return Err("ComfyUI image exceeds 50 MB limit".to_string());
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Failed to read ComfyUI image: {err}"))?;
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{content_type};base64,{encoded}"))
}
