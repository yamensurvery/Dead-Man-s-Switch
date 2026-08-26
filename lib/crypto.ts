export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded
  );

  return { iv, ciphertext };
}

export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: ArrayBuffer
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(passphrase);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoded,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export function pack(iv: Uint8Array, ciphertext: ArrayBuffer): string {
  const ivBytes = Array.from(iv);
  const cipherBytes = Array.from(new Uint8Array(ciphertext));
  const combined = [...ivBytes, ...cipherBytes];
  return btoa(String.fromCharCode(...combined));
}

export function unpack(packed: string): { iv: Uint8Array; ciphertext: ArrayBuffer } {
  const combined = Uint8Array.from(atob(packed), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12).buffer;
  return { iv, ciphertext };
}

export async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey as BufferSource,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function encryptBuffer(
  key: CryptoKey,
  data: ArrayBuffer
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data
  );

  return { iv, ciphertext };
}

export async function decryptBuffer(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: ArrayBuffer
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext
  );
}

// --- Recipient share secret (URL-fragment-based key derivation) ---

/**
 * Generates a random high-entropy secret for a recipient's share.
 * This value is never sent to the server as plaintext — it lives only
 * in the URL fragment and the recipient's inbox.
 */
export function generateRecipientSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Derives an AES-GCM key from the raw recipient secret using HKDF.
 * Unlike deriveKey() (PBKDF2, for low-entropy passphrases), this assumes
 * the input is already high-entropy random bytes, so no iteration count
 * is needed — HKDF is a fast, direct expand/extract.
 */
export async function deriveKeyFromSecret(
  secret: Uint8Array,
  salt: Uint8Array,
  info: string = "recipient-share"
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * SHA-256 hash of the raw secret, stored server-side as `secret_hash`
 * for verification only — never used to derive the encryption key.
 */
export async function hashSecret(secret: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", secret as BufferSource);
  return base64urlEncode(new Uint8Array(digest));
}

// --- base64url helpers (URL-fragment-safe, unlike pack/unpack's base64) ---

export function base64urlEncode(bytes: Uint8Array): string {
  const standard = btoa(String.fromCharCode(...bytes));
  return standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(encoded: string): Uint8Array {
  const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(
    standard.length + ((4 - (standard.length % 4)) % 4),
    "="
  );
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}