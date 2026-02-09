/**
 * Health checks detallados para el sistema
 * Verifica el estado de todos los componentes críticos
 */

const mongoose = require('mongoose');

/**
 * Verifica la conexión a MongoDB
 */
async function checkMongoDB() {
  const startTime = Date.now();

  try {
    // Verificar que mongoose está conectado
    if (mongoose.connection.readyState !== 1) {
      return {
        status: 'unhealthy',
        message: `MongoDB no conectado (estado: ${mongoose.connection.readyState})`,
        latency: 0
      };
    }

    // Hacer una operación simple para verificar latencia
    await mongoose.connection.db.admin().ping();
    const latency = Date.now() - startTime;

    return {
      status: 'healthy',
      message: 'MongoDB conectado',
      latency,
      database: mongoose.connection.name,
      host: mongoose.connection.host
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      latency: Date.now() - startTime,
      error: error.toString()
    };
  }
}

/**
 * Verifica la conexión al OpenClaw Gateway
 */
async function checkOpenClawGateway() {
  const startTime = Date.now();

  try {
    const openclawUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://openclaw-gateway:18789';
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;

    if (!token) {
      return {
        status: 'unhealthy',
        message: 'OPENCLAW_GATEWAY_TOKEN no configurado',
        latency: 0
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${openclawUrl}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        status: 'healthy',
        message: 'OpenClaw Gateway accesible',
        latency,
        url: openclawUrl
      };
    }

    return {
      status: 'unhealthy',
      message: `Gateway respondió con ${response.status}`,
      latency,
      statusCode: response.status
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.name === 'AbortError' ? 'Timeout después de 5s' : error.message,
      latency: Date.now() - startTime,
      error: error.toString()
    };
  }
}

/**
 * Obtiene estadísticas de credenciales
 */
async function checkCredentials() {
  try {
    const Credential = mongoose.models.Credential || mongoose.model('Credential',
      new mongoose.Schema({
        provider: String,
        enabled: { type: Boolean, default: true }
      }, { collection: 'api_credentials' })
    );

    const total = await Credential.countDocuments();
    const enabled = await Credential.countDocuments({ enabled: true });
    const disabled = total - enabled;

    // Obtener providers habilitados
    const enabledCredentials = await Credential.find({ enabled: true }).lean();
    const enabledProviders = [...new Set(enabledCredentials.map(c => c.provider))];

    // Última credencial creada/actualizada
    const lastUpdate = await Credential.findOne()
      .sort({ updatedAt: -1 })
      .select('updatedAt')
      .lean();

    return {
      status: total > 0 ? 'healthy' : 'warning',
      total,
      enabled,
      disabled,
      enabledProviders,
      lastUpdate: lastUpdate?.updatedAt,
      message: total > 0
        ? `${enabled} credencial(es) habilitada(s) de ${total} total`
        : 'No hay credenciales configuradas'
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      error: error.toString()
    };
  }
}

/**
 * Verifica el estado de sincronización con OpenClaw
 */
async function checkSyncStatus() {
  try {
    const fs = require('fs');
    const path = require('path');

    const agentDir = process.env.OPENCLAW_AGENT_DIR || '/home/node/.openclaw/agents/main/agent';
    const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
    const modelsJsonPath = path.join(agentDir, 'models.json');

    const checks = {
      authProfilesExists: false,
      authProfilesProfiles: 0,
      modelsJsonExists: false,
      modelsJsonModels: 0
    };

    // Verificar auth-profiles.json
    try {
      if (fs.existsSync(authProfilesPath)) {
        const authProfiles = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
        checks.authProfilesExists = true;
        checks.authProfilesProfiles = authProfiles.profiles?.length || 0;
        checks.authProfilesLastModified = fs.statSync(authProfilesPath).mtime;
      }
    } catch (err) {
      checks.authProfilesError = err.message;
    }

    // Verificar models.json
    try {
      if (fs.existsSync(modelsJsonPath)) {
        const modelsJson = JSON.parse(fs.readFileSync(modelsJsonPath, 'utf8'));
        checks.modelsJsonExists = true;
        // Contar modelos en providers
        let modelCount = 0;
        if (modelsJson.providers) {
          for (const provider of Object.values(modelsJson.providers)) {
            if (provider.models) {
              modelCount += provider.models.length;
            }
          }
        }
        checks.modelsJsonModels = modelCount;
        checks.modelsJsonLastModified = fs.statSync(modelsJsonPath).mtime;
      }
    } catch (err) {
      checks.modelsJsonError = err.message;
    }

    // Determinar estado general
    const allExist = checks.authProfilesExists && checks.modelsJsonExists;
    const hasProfiles = checks.authProfilesProfiles > 0;

    let status = 'healthy';
    let message = 'Sincronización OK';

    if (!allExist) {
      status = 'unhealthy';
      message = 'Archivos de sincronización faltantes';
    } else if (!hasProfiles) {
      status = 'warning';
      message = 'Sincronizado pero sin credenciales';
    }

    return {
      status,
      message,
      ...checks
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      error: error.toString()
    };
  }
}

/**
 * Health check principal que verifica todos los componentes
 */
async function getSystemHealth() {
  const startTime = Date.now();

  // Ejecutar todos los checks en paralelo
  const [mongodb, gateway, credentials, sync] = await Promise.allSettled([
    checkMongoDB(),
    checkOpenClawGateway(),
    checkCredentials(),
    checkSyncStatus()
  ]);

  const results = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    overall: 'healthy',
    checks: {
      mongodb: mongodb.status === 'fulfilled' ? mongodb.value : { status: 'error', error: mongodb.reason?.message },
      gateway: gateway.status === 'fulfilled' ? gateway.value : { status: 'error', error: gateway.reason?.message },
      credentials: credentials.status === 'fulfilled' ? credentials.value : { status: 'error', error: credentials.reason?.message },
      sync: sync.status === 'fulfilled' ? sync.value : { status: 'error', error: sync.reason?.message }
    },
    totalLatency: Date.now() - startTime
  };

  // Determinar estado general
  const checkValues = Object.values(results.checks);
  const hasUnhealthy = checkValues.some(c => c.status === 'unhealthy');
  const hasWarning = checkValues.some(c => c.status === 'warning');

  if (hasUnhealthy) {
    results.overall = 'unhealthy';
  } else if (hasWarning) {
    results.overall = 'warning';
  }

  return results;
}

/**
 * Health check simple para load balancers (solo statusCode)
 */
async function getSimpleHealth() {
  try {
    // Solo verificar MongoDB rápido
    if (mongoose.connection.readyState !== 1) {
      return { status: 'unhealthy' };
    }

    await mongoose.connection.db.admin().ping();
    return { status: 'healthy' };

  } catch {
    return { status: 'unhealthy' };
  }
}

module.exports = {
  getSystemHealth,
  getSimpleHealth,
  checkMongoDB,
  checkOpenClawGateway,
  checkCredentials,
  checkSyncStatus
};
