const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;

function getKey(envKey) {
  const raw = envKey || process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error("ENCRYPTION_KEY must be at least 32 characters");
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(cipherText) {
  const key = getKey();
  const buf = Buffer.from(cipherText, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

module.exports = { encrypt, decrypt };
