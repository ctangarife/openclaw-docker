# OpenClaw Gateway - Comandos de Contenedor

Guía de comandos para administrar el contenedor `molbot-openclaw-gateway`.

## Información del Contenedor

- **Nombre**: `molbot-openclaw-gateway`
- **Imagen**: Basada en OpenClaw oficial
- **Config**: `/home/node/.openclaw/` (volumen compartido con config-service)
- **Workspace**: `/home/node/.openclaw/workspace`

---

## Comandos Básicos

### Ver logs del contenedor
```bash
docker compose logs -f openclaw-gateway
```

### Ver logs recientes
```bash
docker compose logs --tail 100 openclaw-gateway
```

### Reiniciar el contenedor
```bash
docker compose restart openclaw-gateway
```

### Entrar al contenedor (shell interactivo)
```bash
docker exec -it molbot-openclaw-gateway sh
```

---

## Configuración y Archivos

### Ver archivo de configuración principal (openclaw.json)
```bash
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/openclaw.json
```

### Ver credenciales (auth-profiles.json)
```bash
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/agents/main/agent/auth-profiles.json
```

### Ver modelos disponibles (models.json)
```bash
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/agents/main/agent/models.json
```

### Ver variables de entorno del contenedor
```bash
docker exec molbot-openclaw-gateway env | grep OPENCLAW
```

---

## Comandos de OpenClaw CLI

El contenedor `openclaw-gateway` no incluye el CLI completo de OpenClaw (eso está en `openclaw-cli`).
Para operaciones CLI completas, usa el contenedor `openclaw-cli`:

### Ejecutar OpenClaw CLI (contenedor separado)
```bash
# Onboard/reconfigurar OpenClaw
docker compose --profile tools run --rm openclaw-cli onboard --no-install-daemon

# Acceder a la shell de OpenClaw
docker compose --profile tools run --rm openclaw-cli
```

---

## Verificación de Estado

### Verificar health del gateway
```bash
docker exec molbot-openclaw-gateway wget -O- http://localhost:18789/health
```

### Verificar conexión al API de modelos
```bash
docker exec molbot-openclaw-gateway wget -O- http://localhost:18789/v1/models
```

### Verificar proceso en ejecución
```bash
docker exec molbot-openclaw-gateway ps aux
```

---

## Sincronización Manual

El contenedor `openclaw-gateway` **lee** la configuración que `config-service` escribe.
Para sincronizar cambios manualmente:

### 1. Desde config-service (recomendado)
```bash
# Ejecutar sincronización desde config-service
docker exec -it molbot-config-service node -e "
const sync = require('./lib/sync-openclaw-auth');
sync.syncAuthProfiles(
  '/home/node/.openclaw/agents/main/agent',
  '/home/node/.openclaw/openclaw.json'
).then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error);
"
```

### 2. Verificar que se crearon los archivos
```bash
# Verificar auth-profiles.json
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/agents/main/agent/auth-profiles.json

# Verificar openclaw.json
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/openclaw.json
```

### 3. Reiniciar el gateway para aplicar cambios
```bash
docker compose restart openclaw-gateway
```

---

## Troubleshooting

### El gateway no inicia
```bash
# Ver logs detallados
docker compose logs --tail 200 openclaw-gateway

# Verificar que openclaw.json existe y es válido
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/openclaw.json

# Verificar que auth-profiles.json existe
docker exec molbot-openclaw-gateway ls -la /home/node/.openclaw/agents/main/agent/
```

### Error de autenticación
```bash
# Verificar que el token esté configurado
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/openclaw.json | grep token
```

### Las credenciales no se actualizan
```bash
# Forzar resincronización desde config-service
docker exec molbot-config-service node -e "
const sync = require('./lib/sync-openclaw-auth');
sync.syncAuthProfiles(
  '/home/node/.openclaw/agents/main/agent',
  '/home/node/.openclaw/openclaw.json'
).then(r => console.log('✅ Sincronizado:', r.profiles.length, 'credenciales')).catch(console.error);
"

# Luego reiniciar gateway
docker compose restart openclaw-gateway
```

### Verificar conectividad entre contenedores
```bash
# Desde config-service, verificar que puede alcanzar al gateway
docker exec molbot-config-service wget -O- http://openclaw-gateway:18789/health
```

---

## Variables de Entorno Importantes

El contenedor `openclaw-gateway` usa estas variables de entorno:

- `OPENCLAW_GATEWAY_TOKEN`: Token de autenticación del gateway
- `OPENCLAW_ALLOW_INSECURE_AUTH`: Permitir auth insegura (solo development)
- `OPENCLAW_DASHBOARD_PUBLIC_URL`: URL pública para el dashboard

Verificar valores:
```bash
docker exec molbot-openclaw-gateway printenv | grep OPENCLAW
```

---

## Estructura de Archivos

```
/home/node/.openclaw/
├── openclaw.json              # Configuración principal
├── agents/
│   └── main/
│       └── agent/
│           ├── auth-profiles.json  # Credenciales API
│           └── models.json         # Modelos disponibles
└── workspace/                 # Workspace del agente
    └── (mounted from host: ./data/molbot-workspace/workspace)
```

---

## Notas Importantes

1. **No ejecutes OpenClaw CLI directamente en el contenedor gateway** - Este contenedor está optimizado para ejecutar el gateway, no el CLI completo. Usa `openclaw-cli` para operaciones CLI.

2. **Los archivos de configuración se comparten** - El volumen `openclaw_config` se monta en ambos contenedores (`config-service` y `openclaw-gateway`) en la misma ruta `/home/node/.openclaw/`.

3. **Siempre reinicia después de sincronizar** - El gateway lee la configuración al inicio, por lo que necesitas reiniciarlo después de cambiar credenciales o configuración.

4. **El workspace se monta desde el host** - Los archivos creados por OpenClaw en el workspace están en `./data/molbot-workspace/workspace` en el host.
