/**
 * Utilidades para ejecutar comandos Docker desde config-service
 * Permite reiniciar y ejecutar comandos en el contenedor de openclaw-gateway
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { retryRestart } = require('./retry');

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
 * Reinicia el contenedor de openclaw-gateway con reintentos automáticos
 * Wrapper sobre restartGateway que implementa retry con exponential backoff
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function restartGatewayWithRetry() {
  return retryRestart(
    () => restartGateway(),
    {
      onRetry: (attempt, error) => {
        console.log(`[restartGatewayWithRetry] Reintentando reinicio (intento ${attempt})`);
      }
    }
  );
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
  const args = [];

  if (user) {
    args.push('-u', user);
  }

  // Importante: el comando para sh -c debe ir entre comillas
  args.push(GATEWAY_CONTAINER, 'sh', '-c', `"${command}"`);

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

/**
 * Ejecuta comando de OpenClaw CLI para listar agentes
 * @returns {Promise<{success: boolean, agents?: Array, error?: string}>}
 */
async function listAgents() {
  const result = await execInGateway('openclaw agents list --json', { timeout: 15000 });

  // Debug logging
  console.log('[listAgents] result.success:', result.success);
  console.log('[listAgents] result.stdout length:', result.stdout?.length);
  console.log('[listAgents] result.stdout:', result.stdout?.substring(0, 200));

  // Considerar exitoso si hay stdout válido JSON, incluso si el exit code no es 0
  // (el bash puede retornar exit code 1 por errores de la shell, pero el comando funcionó)
  if (result.stdout && result.stdout.trim().length > 0) {
    try {
      // Limpiar el stdout: eliminar cualquier texto antes o después del array JSON
      let cleanStdout = result.stdout;
      const firstBracketIndex = cleanStdout.indexOf('[');
      const lastBracketIndex = cleanStdout.lastIndexOf(']');
      if (firstBracketIndex !== -1 && lastBracketIndex !== -1 && lastBracketIndex > firstBracketIndex) {
        cleanStdout = cleanStdout.substring(firstBracketIndex, lastBracketIndex + 1);
      }

      const agents = JSON.parse(cleanStdout);
      // Si es un array válido (incluso vacío), considerar exitoso
      if (Array.isArray(agents)) {
        console.log('[listAgents] Parsed agents count:', agents.length);
        return { success: true, agents };
      }
    } catch (e) {
      console.log('[listAgents] JSON parse error:', e.message);
      return { success: false, error: `Error parsing JSON: ${e.message}`, raw: result.stdout };
    }
  }

  console.log('[listAgents] No valid stdout found');
  return { success: false, error: result.error || 'Error listing agents', raw: result.stdout };
}

/**
 * Ejecuta comando de OpenClaw CLI para crear un agente
 * @param {string} agentId - ID del agente a crear
 * @param {object} options - Opciones adicionales (name, workspace, model, etc)
 * @returns {Promise<{success: boolean, agent?: object, error?: string}>}
 */
async function createAgent(agentId, options = {}) {
  const { name, workspace, model } = options;

  // Construir comando con flags opcionales
  // Sintaxis: openclaw agents add [--non-interactive] [--workspace <dir>] [--model <id>] <agentId>
  let cmd = 'openclaw agents add --json';

  if (workspace) {
    cmd += ' --non-interactive';
    // Siempre prependear /home/node/.openclaw/ al workspace
    // Remover cualquier prefijo ~/.openclaw/ o ~/ que el usuario haya ingresado
    let cleanWorkspace = workspace;
    if (cleanWorkspace.startsWith('~/.openclaw/')) {
      cleanWorkspace = cleanWorkspace.substring(12);
    } else if (cleanWorkspace.startsWith('~/')) {
      cleanWorkspace = cleanWorkspace.substring(2);
    }
    const expandedWorkspace = '/home/node/.openclaw/' + cleanWorkspace;
    cmd += ` --workspace ${expandedWorkspace}`;
  }
  if (model) {
    // No usar comillas (no hay espacios en los IDs de modelos)
    cmd += ` --model ${model}`;
  }

  // El agentId va al final como argumento posicional
  cmd += ` ${agentId}`;

  console.log(`[docker-utils] Creando agente: ${cmd}`);

  const result = await execInGateway(cmd, { timeout: 30000 });

  // Verificar si el comando funcionó (stdout contiene JSON válido con agentId)
  // El bash puede retornar exit code 1 pero el comando funcionó correctamente
  let commandSucceeded = result.success;

  if (!commandSucceeded && result.stdout) {
    try {
      const output = JSON.parse(result.stdout);
      if (output && output.agentId === agentId) {
        commandSucceeded = true;
        console.log(`[docker-utils] Agente creado exitosamente (detectado por stdout)`);
      }
    } catch (e) {
      // No es JSON válido, commandSucceeded permanece false
    }
  }

  if (commandSucceeded) {
    // Si se proporcionó un nombre, actualizar la identidad del agente
    if (name) {
      console.log(`[docker-utils] Actualizando identidad del agente ${agentId} a "${name}"`);
      const identityCmd = `openclaw agents set-identity ${agentId} --name ${name}`;
      const identityResult = await execInGateway(identityCmd, { timeout: 15000 });
      if (!identityResult.success) {
        console.warn(`[docker-utils] No se pudo actualizar el nombre: ${identityResult.stderr}`);
      }
    }

    // Obtener la lista actualizada para retornar el agente creado
    const listResult = await listAgents();
    if (listResult.success) {
      const createdAgent = listResult.agents.find(a => a.id === agentId);
      return { success: true, agent: createdAgent };
    }
    return { success: true };
  }

  return { success: false, error: result.error || 'Error creating agent', stderr: result.stderr };
}

/**
 * Ejecuta comando de OpenClaw CLI para eliminar un agente
 * @param {string} agentId - ID del agente a eliminar
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteAgent(agentId) {
  const result = await execInGateway(`openclaw agents delete --force ${agentId}`, { timeout: 15000 });

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error || 'Error deleting agent', stderr: result.stderr };
}

/**
 * Ejecuta comando de OpenClaw CLI para listar bindings
 * @returns {Promise<{success: boolean, bindings?: Array, error?: string}>}
 */
async function listBindings() {
  const result = await execInGateway('openclaw agents list --bindings --json', { timeout: 15000 });

  // Debug logging
  console.log('[listBindings] result.success:', result.success);
  console.log('[listBindings] result.stdout length:', result.stdout?.length);
  console.log('[listBindings] result.stdout:', result.stdout?.substring(0, 200));

  // Considerar exitoso si hay stdout válido JSON
  if (result.stdout && result.stdout.trim().length > 0) {
    try {
      // Limpiar el stdout: eliminar cualquier texto antes o después del array JSON
      let cleanStdout = result.stdout;
      const firstBracketIndex = cleanStdout.indexOf('[');
      const lastBracketIndex = cleanStdout.lastIndexOf(']');
      if (firstBracketIndex !== -1 && lastBracketIndex !== -1 && lastBracketIndex > firstBracketIndex) {
        cleanStdout = cleanStdout.substring(firstBracketIndex, lastBracketIndex + 1);
      }

      const bindings = JSON.parse(cleanStdout);
      if (Array.isArray(bindings)) {
        console.log('[listBindings] Parsed bindings count:', bindings.length);
        return { success: true, bindings };
      }
    } catch (e) {
      console.log('[listBindings] JSON parse error:', e.message);
      return { success: false, error: `Error parsing JSON: ${e.message}`, raw: result.stdout };
    }
  }

  console.log('[listBindings] No valid stdout found');
  return { success: false, error: result.error || 'Error listing bindings', raw: result.stdout };
}

/**
 * Obtiene información completa de agentes y bindings
 * @returns {Promise<{success: boolean, agents?: Array, bindings?: Array, error?: string}>}
 */
async function getAgentsInfo() {
  const agentsResult = await listAgents();
  const bindingsResult = await listBindings();

  return {
    success: agentsResult.success && bindingsResult.success,
    agents: agentsResult.agents || [],
    bindings: bindingsResult.bindings || [],
    error: (!agentsResult.success && agentsResult.error) || (!bindingsResult.success && bindingsResult.error) || undefined
  };
}

module.exports = {
  restartGateway,
  restartGatewayWithRetry,
  execInGateway,
  checkGatewayStatus,
  getGatewayLogs,
  checkDockerAvailable,
  dockerCommand,
  GATEWAY_CONTAINER,
  // OpenClaw agents functions
  listAgents,
  createAgent,
  deleteAgent,
  listBindings,
  getAgentsInfo
};
