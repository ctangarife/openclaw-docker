#!/usr/bin/env node
/**
 * Script de diagnóstico completo para entender el problema de sincronización
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const agentDir = '/home/node/.openclaw/agents/main/agent';
const openclawJsonPath = '/home/node/.openclaw/openclaw.json';
const authProfilesFile = path.join(agentDir, 'auth-profiles.json');
const modelsFile = path.join(agentDir, 'models.json');

async function diagnose() {
  console.log('🔍 DIAGNÓSTICO COMPLETO DEL PROBLEMA\n');
  console.log('='.repeat(60));
  
  // 1. Verificar variables de entorno
  console.log('\n1️⃣ VARIABLES DE ENTORNO:');
  console.log(`   MONGO_URI: ${process.env.MONGO_URI ? '✅ definida' : '❌ NO definida'}`);
  console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? '✅ definida' : '❌ NO definida'}`);
  console.log(`   OPENCLAW_AGENT_DIR: ${process.env.OPENCLAW_AGENT_DIR || '(no definida, usando default)'}`);
  console.log(`   OPENCLAW_CONFIG_DIR: ${process.env.OPENCLAW_CONFIG_DIR || '(no definida, usando default)'}`);
  
  // 2. Conectar a MongoDB y verificar credenciales
  console.log('\n2️⃣ MONGODB:');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('   ✅ Conectado a MongoDB');
    
    const Credential = mongoose.model('Credential', new mongoose.Schema({}, { strict: false, collection: 'api_credentials' }));
    
    const allCredentials = await Credential.find({}).lean();
    const enabledCredentials = await Credential.find({ enabled: true }).lean();
    
    console.log(`   Total de credenciales: ${allCredentials.length}`);
    console.log(`   Credenciales habilitadas: ${enabledCredentials.length}`);
    
    if (enabledCredentials.length > 0) {
      console.log('\n   Credenciales habilitadas:');
      enabledCredentials.forEach(c => {
        console.log(`     - ${c.provider} (${c.name || 'sin nombre'})`);
        console.log(`       ID: ${c._id}`);
        console.log(`       Token encriptado: ${c.tokenEncrypted ? '✅ presente' : '❌ ausente'}`);
      });
    } else {
      console.log('   ⚠️  NO HAY CREDENCIALES HABILITADAS EN MONGODB');
    }
  } catch (err) {
    console.error('   ❌ Error conectando a MongoDB:', err.message);
  }
  
  // 3. Verificar archivos en el sistema de archivos
  console.log('\n3️⃣ ARCHIVOS EN EL SISTEMA DE ARCHIVOS:');
  
  console.log(`   Directorio del agente: ${agentDir}`);
  if (fs.existsSync(agentDir)) {
    console.log('   ✅ Directorio existe');
    const files = fs.readdirSync(agentDir);
    console.log(`   Archivos en el directorio: ${files.join(', ') || 'ninguno'}`);
  } else {
    console.log('   ❌ Directorio NO existe');
  }
  
  console.log(`\n   auth-profiles.json: ${authProfilesFile}`);
  if (fs.existsSync(authProfilesFile)) {
    console.log('   ✅ Archivo existe');
    try {
      const content = JSON.parse(fs.readFileSync(authProfilesFile, 'utf8'));
      console.log(`   Profiles en el archivo: ${content.profiles?.length || 0}`);
      if (content.profiles && content.profiles.length > 0) {
        content.profiles.forEach(p => {
          console.log(`     - ${p.provider}: ${p.apiKey ? '✅ API key presente' : '❌ Sin API key'}`);
        });
      } else {
        console.log('   ⚠️  El archivo está vacío (sin profiles)');
      }
    } catch (err) {
      console.error('   ❌ Error leyendo archivo:', err.message);
    }
  } else {
    console.log('   ❌ Archivo NO existe');
  }
  
  console.log(`\n   models.json: ${modelsFile}`);
  if (fs.existsSync(modelsFile)) {
    console.log('   ✅ Archivo existe');
    try {
      const content = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
      const providers = Object.keys(content.providers || {});
      console.log(`   Providers en el archivo: ${providers.join(', ') || 'ninguno'}`);
    } catch (err) {
      console.error('   ❌ Error leyendo archivo:', err.message);
    }
  } else {
    console.log('   ❌ Archivo NO existe');
  }
  
  console.log(`\n   openclaw.json: ${openclawJsonPath}`);
  if (fs.existsSync(openclawJsonPath)) {
    console.log('   ✅ Archivo existe');
    try {
      const content = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
      if (content.models?.providers) {
        const providers = Object.keys(content.models.providers);
        console.log(`   Providers en openclaw.json: ${providers.join(', ') || 'ninguno'}`);
        
        // Verificar si hay apiKey hardcodeado
        let hasApiKeys = false;
        for (const providerName in content.models.providers) {
          if (content.models.providers[providerName].apiKey) {
            hasApiKeys = true;
            console.log(`   ⚠️  Provider "${providerName}" tiene apiKey hardcodeado`);
          }
        }
        if (!hasApiKeys) {
          console.log('   ✅ No hay apiKey hardcodeado en providers');
        }
      }
    } catch (err) {
      console.error('   ❌ Error leyendo archivo:', err.message);
    }
  } else {
    console.log('   ❌ Archivo NO existe');
  }
  
  // 4. Verificar permisos
  console.log('\n4️⃣ PERMISOS:');
  try {
    if (fs.existsSync(agentDir)) {
      const stats = fs.statSync(agentDir);
      console.log(`   Directorio: ${stats.mode.toString(8)} (${stats.mode})`);
    }
    if (fs.existsSync(authProfilesFile)) {
      const stats = fs.statSync(authProfilesFile);
      console.log(`   auth-profiles.json: ${stats.mode.toString(8)} (${stats.mode})`);
      console.log(`   ¿Puede escribir?: ${fs.constants.W_OK ? '✅' : '❌'}`);
    }
  } catch (err) {
    console.error('   ❌ Error verificando permisos:', err.message);
  }
  
  // 5. Resumen y recomendaciones
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 RESUMEN:');
  
  const hasEnabledCredentials = enabledCredentials && enabledCredentials.length > 0;
  const hasAuthProfilesFile = fs.existsSync(authProfilesFile);
  let authProfilesHasContent = false;
  if (hasAuthProfilesFile) {
    try {
      const content = JSON.parse(fs.readFileSync(authProfilesFile, 'utf8'));
      authProfilesHasContent = content.profiles && content.profiles.length > 0;
    } catch (e) {}
  }
  
  console.log(`   Credenciales habilitadas en MongoDB: ${hasEnabledCredentials ? '✅' : '❌'}`);
  console.log(`   auth-profiles.json existe: ${hasAuthProfilesFile ? '✅' : '❌'}`);
  console.log(`   auth-profiles.json tiene contenido: ${authProfilesHasContent ? '✅' : '❌'}`);
  
  console.log('\n💡 RECOMENDACIONES:');
  if (!hasEnabledCredentials) {
    console.log('   ⚠️  No hay credenciales habilitadas en MongoDB. Agrega una credencial desde la UI.');
  }
  if (!hasAuthProfilesFile || !authProfilesHasContent) {
    console.log('   ⚠️  El archivo auth-profiles.json no existe o está vacío.');
    console.log('   💡 Ejecuta la sincronización manual desde la UI o ejecuta:');
    console.log('      docker compose exec config-service node /app/scripts/force-sync.js');
  }
  
  await mongoose.disconnect();
  console.log('\n✅ Diagnóstico completado\n');
}

diagnose().catch(err => {
  console.error('\n❌ Error en diagnóstico:', err.message);
  console.error(err.stack);
  process.exit(1);
});
