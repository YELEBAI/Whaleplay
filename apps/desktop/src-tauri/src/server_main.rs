//! Standalone LAN server binary — no Tauri/WebView dependency.
//! Build: cargo build --release --bin neo-server
//! Run:   ./neo-server [addr] [port] [store_path] [frontend_dir]

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let addr = args.get(1).cloned().unwrap_or_else(|| "0.0.0.0".into());
    let port: u16 = args.get(2).and_then(|v| v.parse().ok()).unwrap_or(3000);
    let store_path = args
        .get(3)
        .cloned()
        .unwrap_or_else(|| "store.json".into());
    let frontend_dir = args
        .get(4)
        .cloned()
        .unwrap_or_else(|| "dist".into());

    println!("NeoTavern LAN Server");
    println!("  Listening: http://{addr}:{port}");
    println!("  Frontend:  {frontend_dir}");
    println!("  Store:     {store_path}");

    // Load or create store
    let store: BTreeMap<String, String> = std::fs::read_to_string(&store_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    let shared_store: Arc<Mutex<BTreeMap<String, String>>> = Arc::new(Mutex::new(store));

    neo_tavern_desktop_lib::server::start(addr, port, shared_store, store_path, frontend_dir)
        .await
        .unwrap();
}
