mod core;

use wasm_bindgen::prelude::*;

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("malformed share: odd-length hex string".to_string());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let byte = u8::from_str_radix(&s[i..i + 2], 16)
            .map_err(|_| "malformed share: invalid hex".to_string())?;
        out.push(byte);
        i += 2;
    }
    Ok(out)
}

/// Splits `key_bytes` into `total` hex-encoded shares, `threshold` of which
/// are required to reconstruct. Signature-compatible with the old
/// `secrets.js-grempe`-backed `splitKey`: same inputs, same `string[]` output
/// shape (just a different, simpler internal encoding).
#[wasm_bindgen]
pub fn split_key(key_bytes: &[u8], threshold: u8, total: u8) -> Result<Vec<String>, JsValue> {
    let shares = core::split(key_bytes, threshold, total).map_err(|e| JsValue::from_str(&e))?;
    Ok(shares.iter().map(|s| hex_encode(s)).collect())
}

/// Reconstructs the original bytes from an array of hex-encoded shares.
/// Signature-compatible with the old `combineShares`.
#[wasm_bindgen]
pub fn combine_shares(shares: Vec<String>) -> Result<Vec<u8>, JsValue> {
    let decoded: Result<Vec<Vec<u8>>, String> = shares.iter().map(|s| hex_decode(s)).collect();
    let decoded = decoded.map_err(|e| JsValue::from_str(&e))?;
    core::combine(&decoded).map_err(|e| JsValue::from_str(&e))
}