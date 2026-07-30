/**
 * Vault encryption primitives.
 *
 * Secret keys never touch disk unencrypted. The user's password is stretched
 * with PBKDF2-SHA256 into an AES-GCM key, which encrypts the whole account
 * list as a single blob. The derived key is held in memory only while the
 * wallet is unlocked.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBlob {
  /** Bumped if the KDF or cipher parameters ever change. */
  version: 1;
  salt: string;
  iv: string;
  iterations: number;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derives the vault key for a fresh vault. Returns the key plus the salt and
 * iteration count that must be stored alongside the ciphertext.
 */
export async function createVaultKey(password: string): Promise<{
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return { key, salt, iterations: PBKDF2_ITERATIONS };
}

/** Re-derives the vault key for an existing vault using its stored parameters. */
export async function openVaultKey(
  password: string,
  blob: EncryptedBlob
): Promise<CryptoKey> {
  return deriveKey(password, fromBase64(blob.salt), blob.iterations);
}

export async function encryptJson(
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  data: unknown
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext
  );

  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    iterations,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Throws if the password is wrong — AES-GCM auth failure is the check. */
export async function decryptJson<T>(
  key: CryptoKey,
  blob: EncryptedBlob
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) as BufferSource },
    key,
    fromBase64(blob.ciphertext) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export { toBase64, fromBase64 };
