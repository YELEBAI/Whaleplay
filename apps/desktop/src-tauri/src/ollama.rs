use serde_json::json;
use std::time::Duration;

fn clean_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|err| format!("Failed to create Ollama HTTP client: {err}"))
}

async fn read_json_response(
    response: reqwest::Response,
    label: &str,
) -> Result<serde_json::Value, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{label} failed: {status} {}", crate::search::short_body(&body)));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|err| format!("{label} returned invalid JSON: {err}"))
}

#[tauri::command]
pub(crate) async fn ollama_check(base_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/api/version", clean_base_url(&base_url));
    let response = client(10)?
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Ollama connection failed: {err}"))?;
    read_json_response(response, "Ollama connection").await
}

#[tauri::command]
pub(crate) async fn ollama_pull(base_url: String, model: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/api/pull", clean_base_url(&base_url));
    let response = client(1800)?
        .post(url)
        .json(&json!({ "name": model, "stream": false }))
        .send()
        .await
        .map_err(|err| format!("Ollama pull request failed: {err}"))?;
    read_json_response(response, "Ollama pull").await
}

#[tauri::command]
pub(crate) async fn ollama_embed(
    base_url: String,
    model: String,
    input: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    if input.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!("{}/api/embed", clean_base_url(&base_url));
    let response = client(300)?
        .post(url)
        .json(&json!({ "model": model, "input": input }))
        .send()
        .await
        .map_err(|err| format!("Ollama embedding request failed: {err}"))?;
    let data = read_json_response(response, "Ollama embedding").await?;
    let embeddings = data
        .get("embeddings")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Ollama embedding response did not include embeddings.".to_string())?;

    embeddings
        .iter()
        .map(|embedding| {
            let values = embedding
                .as_array()
                .ok_or_else(|| "Ollama embedding item was not an array.".to_string())?;
            values
                .iter()
                .map(|value| {
                    value
                        .as_f64()
                        .map(|number| number as f32)
                        .ok_or_else(|| "Ollama embedding contained a non-number value.".to_string())
                })
                .collect::<Result<Vec<f32>, String>>()
        })
        .collect()
}
