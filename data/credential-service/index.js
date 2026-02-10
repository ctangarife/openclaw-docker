#!/usr/bin/env node
/**
 * Molbot Credential Service
 *
 * Servicio ligero que sirve credenciales vía socket Unix sin exponerlas
 * en el entorno del proceso del gateway.
 *
 * Arquitectura:
 * - Credenciales almacenadas en MongoDB (cifradas con AES-256-GCM)
 * - Socket Unix en /tmp/credential.sock para comunicación IPC
 * - Las credenciales se desencriptan solo en memoria cuando se solicitan
 * - Logs de acceso para auditoría
 *
 * Protocolo:
 * - Request: JSON con { action: "get", key: "provider_name" }
 * - Response: JSON con { success: true, value: "api_key" }
 */

import { createServer } from 'net';
import { readFile, unlink, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import 'dotenv/config';

const SOCKET_PATH = '/tmp/credential.sock';
const MONGO_URI = process.env.MONGO_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!MONGO_URI || !ENCRYPTION_KEY) {
  console.error('ERROR: MONGO_URI y ENCRYPTION_KEY son requeridos');
  process.exit(1);
}

// Schema de credenciales
const credentialSchema = new mongoose.Schema({
  provider: String,
  name: String,
  tokenEncrypted: String,
  enabled: { type: Boolean, default: true },
}, { collection: 'api_credentials' });

const Credential = mongoose.model('Credential', credentialSchema);

// Desencriptar token (AES-256-GCM)
async function decrypt(cipherText) {
  const crypto = await import('crypto');
  const ALGO = 'aes-256-gcm';
  const IV_LEN = 16;
  const AUTH_TAG_LEN = 16;

  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Cache en memoria para evitar desencriptar repetidamente
const credentialCache = new Map();
let cacheInitialized = false;

// Cargar credenciales desde MongoDB a caché
async function loadCredentials() {
  try {
    await mongoose.connect(MONGO_URI);
    const credentials = await Credential.find({ enabled: true }).lean();

    credentialCache.clear();
    for (const cred of credentials) {
      try {
        const apiKey = await decrypt(cred.tokenEncrypted);
        credentialCache.set(cred.provider.toLowerCase(), apiKey);
        console.log(`✅ Credencial cargada: ${cred.provider}`);
      } catch (err) {
        console.error(`❌ Error desencriptando ${cred.provider}:`, err.message);
      }
    }

    cacheInitialized = true;
    console.log(`✅ Cache inicializado con ${credentialCache.size} credenciales`);
  } catch (err) {
    console.error('❌ Error cargando credenciales:', err.message);
    throw err;
  }
}

// Manejar una conexión
function handleConnection(socket) {
  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    // Procesar líneas completas (JSON objects separados por newlines)
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const request = JSON.parse(line);
        const response = processRequest(request);
        socket.write(JSON.stringify(response) + '\n');
      } catch (err) {
        socket.write(JSON.stringify({ success: false, error: err.message }) + '\n');
      }
    }
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err.message);
  });

  socket.on('end', () => {
    // Conexión cerrada
  });
}

// Procesar un request
function processRequest(request) {
  const timestamp = new Date().toISOString();

  if (!cacheInitialized) {
    return { success: false, error: 'Cache no inicializado', timestamp };
  }

  switch (request.action) {
    case 'get':
      const provider = request.key?.toLowerCase();
      if (!provider) {
        return { success: false, error: 'Key requerida', timestamp };
      }
      const value = credentialCache.get(provider);
      if (value) {
        console.log(`[${timestamp}] ✓ Credential accessed: ${provider}`);
        return { success: true, value, timestamp };
      } else {
        console.log(`[${timestamp}] ✗ Credential not found: ${provider}`);
        return { success: false, error: 'Credencial no encontrada', timestamp };
      }

    case 'list':
      const providers = Array.from(credentialCache.keys());
      console.log(`[${timestamp}] Listed providers: ${providers.length}`);
      return { success: true, providers, timestamp };

    case 'health':
      return { success: true, status: 'healthy', count: credentialCache.size, timestamp };

    default:
      return { success: false, error: 'Acción inválida', timestamp };
  }
}

// Iniciar servidor
async function start() {
  // Eliminar socket anterior si existe
  if (existsSync(SOCKET_PATH)) {
    await unlink(SOCKET_PATH);
  }

  // Cargar credenciales
  await loadCredentials();

  // Crear servidor
  const server = createServer(handleConnection);

  server.listen(SOCKET_PATH, () => {
    console.log(`🔐 Credential Service escuchando en ${SOCKET_PATH}`);
    console.log(`📊 Credenciales cargadas: ${credentialCache.size}`);
    chmod(SOCKET_PATH, 0o777).catch(console.error);
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });

  // Recargar credenciales cada 5 minutos
  setInterval(async () => {
    console.log('🔄 Recargando credenciales...');
    try {
      await loadCredentials();
    } catch (err) {
      console.error('Error recargando:', err.message);
    }
  }, 5 * 60 * 1000);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recibido, cerrando...');
  if (existsSync(SOCKET_PATH)) {
    await unlink(SOCKET_PATH);
  }
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recibido, cerrando...');
  if (existsSync(SOCKET_PATH)) {
    await unlink(SOCKET_PATH);
  }
  await mongoose.disconnect();
  process.exit(0);
});

start().catch(err => {
  console.error('Error iniciando:', err);
  process.exit(1);
});
