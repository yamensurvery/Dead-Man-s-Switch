/**
 * Shamir's Secret Sharing, backed by a Rust/WASM implementation
 * (byte-wise GF(256) Shamir — see /wasm/dms-shamir-wasm) instead of
 * secrets.js-grempe.
 *
 * INTERFACE CHANGE FROM THE OLD lib/shamir.ts:
 * Both functions are now async, because loading the .wasm binary in the
 * browser is inherently async (fetch + instantiate). Call sites in
 * switch-creation and the recipient portal need `await` added. Everything
 * else — parameter shapes, return shapes (string[] shares, Uint8Array key) —
 * is unchanged.
 */

import init, { split_key, combine_shares } from '@/wasm/dms-shamir-wasm/pkg/dms_shamir_wasm';

let initPromise: Promise<unknown> | null = null;

/**
 * Loads and instantiates the WASM module exactly once, no matter how many
 * times this is called concurrently. Safe to call implicitly from
 * splitKey/combineShares — you don't need to call this yourself.
 */
function ensureWasmInit(): Promise<unknown> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

/**
 * Splits a Uint8Array (e.g. a raw AES key) into `total` shares,
 * requiring `threshold` shares to reconstruct.
 *
 * Returns an array of hex strings — one per share. (Same shape as the old
 * secrets.js-grempe-backed version; the hex encoding underneath is a
 * different, simpler format — there's no interop with old shares, and none
 * exist in production yet.)
 */
export async function splitKey(
  keyBytes: Uint8Array,
  threshold: number,
  total: number
): Promise<string[]> {
  await ensureWasmInit();
  try {
    return split_key(keyBytes, threshold, total);
  } catch (err) {
    // wasm-bindgen surfaces Rust `Err(String)` as a thrown JsValue/string
    throw new Error(`splitKey failed: ${String(err)}`);
  }
}

/**
 * Reconstructs a Uint8Array from an array of shares (hex strings).
 * You only need `threshold` shares, but can pass more.
 */
export async function combineShares(shares: string[]): Promise<Uint8Array> {
  await ensureWasmInit();
  try {
    const bytes = combine_shares(shares);
    return new Uint8Array(bytes);
  } catch (err) {
    throw new Error(`combineShares failed: ${String(err)}`);
  }
}