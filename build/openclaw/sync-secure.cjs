#!/usr/bin/env node
/**
 * Script de sincronización segura que lee credenciales desde un archivo temporal
 * y luego elimina el archivo.
 *
 * Uso: node sync-secure.cjs <temp_credentials_file>
 *
 * El archivo temporal debe contener:
 * {
 *   "MONGO_URI": "...",
 *   "ENCRYPTION_KEY": "..."
 * }
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const TEMP_FILE = process.argv[2];
if (!TEMP_FILE || !fs.existsSync(TEMP_FILE)) {
  console.error('Error: Archivo de credenciales no especificado o no existe');
  process.exit(1);
}

// Leer y eliminar archivo inmediatamente
const credentials = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf8'));
fs.unlinkSync(TEMP_FILE);

// Establecer variables de entorno
process.env.MONGO_URI = credentials.MONGO_URI;
process.env.ENCRYPTION_KEY = credentials.ENCRYPTION_KEY;

// Importar después de establecer las variables
const { syncAuthProfiles } = require('./data/config-service/lib/sync-openclaw-auth.js');

// Ejecutar sincronización
const AGENT_DIR = '/home/node/.openclaw/agents/main/agent';
const OPENCLAW_JSON = '/home/node/.openclaw/openclaw.json';

syncAuthProfiles(AGENT_DIR, OPENCLAW_JSON)
  .then(result => {
    if (result.success) {
      console.log(`✅ Sincronización exitosa: ${result.profiles.length} credenciales`);
      process.exit(0);
    } else {
      console.error(`❌ Error en sincronización: ${result.error}`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  });
