/**
 * Utilidades para ejecutar comandos Docker desde config-service
 * Permite reiniciar y ejecutar comandos en el contenedor de openclaw-gateway
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const GATEWAY_CONTAINER = process.env.OPENCLAW_GATEWAY_CONTAINER || 'molbot-openclaw-gateway';

/**
 * Ejecuta un comando Docker directamente
 * @param {string} command - Comando Docker (ej: "restart", "exec", "logs")
 * @param {string[]} args - Argumentos adicionales
 * @param {object} options - Opciones (timeout, etc)
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>}
 */
async function dockerCommand(command, args = [], options = {}) {
  const timeout = options.timeout || 10000;
  const fullCommand = ['docker', command, ...args].join(' ');
  
  try {
    console.log(`[docker-utils] Ejecutando: ${fullCommand}`);
    const { stdout, stderr } = await execAsync(fullCommand, { timeout });
    
    return {
      success: true,
      stdout: stdout?.trim(),
      stderr: stderr?.trim()
    };
  } catch (err) {
    console.error(`[docker-utils] Error ejecutando "${fullCommand}":`, err.message);
    return {
      success: false,
      error: err.message,
      stdout: err.stdout?.trim(),
      stderr: err.stderr?.trim()
    };
  }
}

/**
 * Reinicia el contenedor de openclaw-gateway
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function restartGateway() {
  console.log(`[docker-utils] Reiniciando contenedor: ${GATEWAY_CONTAINER}`);
  
  const result = await dockerCommand('restart', [GATEWAY_CONTAINER], { timeout: 15000 });
  
  if (result.success) {
    console.log(`[docker-utils] ✅ Contenedor ${GATEWAY_CONTAINER} reiniciado exitosamente`);
    return {
      success: true,
      message: `Contenedor ${GATEWAY_CONTAINER} reiniciado exitosamente`
    };
  } else {
    console.error(`[docker-utils] ❌ Error reiniciando contenedor: ${result.error}`);
    return {
      success: false,
      error: result.error || 'Error desconocido al reiniciar contenedor'
    };
  }
}

/**
 * Ejecuta un comando dentro del contenedor de openclaw-gateway
 * @param {string} command - Comando a ejecutar dentro del contenedor
 * @param {object} options - Opciones (timeout, user, etc)
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>}
 */
async function execInGateway(command, options = {}) {
  const timeout = options.timeout || 30000;
  const user = options.user || 'node';
  const args = ['exec'];
  
  if (user) {
    args.push('-u', user);
  }
  
  args.push(GATEWAY_CONTAINER, 'sh', '-c', command);
  
  console.log(`[docker-utils] Ejecutando en ${GATEWAY_CONTAINER}: ${command}`);
  
  return await dockerCommand('exec', args, { timeout });
}

/**
 * Verifica el estado del contenedor de openclaw-gateway
 * @returns {Promise<{running: boolean, status?: string, error?: string}>}
 */
async function checkGatewayStatus() {
  const result = await dockerCommand('ps', ['--filter', `name=${GATEWAY_CONTAINER}`, '--format', '{{.Status}}']);
  
  if (result.success && result.stdout) {
    return {
      running: true,
      status: result.stdout
    };
  }
  
  // Verificar si existe pero no está corriendo
  const inspectResult = await dockerCommand('inspect', ['--format', '{{.State.Status}}', GATEWAY_CONTAINER]);
  
  if (inspectResult.success && inspectResult.stdout) {
    return {
      running: inspectResult.stdout === 'running',
      status: inspectResult.stdout
    };
  }
  
  return {
    running: false,
    error: 'Contenedor no encontrado'
  };
}

/**
 * Obtiene los logs del contenedor de openclaw-gateway
 * @param {number} lines - Número de líneas a obtener (default: 50)
 * @returns {Promise<{success: boolean, logs?: string, error?: string}>}
 */
async function getGatewayLogs(lines = 50) {
  const result = await dockerCommand('logs', ['--tail', lines.toString(), GATEWAY_CONTAINER], { timeout: 5000 });
  
  if (result.success) {
    return {
      success: true,
      logs: result.stdout
    };
  }
  
  return {
    success: false,
    error: result.error
  };
}

/**
 * Verifica que Docker esté disponible y accesible
 * @returns {Promise<{available: boolean, version?: string, error?: string}>}
 */
async function checkDockerAvailable() {
  const result = await dockerCommand('--version', [], { timeout: 5000 });
  
  if (result.success) {
    return {
      available: true,
      version: result.stdout
    };
  }
  
  return {
    available: false,
    error: result.error || 'Docker no disponible'
  };
}

module.exports = {
  restartGateway,
  execInGateway,
  checkGatewayStatus,
  getGatewayLogs,
  checkDockerAvailable,
  dockerCommand,
  GATEWAY_CONTAINER
};
