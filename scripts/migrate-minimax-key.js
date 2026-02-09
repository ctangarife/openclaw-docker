#!/usr/bin/env node
/**
 * Migra el API key de minimax desde openclaw.json al sistema de credenciales de MongoDB
 * y sincroniza con auth-profiles.json
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { encrypt } = require("../data/config-service/lib/encrypt");
const { syncAuthProfiles } = require("../data/config-service/lib/sync-openclaw-auth");

const OPENCLAW_CONFIG_DIR = process.env.OPENCLAW_CONFIG_DIR || "./data/molbot-workspace";
const OPENCLAW_JSON = path.join(OPENCLAW_CONFIG_DIR, "openclaw.json");
const AGENT_DIR = process.env.OPENCLAW_AGENT_DIR || path.join(OPENCLAW_CONFIG_DIR, "agents/main/agent");

// Schema de credenciales
const schema = new mongoose.Schema(
  {
    provider: String,
    name: String,
    tokenEncrypted: String,
    enabled: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "api_credentials" }
);

async function migrateMinimaxKey() {
  try {
    // 1. Leer openclaw.json
    if (!fs.existsSync(OPENCLAW_JSON)) {
      console.error(`❌ No se encontró ${OPENCLAW_JSON}`);
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf8"));
    const minimaxApiKey = config?.agents?.models?.minimax?.apiKey;

    if (!minimaxApiKey) {
      console.log("ℹ️  No se encontró API key de minimax en openclaw.json");
      console.log("   El API key ya puede estar en el sistema de credenciales o no estar configurado.");
      process.exit(0);
    }

    console.log("✅ API key de minimax encontrado en openclaw.json");

    // 2. Conectar a MongoDB
    const uri =
      process.env.MONGO_URI ||
      (process.env.MONGO_PASSWORD &&
        `mongodb://${encodeURIComponent(process.env.MONGO_INITDB_ROOT_USERNAME || "root")}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST || "mongodb"}:27017/${process.env.MONGO_DB || "molbot"}?authSource=admin`);

    if (!uri) {
      console.error("❌ MONGO_URI o MONGO_PASSWORD es requerido");
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log("✅ Conectado a MongoDB");

    const Credential = mongoose.models.Credential || mongoose.model("Credential", schema);

    // 3. Verificar si ya existe una credencial de minimax
    const existing = await Credential.findOne({ provider: "minimax" });
    if (existing) {
      console.log("⚠️  Ya existe una credencial de minimax en MongoDB");
      console.log(`   ID: ${existing._id}`);
      console.log(`   Nombre: ${existing.name}`);
      console.log(`   Habilitada: ${existing.enabled}`);
      
      const update = confirm("¿Deseas actualizar la credencial existente con el API key de openclaw.json? (s/n): ");
      if (!update) {
        console.log("❌ Migración cancelada");
        await mongoose.disconnect();
        process.exit(0);
      }

      // Actualizar credencial existente
      existing.tokenEncrypted = encrypt(minimaxApiKey);
      existing.enabled = true;
      await existing.save();
      console.log("✅ Credencial de minimax actualizada");
    } else {
      // 4. Crear nueva credencial en MongoDB
      const tokenEncrypted = encrypt(minimaxApiKey);
      const credential = await Credential.create({
        provider: "minimax",
        name: "MiniMax M2.1",
        tokenEncrypted,
        enabled: true,
      });
      console.log(`✅ Credencial de minimax creada en MongoDB (ID: ${credential._id})`);
    }

    // 5. Sincronizar con auth-profiles.json
    console.log("🔄 Sincronizando con auth-profiles.json...");
    const syncResult = await syncAuthProfiles(AGENT_DIR);
    
    if (syncResult.success) {
      console.log(`✅ Sincronización exitosa`);
      console.log(`   Archivo: ${syncResult.file}`);
      console.log(`   Proveedores sincronizados: ${syncResult.profiles.join(", ")}`);
    } else {
      console.error(`❌ Error en sincronización: ${syncResult.error}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // 6. Limpiar openclaw.json (remover apiKey de models.minimax)
    if (config.agents?.models?.minimax?.apiKey) {
      delete config.agents.models.minimax.apiKey;
      // Si models.minimax queda vacío, eliminarlo también
      if (Object.keys(config.agents.models.minimax).length === 0) {
        delete config.agents.models.minimax;
      }
      
      fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(config, null, 2), "utf8");
      console.log("✅ API key removido de openclaw.json");
    }

    await mongoose.disconnect();
    console.log("\n✅ Migración completada exitosamente!");
    console.log("   El API key de minimax ahora está en el sistema de credenciales");
    console.log("   y se sincroniza automáticamente con auth-profiles.json");
  } catch (err) {
    console.error("❌ Error durante la migración:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Función helper para confirmación
function confirm(message) {
  // En un script automatizado, asumimos que queremos actualizar si ya existe
  // Para hacerlo interactivo, usar readline o inquirer
  return true;
}

migrateMinimaxKey();
