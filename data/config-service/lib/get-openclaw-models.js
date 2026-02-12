/**
 * Obtiene modelos desde OpenClaw parseando el comando 'openclaw models list'
 * Esto evita hardcodear modelos y no requiere ejecutar Node dentro del contenedor
 */

const { execSync } = require('child_process');

/**
 * Obtiene todos los modelos disponibles desde OpenClaw
 * Parsea la salida del comando 'openclaw models list'
 * @returns {Promise<Object>} Modelos agrupados por provider, o null si hay error
 */
async function getModelsFromOpenClawCatalog() {
  const containerName = process.env.OPENCLAW_CONTAINER_NAME || 'molbot-openclaw-gateway';

  try {
    console.log('[getModelsFromOpenClawCatalog] 🔄 Obteniendo modelos desde OpenClaw...');

    // Ejecutar comando 'openclaw models list' y parsear la salida
    const cmd = `docker exec ${containerName} openclaw models list`;

    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15000 // 15 segundos
    });

    // Parsear la salida tabular
    const lines = stdout.trim().split('\n');

    // La primera línea es el header
    const headerLine = lines[0];
    if (!headerLine || !headerLine.includes('Model')) {
      console.error('[getModelsFromOpenClawCatalog] ❌ Salida inválida: no se encontró header');
      return null;
    }

    // Obtener índices de columnas buscando los encabezados
    const modelIdx = headerLine.indexOf('Model');
    const tagsIdx = headerLine.lastIndexOf('Tags');

    if (modelIdx === -1) {
      console.error('[getModelsFromOpenClawCatalog] ❌ No se encontró columna Model');
      return null;
    }

    // Parsear cada línea de datos (empezar desde línea 1, saltar líneas vacías)
    const models = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Extraer el model key (primera columna hasta los espacios)
      const modelKey = line.substring(0, line.indexOf('  ')).trim();

      // El formato esperado es "provider/model-id"
      const parts = modelKey.split('/');
      if (parts.length !== 2) continue;

      const provider = parts[0];
      const modelId = parts[1];

      // Obtener tags si existen (para determinar si el modelo está disponible)
      let isMissing = false;
      if (tagsIdx > 0) {
        const tagsPart = line.substring(tagsIdx).trim();
        isMissing = tagsPart.includes('missing');
      }

      models.push({
        key: modelKey,
        provider: provider,
        id: modelId,
        name: modelId,
        available: !isMissing
      });
    }

    if (models.length === 0) {
      console.log('[getModelsFromOpenClawCatalog] ⚠️  No se encontraron modelos');
      return {};
    }

    // Agrupar por provider
    const grouped = {};
    for (const model of models) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }

      // Formatear nombre capitalizando
      const formattedName = model.name.split('-').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('-');

      grouped[model.provider].push({
        id: model.key,
        name: formattedName
      });
    }

    console.log(`[getModelsFromOpenClawCatalog] ✅ Obtenidos ${models.length} modelos de ${Object.keys(grouped).length} providers`);
    return grouped;

  } catch (error) {
    console.error('[getModelsFromOpenClawCatalog] ❌ Error:', error.message);

    // Diferenciar tipos de error para mejor manejo
    if (error.message.includes('command not found') || error.message.includes('executable file not found')) {
      console.error('[getModelsFromOpenClawCatalog] ❌ Docker o comando openclaw no encontrado');
    } else if (error.message.includes('container') || error.message.includes('running')) {
      console.error('[getModelsFromOpenClawCatalog] ❌ Error accediendo al contenedor de OpenClaw');
    } else if (error.killed) {
      console.error('[getModelsFromOpenClawCatalog] ❌ Timeout ejecutando openclaw models list');
    }

    return null;
  }
}

module.exports = { getModelsFromOpenClawCatalog };
