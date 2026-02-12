const fs = require('fs');
const pathModule = require('path');
let path = process.env.CONFIG_FILE;
const token = process.env.OPENCLAW_GATEWAY_TOKEN;

// Asegurar que siempre usamos ruta absoluta
if (path && !pathModule.isAbsolute(path)) {
  path = pathModule.resolve(path);
}

if (!path) {
  console.error('CONFIG_FILE no está definido');
  process.exit(1);
}

if (!token) {
  console.error('OPENCLAW_GATEWAY_TOKEN no está definido');
  process.exit(1);
}

let config = {};
try {
  config = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (err) {
  console.error('Error leyendo config:', err.message);
  process.exit(1);
}

config.gateway = config.gateway || {};
config.gateway.mode = 'local'; // Forzar modo local explícitamente
config.gateway.auth = { ...config.gateway.auth, mode: 'token', token };
config.gateway.remote = { ...config.gateway.remote, token };
config.gateway.trustedProxies = config.gateway.trustedProxies || ['172.16.0.0/12', '10.0.0.0/8'];

// NOTA: El modelo por defecto se configura desde MongoDB (app_config.defaultAgentModel)
// vía entrypoint.sh, no se establece ningún fallback aquí
if (!config.agents) {
  config.agents = {};
}
if (!config.agents.defaults) {
  config.agents.defaults = {};
}
if (!config.agents.defaults.model) {
  config.agents.defaults.model = {};
}
// No establecer modelo aquí - se configura desde MongoDB en entrypoint.sh
if (config.agents.defaults.model.primary) {
  console.log('✅ Modelo ya configurado:', config.agents.defaults.model.primary);
} else {
  console.log('⚠️  Modelo no configurado - se establecerá desde MongoDB (admin/config)');
}
// allowInsecureAuth: solo activar en desarrollo. En producción, deshabilitar y usar pairing de dispositivos.
// Variable de entorno: OPENCLAW_ALLOW_INSECURE_AUTH=true (por defecto: false en producción)
const allowInsecureAuth = process.env.OPENCLAW_ALLOW_INSECURE_AUTH === 'true';
if (allowInsecureAuth) {
  config.gateway.controlUi = config.gateway.controlUi || {};
  config.gateway.controlUi.allowInsecureAuth = true;
  console.log('⚠️  allowInsecureAuth activado (solo para desarrollo)');
} else {
  // Asegurar que no esté activado si no se especifica explícitamente
  if (config.gateway.controlUi && config.gateway.controlUi.allowInsecureAuth) {
    delete config.gateway.controlUi.allowInsecureAuth;
    if (Object.keys(config.gateway.controlUi).length === 0) {
      delete config.gateway.controlUi;
    }
  }
}

// Asegurar estructura de agents pero NO sobreescribir el modelo
// El modelo se configura desde MongoDB (entrypoint.sh)
if (!config.agents) config.agents = {};
if (!config.agents.defaults) config.agents.defaults = {};
if (!config.agents.defaults.model) config.agents.defaults.model = {};

fs.writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');

// Forzar sincronización del archivo al disco
const fd = fs.openSync(path, 'r+');
fs.fsyncSync(fd);
fs.closeSync(fd);

// Verificar que el archivo existe y es válido
if (!fs.existsSync(path)) {
  console.error(`ERROR: openclaw.json no existe después de escribir: ${path}`);
  process.exit(1);
}

const verifyConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!verifyConfig.gateway || verifyConfig.gateway.mode !== 'local') {
  console.error(`ERROR: gateway.mode no está configurado como 'local'`);
  process.exit(1);
}

// Asegurar que siempre mostramos la ruta absoluta en los logs
const absolutePath = pathModule.isAbsolute(path) ? path : pathModule.resolve(path);
console.log('✅ Token inyectado correctamente en', absolutePath);
console.log('✅ Configuración verificada:', JSON.stringify(config.gateway, null, 2));
