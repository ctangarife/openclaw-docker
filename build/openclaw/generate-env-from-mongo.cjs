#!/usr/bin/env node
/**
 * Genera variables de entorno para API keys desde MongoDB
 * OpenClaw lee las credenciales desde variables de entorno con el patrón:
 * {PROVIDER}_API_KEY (ej: MINIMAX_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
 * 
 * Uso:
 *   MONGO_URI=... ENCRYPTION_KEY=... node generate-env-from-mongo.cjs
 *   
 * Output: Imprime variables de entorno en formato "export KEY=value"
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGO_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!MONGO_URI) {
  console.error('MONGO_URI no está definido');
  process.exit(1);
}

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('ENCRYPTION_KEY debe tener al menos 32 caracteres');
  process.exit(1);
}

// Función de desencriptación
function getKey(envKey) {
  return crypto.createHash('sha256').update(envKey).digest();
}

function decrypt(cipherText) {
  const ALGO = 'aes-256-gcm';
  const IV_LEN = 16;
  const AUTH_TAG_LEN = 16;
  
  const key = getKey(ENCRYPTION_KEY);
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Schema de credenciales
const credentialSchema = new mongoose.Schema({
  provider: String,
  name: String,
  tokenEncrypted: String,
  enabled: { type: Boolean, default: true },
}, { timestamps: true, collection: 'api_credentials' });

async function generateEnvVars() {
  try {
    await mongoose.connect(MONGO_URI);
    
    const Credential = mongoose.models.Credential || mongoose.model('Credential', credentialSchema);
    const credentials = await Credential.find({ enabled: true }).lean();
    
    console.log(`# API Keys from MongoDB (${credentials.length} enabled credential(s))`);
    console.log(`# Generated at ${new Date().toISOString()}`);
    
    for (const cred of credentials) {
      try {
        const apiKey = decrypt(cred.tokenEncrypted);
        const envVarName = `${cred.provider.toUpperCase()}_API_KEY`;
        console.log(`export ${envVarName}="${apiKey}"`);
      } catch (err) {
        console.error(`# ERROR desencriptando ${cred.provider}: ${err.message}`);
      }
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

generateEnvVars();
