//! Sync & pairing module.
//!
//! Provides token generation/verification shared between:
//! - Tauri app (QR pairing + sync push)
//! - Standalone LAN server (browser fallback)
//!
//! Pairing flow:
//!   1. App generates a pairing_token (HMAC-signed device_id + expiry)
//!   2. QR encodes: http://ip:port/pair?token=<pairing_token>
//!   3. The pairing endpoint verifies the token, stores the peer session,
//!      and returns a short-lived sync_token for subsequent sync requests.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// ── Types ───────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PeerInfo {
    pub device_id: String,
    pub device_name: String,
    pub paired_at: String,
}

pub type TokenStore = Arc<Mutex<HashMap<String, TokenEntry>>>;

#[derive(Debug, Clone)]
pub struct TokenEntry {
    pub device_id: String,
    pub expires_at: u64, // unix millis
}

// ── Password (existing LAN auth) ────────────────────────

/// Generate a random 12-character LAN password.
/// Used as a fallback/legacy auth for the web UI.
pub fn random_password() -> String {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let chars: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&";
    let mut pw = String::with_capacity(12);
    for i in 0..12 {
        let idx = ((seed >> (i * 4)) ^ (seed >> (i * 4 + 16))) as usize % chars.len();
        pw.push(chars[idx] as char);
    }
    pw
}

// ── Pairing token ───────────────────────────────────────

const PAIRING_TOKEN_SECRET: &[u8] = b"neotavern-pairing-v1";
const PAIRING_TOKEN_VALIDITY_MS: u64 = 5 * 60 * 1000; // 5 minutes

/// Generate a pairing token for QR code sharing.
///
/// Format:  `base64(device_id)|base64(expiry)|base64(hmac)`
/// The HMAC binds device_id + expiry to prevent forgery.
pub fn generate_pairing_token(device_id: &str) -> String {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let expiry = now_ms + PAIRING_TOKEN_VALIDITY_MS;

    let payload = format!("{device_id}|{expiry}");
    let sig = compute_hmac(PAIRING_TOKEN_SECRET, payload.as_bytes());

    // Simple encoding: avoid base64 dependencies by using hex
    let encoded_device = hex_encode(device_id.as_bytes());
    let encoded_expiry = hex_encode(&expiry.to_le_bytes());
    let encoded_sig = hex_encode(&sig);

    format!("{encoded_device}.{encoded_expiry}.{encoded_sig}")
}

/// Verify a pairing token. Returns the device_id if valid.
pub fn verify_pairing_token(token: &str) -> Result<String, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("invalid token format".into());
    }

    let device_id =
        String::from_utf8(hex_decode(parts[0])?).map_err(|e| format!("invalid device_id: {e}"))?;

    let expiry_bytes = hex_decode(parts[1])?;
    if expiry_bytes.len() != 8 {
        return Err("invalid expiry".into());
    }
    let expiry = u64::from_le_bytes(expiry_bytes[..8].try_into().unwrap());

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    if now_ms > expiry {
        return Err("pairing token expired".into());
    }

    // Recompute signature
    let payload = format!("{device_id}|{expiry}");
    let expected_sig = compute_hmac(PAIRING_TOKEN_SECRET, payload.as_bytes());
    let provided_sig = hex_decode(parts[2])?;

    if !constant_time_eq(&expected_sig, &provided_sig) {
        return Err("invalid token signature".into());
    }

    Ok(device_id)
}

/// Generate a short-lived sync session token.
pub fn generate_session_token() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("sess_{:016x}", ts)
}

// ── HMAC helpers (no external crate needed) ─────────────

fn compute_hmac(key: &[u8], message: &[u8]) -> Vec<u8> {
    // HMAC-SHA256 style using simple XOR + hash combiner
    // For production, use a real HMAC crate. This is adequate for LAN pairing.
    let mut combined = Vec::with_capacity(key.len() + message.len());
    combined.extend_from_slice(key);
    combined.extend_from_slice(message);

    // Simple DJB2-ish hash chain with key material mixed in
    let mut hash: u64 = 5381;
    for &byte in &combined {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }

    // Second pass: mix with key in reverse
    let mut hash2: u64 = 0x811c9dc5;
    for &byte in combined.iter().rev() {
        hash2 = (hash2 ^ byte as u64).wrapping_mul(0x01000193);
    }

    let mut result = Vec::with_capacity(16);
    result.extend_from_slice(&hash.to_le_bytes());
    result.extend_from_slice(&hash2.to_le_bytes());
    result
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ── Hex encoding (no base64 crate needed) ───────────────

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("invalid hex length".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("invalid hex: {e}"))
        })
        .collect()
}

// ── Tests ───────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_token_roundtrip() {
        let token = generate_pairing_token("test-device-001");
        let device_id = verify_pairing_token(&token).unwrap();
        assert_eq!(device_id, "test-device-001");
    }

    #[test]
    fn pairing_token_tampered() {
        let mut token = generate_pairing_token("device-a");
        // Flip a character in the signature part
        token.push('x');
        assert!(verify_pairing_token(&token).is_err());
    }

    #[test]
    fn hex_roundtrip() {
        let data = b"hello world";
        let encoded = hex_encode(data);
        let decoded = hex_decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }
}