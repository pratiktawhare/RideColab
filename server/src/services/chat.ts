// ─────────────────────────────────────────────────────────────
// Chat encryption service — AES-256-GCM
// Key = HKDF(SERVER_CHAT_SECRET + booking_id, "ridecolab-chat")
// Messages stored as body_encrypted (base64) + iv (base64)
// ─────────────────────────────────────────────────────────────
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '~/config/app';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte AES key for a booking via HKDF-style HMAC.
 * Key = HMAC-SHA256(SERVER_CHAT_SECRET, "ridecolab-chat:" + booking_id)
 */
function deriveKey(bookingId: string): Buffer {
  const secret = env.SERVER_CHAT_SECRET ?? 'dev-chat-secret-not-secure';
  return createHmac('sha256', secret)
    .update(`ridecolab-chat:${bookingId}`)
    .digest();
}

/**
 * Encrypt a plaintext message for a given booking.
 * Returns { bodyEncrypted, iv } — both base64-encoded.
 */
export function encryptMessage(plaintext: string, bookingId: string): { bodyEncrypted: string; iv: string } {
  const key = deriveKey(bookingId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return {
    bodyEncrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt a message for a given booking.
 * Returns the plaintext string, or throws if tampering is detected.
 */
export function decryptMessage(bodyEncrypted: string, iv: string, bookingId: string): string {
  const key = deriveKey(bookingId);
  const ivBuf = Buffer.from(iv, 'base64');
  const encrypted = Buffer.from(bodyEncrypted, 'base64');

  // Last AUTH_TAG_LENGTH bytes are the auth tag
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuf, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

