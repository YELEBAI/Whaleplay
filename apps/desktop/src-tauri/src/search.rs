use serde::Serialize;
use std::sync::LazyLock;
use std::time::Duration;

#[derive(Serialize)]
pub(crate) struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("WhalePlay/0.1 (+https://local.whale-play)")
        .build()
        .expect("Failed to create search client")
});

pub(crate) fn short_body(body: &str) -> String {
    body.chars().take(200).collect()
}

fn html_entity_decode(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &input[i + 1..i + 3];
            if let Ok(value) = u8::from_str_radix(hex, 16) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    html_entity_decode(&out)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_between<'a>(input: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_index = input.find(start)? + start.len();
    let rest = &input[start_index..];
    let end_index = rest.find(end)?;
    Some(&rest[..end_index])
}

fn extract_attr(input: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    find_between(input, &needle, "\"").map(|value| html_entity_decode(value.trim()))
}

fn clean_duckduckgo_url(raw: &str) -> String {
    let decoded = html_entity_decode(raw);
    if let Some(index) = decoded.find("uddg=") {
        let encoded = &decoded[index + 5..];
        let end = encoded.find('&').unwrap_or(encoded.len());
        return percent_decode(&encoded[..end]);
    }
    if decoded.starts_with("//") {
        return format!("https:{decoded}");
    }
    decoded
}

fn parse_duckduckgo_results(html: &str, limit: usize) -> Vec<WebSearchResult> {
    let mut results = Vec::new();
    for block in html.split("result__body").skip(1) {
        if results.len() >= limit {
            break;
        }

        let Some(anchor_start) = block.find("<a") else {
            continue;
        };
        let anchor = &block[anchor_start..];
        let Some(anchor_end) = anchor.find("</a>") else {
            continue;
        };
        let anchor_block = &anchor[..anchor_end];
        if !anchor_block.contains("result__a") {
            continue;
        }

        let Some(raw_url) = extract_attr(anchor_block, "href") else {
            continue;
        };
        let title = strip_html_tags(anchor_block);
        if title.is_empty() {
            continue;
        }

        let snippet = if let Some(snippet_start) = block.find("result__snippet") {
            let snippet_block = &block[snippet_start..];
            strip_html_tags(find_between(snippet_block, ">", "</a>").unwrap_or_default())
        } else {
            String::new()
        };

        results.push(WebSearchResult {
            title,
            url: clean_duckduckgo_url(&raw_url),
            snippet,
        });
    }
    results
}

#[tauri::command]
pub(crate) async fn web_search(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<WebSearchResult>, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(5).clamp(1, 8);
    let url =
        reqwest::Url::parse_with_params("https://duckduckgo.com/html/", &[("q", clean_query)])
            .map_err(|err| format!("Failed to build search URL: {err}"))?;
    let response = CLIENT
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Search request failed: {err}"))?;

    if let Some(len) = response.content_length() {
        if len > 2 * 1024 * 1024 {
            return Err("Search response exceeds 2 MB limit".to_string());
        }
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Search failed: {status} {}", short_body(&body)));
    }

    let html = response
        .text()
        .await
        .map_err(|err| format!("Failed to read search response: {err}"))?;
    Ok(parse_duckduckgo_results(&html, limit))
}
