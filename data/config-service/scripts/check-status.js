#!/usr/bin/env node
/**
 * Verifica el estado de la sincronización
 */

const fs = require('fs');
const path = require('path');

const agentDir = '/home/node/.openclaw/agents/main/agent';
const openclawJsonPath = '/home/node/.openclaw/openclaw.json';

console.log('📋 Verificando estado de sincronización...\n');

// Verificar auth-profiles.json
const authProfilesFile = path.join(agentDir, 'auth-profiles.json');
if (fs.existsSync(authProfilesFile)) {
  const authProfiles = JSON.parse(fs.readFileSync(authProfilesFile, 'utf8'));
  console.log('✅ auth-profiles.json existe');
  console.log(`   Profiles: ${authProfiles.profiles.length}`);
  authProfiles.profiles.forEach(p => {
    console.log(`   - ${p.provider}: ${p.apiKey ? '✅ API key presente' : '❌ Sin API key'}`);
  });
} else {
  console.log('❌ auth-profiles.json NO existe');
}

console.log('');

// Verificar models.json
const modelsFile = path.join(agentDir, 'models.json');
if (fs.existsSync(modelsFile)) {
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  console.log('✅ models.json existe');
  const providers = Object.keys(models.providers || {});
  console.log(`   Providers: ${providers.join(', ') || 'ninguno'}`);
} else {
  console.log('❌ models.json NO existe');
}

console.log('');

// Verificar openclaw.json
if (fs.existsSync(openclawJsonPath)) {
  const openclaw = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
  console.log('✅ openclaw.json existe');
  
  if (openclaw.models?.providers) {
    const providers = Object.keys(openclaw.models.providers);
    console.log(`   Providers en openclaw.json: ${providers.join(', ') || 'ninguno'}`);
    
    // Verificar si hay apiKey hardcodeado
    let hasApiKeys = false;
    for (const providerName in openclaw.models.providers) {
      if (openclaw.models.providers[providerName].apiKey) {
        hasApiKeys = true;
        console.log(`   ⚠️  Provider "${providerName}" tiene apiKey hardcodeado`);
      }
    }
    if (!hasApiKeys) {
      console.log('   ✅ No hay apiKey hardcodeado en providers');
    }
  } else {
    console.log('   ⚠️  No hay sección models.providers');
  }
} else {
  console.log('❌ openclaw.json NO existe');
}

console.log('');
