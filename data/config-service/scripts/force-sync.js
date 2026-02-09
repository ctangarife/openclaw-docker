#!/usr/bin/env node
/**
 * Fuerza la sincronización desde MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { syncAuthProfiles } = require('../lib/sync-openclaw-auth');

const agentDir = '/home/node/.openclaw/agents/main/agent';
const openclawJsonPath = '/home/node/.openclaw/openclaw.json';

async function forceSync() {
  try {
    // Conectar a MongoDB primero
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB\n');
    
    console.log('🔄 Sincronizando desde MongoDB...\n');
    const result = await syncAuthProfiles(agentDir, openclawJsonPath);
    
    console.log('\n📊 Resultado:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ Sincronización exitosa!');
      console.log(`   - auth-profiles.json: ${result.file}`);
      console.log(`   - models.json: ${result.modelsFile}`);
      console.log(`   - Providers: ${result.profiles.join(', ')}`);
      if (result.providersSynced && result.providersSynced.length > 0) {
        console.log(`   - Providers sincronizados en openclaw.json: ${result.providersSynced.join(', ')}`);
      }
    } else {
      console.error('\n❌ Error:', result.error);
    }
    
    await mongoose.disconnect();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

forceSync();
