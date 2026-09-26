import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit nonce recommended for GCM
const TAG_LENGTH = 16;  // 128-bit authentication tag

/**
 * Derives a 32-byte key from the configured ENCRYPTION_KEY string using SHA-256
 * so callers don't have to worry about exact byte lengths.
 */
function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a Base64 string of the form `iv:tag:ciphertext`.
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decrypts a ciphertext produced by `encrypt`.
 * Throws if the message has been tampered with (GCM authentication failure).
 */
export function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, encB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("Invalid encrypted value format");

  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
