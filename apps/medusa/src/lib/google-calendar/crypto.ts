import crypto from "node:crypto";

function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const payload = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString(
    "utf8",
  );
}
