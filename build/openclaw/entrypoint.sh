#!/usr/bin/env sh
# Inyecta OPENCLAW_GATEWAY_TOKEN en openclaw.json (gateway.auth y gateway.remote)
# Configura modelo por defecto desde MongoDB antes de iniciar OpenClaw

CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-/home/node/.openclaw}"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"
TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

# Asegurar permisos del directorio
if [ -d "$CONFIG_DIR" ]; then
  chown -R node:node "$CONFIG_DIR" 2>/dev/null || true
  chmod -R 755 "$CONFIG_DIR" 2>/dev/null || true
fi

# Inyectar token si está definido
if [ -n "$TOKEN" ]; then
  if [ ! -d "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
  fi
  if [ ! -f "$CONFIG_FILE" ]; then
    echo '{}' > "$CONFIG_FILE"
  fi
  
  if [ -f /app/inject-token.cjs ]; then
    CONFIG_FILE="$CONFIG_FILE" OPENCLAW_GATEWAY_TOKEN="$TOKEN" node /app/inject-token.cjs
  fi
fi

# Sincronizar API keys desde MongoDB a auth-profiles.json
if [ -n "$MONGO_URI" ] && [ -n "$ENCRYPTION_KEY" ] && [ -f /app/sync-auth-profiles.cjs ]; then
  echo "Sincronizando credenciales desde MongoDB..." >&2
  AGENT_DIR="/home/node/.openclaw/agents/main/agent"
  mkdir -p "$AGENT_DIR"
  chown -R node:node "$AGENT_DIR" 2>/dev/null || true
  chmod -R 755 "$AGENT_DIR" 2>/dev/null || true

  # SEGURIDAD CRÍTICA: Copiar agent.json si existe en el workspace
  # Esto asegura que las configuraciones de seguridad (tools forbidden) se apliquen
  WORKSPACE_AGENT_FILE="/home/node/.openclaw/workspace/agents/main/agent/agent.json"
  CONFIG_AGENT_FILE="/home/node/.openclaw/agents/main/agent/agent.json"
  if [ -f "$WORKSPACE_AGENT_FILE" ]; then
    echo "⚠️  Aplicando configuración de seguridad desde workspace..." >&2
    cp "$WORKSPACE_AGENT_FILE" "$CONFIG_AGENT_FILE" 2>/dev/null || true
    chown node:node "$CONFIG_AGENT_FILE" 2>/dev/null || true
    chmod 644 "$CONFIG_AGENT_FILE" 2>/dev/null || true
  fi
  
  AGENT_DIR="$AGENT_DIR" \
    OPENCLAW_CONFIG_DIR="/home/node/.openclaw" \
    MONGO_URI="$MONGO_URI" \
    ENCRYPTION_KEY="$ENCRYPTION_KEY" \
    node /app/sync-auth-profiles.cjs || {
    echo "⚠️  Error sincronizando credenciales (continuando)" >&2
  }
  
  if [ -f "/home/node/.openclaw/agents/main/agent/auth-profiles.json" ]; then
    chown node:node "/home/node/.openclaw/agents/main/agent/auth-profiles.json" 2>/dev/null || true
    chmod 644 "/home/node/.openclaw/agents/main/agent/auth-profiles.json" 2>/dev/null || true
  fi
  
  # CRÍTICO: Generar variables de entorno con las API keys
  # OpenClaw lee las credenciales desde variables de entorno: {PROVIDER}_API_KEY
  echo "Generando variables de entorno con API keys..." >&2
  ENV_FILE="/home/node/.openclaw/.env"
  if [ -f /app/generate-env-from-mongo.cjs ]; then
    MONGO_URI="$MONGO_URI" \
      ENCRYPTION_KEY="$ENCRYPTION_KEY" \
      node /app/generate-env-from-mongo.cjs > "$ENV_FILE" 2>/dev/null || {
      echo "⚠️  Error generando variables de entorno (continuando)" >&2
    }
    
    if [ -f "$ENV_FILE" ]; then
      chown node:node "$ENV_FILE" 2>/dev/null || true
      chmod 600 "$ENV_FILE" 2>/dev/null || true
      echo "✅ Variables de entorno generadas en $ENV_FILE" >&2
      # Cargar las variables de entorno para este proceso
      set -a
      . "$ENV_FILE" 2>/dev/null || true
      set +a
    fi
  fi
fi

# Asegurar que openclaw.json existe
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Creando openclaw.json mínimo..." >&2
  node -e "
    const fs = require('fs');
    const path = '$CONFIG_FILE';
    const config = {
      gateway: {
        mode: 'local',
        auth: { mode: 'token', token: '$TOKEN' },
        remote: { token: '$TOKEN' },
        trustedProxies: ['172.16.0.0/12', '10.0.0.0/8']
      },
      agents: {
        defaults: {
          model: {
            primary: 'minimax/MiniMax-M2.1'
          }
        }
      }
    };
    if ('$OPENCLAW_ALLOW_INSECURE_AUTH' === 'true') {
      config.gateway.controlUi = { allowInsecureAuth: true };
    }
    fs.writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
  "
fi

# Verificar y corregir gateway.mode
GATEWAY_MODE=$(node -e "try { const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8')); console.log(c.gateway?.mode || 'missing'); } catch(e) { console.log('error'); }" 2>/dev/null)
if [ "$GATEWAY_MODE" != "local" ]; then
  echo "Corrigiendo gateway.mode a 'local'..." >&2
  node -e "
    const fs = require('fs');
    const path = '$CONFIG_FILE';
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    config.gateway = config.gateway || {};
    config.gateway.mode = 'local';
    if (!config.gateway.auth) config.gateway.auth = { mode: 'token', token: '$TOKEN' };
    if (!config.gateway.remote) config.gateway.remote = { token: '$TOKEN' };
    if (!config.gateway.trustedProxies) config.gateway.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8'];
    fs.writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
  "
fi

# Configurar modelo desde MongoDB (o fallback)
echo "Configurando modelo por defecto..." >&2
CONFIG_FILE="$CONFIG_FILE" MONGO_URI="$MONGO_URI" ENCRYPTION_KEY="$ENCRYPTION_KEY" node -e "
  const fs = require('fs');
  const mongoose = require('mongoose');
  const path = process.env.CONFIG_FILE;
  const mongoUri = process.env.MONGO_URI;
  
  let config = JSON.parse(fs.readFileSync(path, 'utf8'));
  
  async function setModel() {
    let defaultModel = null;
    
    // Leer desde MongoDB
    if (mongoUri) {
      try {
        await mongoose.connect(mongoUri);
        const ConfigModel = mongoose.model('Config', new mongoose.Schema(
          { key: String, value: mongoose.Schema.Types.Mixed },
          { collection: 'app_config' }
        ));
        const modelConfig = await ConfigModel.findOne({ key: 'defaultAgentModel' }).lean();
        if (modelConfig?.value) {
          defaultModel = modelConfig.value;
          console.log('✅ Modelo desde MongoDB:', defaultModel);
        }
        await mongoose.disconnect();
      } catch (err) {
        console.log('⚠️  No se pudo leer desde MongoDB:', err.message);
      }
    }
    
    // Fallback si no hay modelo configurado
    if (!defaultModel) {
      defaultModel = 'minimax/MiniMax-M2.1';
      console.log('✅ Usando fallback:', defaultModel);
    }
    
    // Configurar modelo en openclaw.json
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    
    const currentModel = config.agents.defaults.model.primary;
    if (!currentModel || currentModel === 'anthropic/claude-opus-4-6' || currentModel.startsWith('anthropic/')) {
      config.agents.defaults.model.primary = defaultModel;
      console.log('✅ Modelo configurado:', currentModel || 'undefined', '→', defaultModel);
    } else {
      console.log('✅ Modelo ya configurado:', currentModel);
    }
    
    fs.writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
    const fd = fs.openSync(path, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    // Verificar
    const verify = JSON.parse(fs.readFileSync(path, 'utf8'));
    const finalModel = verify.agents?.defaults?.model?.primary;
    if (!finalModel || finalModel === 'anthropic/claude-opus-4-6' || finalModel.startsWith('anthropic/')) {
      console.error('❌ ERROR: Modelo no configurado correctamente:', finalModel);
      process.exit(1);
    }
    console.log('✅ Modelo final:', finalModel);
  }
  
  setModel().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
" 2>&1

# Asegurar permisos finales
chown -R node:node "$CONFIG_DIR" 2>/dev/null || true
chmod -R 755 "$CONFIG_DIR" 2>/dev/null || true

# Función para cargar archivo .env y exportar variables
load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    # Leer el archivo línea por línea y exportar variables
    while IFS= read -r line || [ -n "$line" ]; do
      # Ignorar comentarios y líneas vacías
      case "$line" in
        \#*|'') continue ;;
      esac
      # Extraer nombre y valor de la variable
      # Formato esperado: export KEY="value" o KEY=value
      if echo "$line" | grep -q "^export "; then
        # Remover 'export ' y evaluar la línea
        var_def="${line#export }"
        var_name="${var_def%%=*}"
        var_value="${var_def#*=}"
        # Remover comillas si existen
        var_value="${var_value%\"}"
        var_value="${var_value#\"}"
        export "$var_name=$var_value"
      fi
    done < "$env_file"
  fi
}

# Función para cargar archivo .env y exportar variables
load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    # Leer el archivo línea por línea y exportar variables
    while IFS= read -r line || [ -n "$line" ]; do
      # Ignorar comentarios y líneas vacías
      case "$line" in
        \#*|'') continue ;;
      esac
      # Extraer nombre y valor de la variable
      # Formato esperado: export KEY="value" o KEY=value
      if echo "$line" | grep -q "^export "; then
        # Remover 'export ' y evaluar la línea
        var_def="${line#export }"
        var_name="${var_def%%=*}"
        var_value="${var_def#*=}"
        # Remover comillas si existen
        var_value="${var_value%\"}"
        var_value="${var_value#\"}"
        export "$var_name=$var_value"
      fi
    done < "$env_file"
  fi
}

# Cambiar al usuario node y ejecutar OpenClaw
if [ "$(id -u)" = "0" ]; then
  echo "Cambiando al usuario node para ejecutar gateway..." >&2

  # Crear script wrapper que cargará las variables de entorno como usuario node
  cat > /tmp/gateway-wrapper.sh << 'WRAPPER_EOF'
#!/bin/sh
# Función para cargar archivo .env y exportar variables
load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    # Leer el archivo línea por línea y exportar variables
    while IFS= read -r line || [ -n "$line" ]; do
      # Ignorar comentarios y líneas vacías
      case "$line" in
        \#*|'') continue ;;
      esac
      # Extraer nombre y valor de la variable
      # Formato esperado: export KEY="value" o KEY=value
      if echo "$line" | grep -q "^export "; then
        # Remover 'export ' y evaluar la línea
        var_def="${line#export }"
        var_name="${var_def%%=*}"
        var_value="${var_def#*=}"
        # Remover comillas si existen
        var_value="${var_value%\"}"
        var_value="${var_value#\"}"
        export "$var_name=$var_value"
      fi
    done < "$env_file"
  fi
}

# Cargar variables de entorno como usuario node
load_env_file "/home/node/.openclaw/.env" && echo "✅ Variables de entorno de API keys cargadas" >&2 || true
load_env_file "/home/node/.openclaw/integrations.env" && echo "✅ Variables de entorno de integraciones cargadas" >&2 || true

# Debug: verificar que TELEGRAM_BOT_TOKEN está disponible
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  echo "✅ TELEGRAM_BOT_TOKEN está disponible (longitud: ${#TELEGRAM_BOT_TOKEN})" >&2
else
  echo "⚠️  TELEGRAM_BOT_TOKEN NO está disponible" >&2
fi

# Ejecutar el comando con las variables de entorno cargadas
exec "$@"
WRAPPER_EOF

  chmod +x /tmp/gateway-wrapper.sh
  chown node:node /tmp/gateway-wrapper.sh

  # Ejecutar gateway usando el wrapper
  exec gosu node /tmp/gateway-wrapper.sh "$@"
else
  exec "$@"
fi
