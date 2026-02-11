# Roadmap Molbot - Fases de Desarrollo

Este documento outline las fases de desarrollo planeadas para expandir las funcionalidades de Molbot.

## Estado Actual

**Cobertura General: ~35-40%**

### 🔒 Estado de Seguridad Actual

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Encriptación de credenciales** | ✅ Implementado | AES-256-GCM con IV único por credencial |
| **Autenticación API** | ✅ Implementado | Header `X-UI-Secret` para endpoints `/api/*` |
| **MongoDB auth** | ✅ Implementado | Usuario root con password, autenticación activada |
| **Docker socket access** | ⚠️ Restringido | Solo config-service tiene acceso, pero sin validación adicional |
| **Rate limiting** | ❌ No implementado | APIs sin límite de requests |
| **Input validation** | ⚠️ Parcial | Solo validación básica en algunos endpoints |
| **Audit logging** | ❌ No implementado | No hay registro de cambios |
| **Secrets rotation** | ❌ No implementado | No hay rotación automática de keys |
| **HTTPS enforcement** | ⚠️ Parcial | nginx puede usar HTTPS, pero HTTP también permitido |
| **SQL/NoSQL injection protection** | ⚠️ Parcial | Uso de MongoDB con driver, pero sin sanitización explícita |
| **XSS prevention** | ⚠️ Parcial | Vue 3 provee protección básica, pero sin Content Security Policy |
| **CORS configuration** | ⚠️ Parcial | Configurado pero permite orígenes arbitrarios en dev |

### ✅ Funcionalidades Implementadas

| Funcionalidad | Estado | Descripción |
|--------------|--------|-------------|
| **Credenciales API** | ✅ Completo | Gestión centralizada de API keys (Anthropic, OpenAI, MiniMax, etc.) con cifrado AES-256-GCM |
| **Canales de Mensajería** | ✅ Parcial | Telegram, Slack, Discord, WhatsApp, MSTeams, Line |
| **Configuración de Modelo** | ✅ Completo | Selección de modelo por defecto para el agente |
| **Fallback en Cascada** | ✅ Completo | Hasta 2 modelos de soporte que se activan automáticamente si falla el principal |
| **Rate Limiting** | ✅ Completo | Sistema de colas FIFO por provider con límites de concurrencia configurables |
| **Agent-Browser** | ✅ Completo | Automatización de navegador headless con HTTP wrapper API |
| **Políticas de Acceso** | ✅ Completo | `dmPolicy`: open, allowlist, pairing, disabled |
| **Sincronización Automática** | ✅ Completo | Sync automático de credenciales e integraciones al gateway |
| **UI Web de Administración** | ✅ Completo | Vue 3 interface para gestionar todo sin editar archivos |
| **Persistencia en MongoDB** | ✅ Completo | Colecciones: `api_credentials`, `integrations`, `app_config`, `rate_limit_config` |
| **Seguridad** | ⚠️ MITIGADO | Tokens cifrados, vulnerabilidad CRÍTICA mitigaada con whitelist de paths: ver SECURITY-ADVISORY-001.md |

### ❌ Funcionalidades NO Implementadas

| Funcionalidad | Descripción |
|--------------|-------------|
| **Múltiples Agentes** | OpenClaw soporta múltiples agentes con configuraciones independientes |
| **Tools System** | 25 tools nativas (exec, process, fs, web, browser, canvas, nodes, etc.) |
| **Tool Profiles** | Perfiles: minimal, coding, messaging, full con diferentes permisos |
| **Skills System** | 53+ skills oficiales para extender funcionalidades |
| **Workspace Management** | Gestión de workspace del agente (/home/node/.openclaw/workspace) |
| **Subagentes** | Configuración de maxConcurrent para subagentes |
| **Memory Management** | Sistema de memoria persistente y sesiones |
| **Cron/Automation** | Tareas programadas y automatización |
| **Sessions Management** | Control de sesiones y contextos |

---

## 🚨 FASE 0: Seguridad Crítica (ANTES de continuar)

**Objetivo**: Atender vulnerabilidades críticas antes de agregar nuevas funcionalidades

> **🚨 VULNERABILIDAD CRÍTICA MITIGADA**: Ver `doc/SECURITY-ADVISORY-001.md`
> - Las variables de entorno (`ENCRYPTION_KEY`, `MONGO_URI`, etc.) eran accesibles via `/proc/self/environ`
> - OpenClaw tools `exec` y `fs:read` permitían leer este archivo
> - Un atacante vía Telegram podía obtener todas las credenciales
> - **✅ Mitigación mejorada aplicada**: `agent.json` con whitelist de paths permite lectura segura pero bloquea acceso a variables de entorno
> - **Solución permanente pendiente**: Ver sección 0.0 abajo

> **IMPORTANTE**: Esta fase debe completarse antes de continuar con Fase 1, ya que el sistema actual tiene brechas de seguridad que podrían ser explotadas en producción.

### 0.0 🔥 VULNERABILIDAD CRÍTICA: Exposición de Variables de Entorno
- [x] **Mitigación inmediata aplicada**: Crear `agent.json` con whitelist de paths seguros
- [x] **Configuración mejorada**: `fs:read` permitido con restricciones de paths
- [x] **Paths bloqueados**: `/proc`, `/sys`, `/run`, `.env`, `integrations.env`
- [x] **Tools bloqueadas**: `exec`, `fs:write`, `fs:delete`, `process`, `system`
- [ ] Implementar sandboxing de comandos exec (para uso futuro con approvals)
- [ ] Mover credenciales fuera de variables de entorno (IPC service)
- [ ] Validar y sanitizar output de commands para eliminar secrets
- [ ] Implementar un Credential Service separado

**Archivos a crear/modificar**:
- `data/molbot-workspace/agents/main/agent/agent.json` - ✅ Ya creado (profile: messaging + path restrictions)
- `build/openclaw/entrypoint.sh` - ✅ Ya modificado para copiar agent.json
- `data/config-service/lib/credential-service.js` - Pendiente: servicio de credenciales
- `data/config-service/lib/sanitize-output.js` - Pendiente: sanitización de output

**Estado actual de la mitigación (2025-02-10)**:
```json
{
  "tools": {
    "allowed": ["messaging", "fs:read", "fs:list"],
    "forbidden": ["exec", "fs:write", "fs:delete", ...],
    "restrictions": {
      "fs:read": {
        "allowedPaths": ["/home/node/.openclaw/workspace", "..."],
        "blockedPaths": ["/proc", "/sys", "/run", ".env", ...]
      }
    }
  }
}
```

---

### 0.1 ✅ Rate Limiting por Provider (Colas FIFO)
- [x] **Implementado**: Sistema de colas FIFO por provider para evitar rate limits de LLM
- [x] **Colas concurrentes**: Límite de peticiones simultáneas por provider (anthropic: 5, openai: 10, etc.)
- [x] **Backoff exponencial**: Retries con delay creciente (1s→2s→4s→10s)
- [x] **Backoff agresivo para 429**: Delay más largo (3s→6s→12s) para rate limits específicos
- [x] **Fallback configurable en cascada**: Cadena de hasta 3 modelos (Principal → Soporte 1 → Soporte 2)
- [x] **Dashboard de configuración**: UI para ajustar límites por provider y cadena de fallback
- [x] **Estadísticas en tiempo real**: Monitoreo de colas (ejecutando, en cola)
- [ ] Rate limiting por IP/usuario para endpoints API (pendiente)
- [ ] Rate limiting específico para endpoints de autenticación
- [ ] Limitar tamaño de request body (prevención de DoS por payload)

**Archivos creados/modificados**:
- [x] `data/config-service/lib/request-queue.js` - Sistema de colas FIFO por provider
- [x] `data/config-service/lib/openclaw-client.js` - Cliente con retries y cadena de fallback
- [x] `data/config-service/routes/queue.js` - API de gestión de colas
- [x] `data/config-service/routes/telegram.js` - Usa el sistema de colas
- [x] `data/config-service/routes/config.js` - API para guardar fallbackModel1 y fallbackModel2
- [x] `data/frontend/src/views/Config.vue` - Dashboard con 3 selectores de modelo
- [x] `data/frontend/src/api.ts` - Funciones para configuración de colas

**Colecciones MongoDB**:
- [x] `rate_limit_config` - Almacena límites configurados por provider
- [x] `app_config` - Almacena defaultAgentModel, fallbackModel1, fallbackModel2

**API Endpoints**:
- `GET /api/config` - Obtiene configuración actual (incluye fallbackModel1, fallbackModel2)
- `PUT /api/config` - Guarda configuración de modelos y fallbacks
- `GET /api/queue/config` - Obtiene configuración de colas
- `POST /api/queue/config` - Guarda configuración de límites
- `GET /api/queue/stats` - Estadísticas en tiempo real
- `PUT /api/queue/limits/:provider` - Ajusta límite de un provider

**Sistema de Fallback en Cascada (2025-02-10)**:
- Configuración centralizada en `/admin/#/config` con 3 selectores:
  - **Modelo Principal** (obligatorio): Modelo que usa el agente por defecto
  - **Modelo de Soporte 1** (opcional): Primer fallback si el principal falla
  - **Modelo de Soporte 2** (opcional): Segundo fallback si el soporte 1 falla
- Visualización de cadena con flechas indicando el orden de fallback
- Selectores inteligentes: no permiten seleccionar el mismo modelo en múltiples posiciones
- Sistema usa caché de 60 segundos para evitar consultas excesivas a MongoDB
- Si no hay fallbacks configurados, usa DEFAULT_FALLBACK_MODELS (hardcoded)
- Al cambiar la configuración, el caché se invalida automáticamente

**Flujo de Fallback Completo**:
```
1. Usuario configura en /admin/#/config:
   - Principal: "anthropic/claude-3-5-sonnet-20241022"
   - Soporte 1: "anthropic/claude-3-5-haiku-20241022"
   - Soporte 2: "openai/gpt-3.5-turbo"

2. Se guarda en app_config:
   { defaultAgentModel: "...", fallbackModel1: "...", fallbackModel2: "..." }

3. openclaw-client.js lee la configuración:
   - Intenta Principal (con 3 retries)
   - Si falla → Intenta Soporte 1
   - Si falla → Intenta Soporte 2
   - Si todo falla → Usa DEFAULT_FALLBACK_MODELS

4. Caché se invalida al actualizar configuración
```

**Completado**: 2025-02-10

---

### 0.5 ✅ Agent-Browser: Automatización de Navegador Web
- [x] **Implementado**: Integración de agent-browser (Vercel Labs) para automatización de navegador headless
- [x] **Contenedor sidecar**: Servicio HTTP wrapper independiente (puerto 9222)
- [x] **API REST estructurada**: Endpoints para snapshot, click, fill, screenshot, open, close
- [x] **Sistema de referencias**: Elementos interactivos con refs deterministas (@e1, @e2)
- [x] **Skill de OpenClaw**: Documentación para que el agente use browser automation
- [x] **Volume compartido**: Screenshots y artefactos compartidos con gateway
- [x] **Health check**: Verificación automática de estado del servicio
- [ ] Proxy nginx para acceso externo (pendiente)
- [ ] Configuración UI para agent-browser (pendiente)

**Archivos creados/modificados**:
- [x] `build/agent-browser/Dockerfile` - Contenedor Alpine con Chromium y agent-browser CLI
- [x] `build/agent-browser/wrapper.js` - HTTP API server (Node.js)
- [x] `build/agent-browser/package.json` - Definición del wrapper
- [x] `data/molbot-workspace/agents/main/skills/agent-browser/SKILL.md` - Skill para OpenClaw
- [x] `docker-compose.yml` - Servicio agent-browser con healthcheck
- [x] `doc/AGENT-BROWSER-TUTORIAL.md` - Tutorial completo de uso

**API Endpoints (HTTP Wrapper)**:
- `GET /health` - Health check del servicio
- `GET /snapshot` - Obtener snapshot con referencias de elementos
- `POST /open` - Abrir URL en el navegador
- `POST /click` - Click en elemento por ref o selector
- `POST /fill` - Llenar input con texto
- `GET /get-text` - Obtener texto de elemento
- `POST /screenshot` - Tomar screenshot (viewport o full page)
- `POST /close` - Cerrar navegador
- `POST /exec` - Ejecutar comando arbitrario de agent-browser

**Arquitectura**:
```
┌─────────────────────────┐
│   openclaw-gateway      │
│   (puerto 18789)        │
│                         │
│   AGENT_BROWSER_URL =   │
│   http://agent-browser: │
│   9222                  │
└───────────┬─────────────┘
            │
            │ Docker network (molbot_net)
            │
            ▼
┌─────────────────────────┐
│   agent-browser         │
│   (puerto 9222)         │
│                         │
│   HTTP Wrapper API      │
│   + agent-browser CLI   │
└─────────────────────────┘
```

**Uso desde el Chat**:
```
Usuario: "Navega a https://github.com/search, busca 'agent-browser',
          toma un screenshot de los resultados"

Agente: Usa el skill agent-browser para:
  1. open https://github.com/search
  2. snapshot → encontrar refs de inputs
  3. fill @e5 "agent-browser"
  4. click @e6 (botón search)
  5. wait 3000
  6. screenshot github-results.png
```

**Volumen compartido**:
- `agent_browser_workspace` - Screenshots, downloads, artefactos
- Montado en `/workspace` en ambos contenedores

**Completado**: 2025-02-10

---

### 0.2 Input Validation y Sanitización
- [ ] Validar todos los inputs con schemas (Joi o Zod)
- [ ] Sanitizar strings para prevenir NoSQL injection
- [ ] Whitelist de valores permitidos para parámetros críticos
- [ ] Validar tipos de datos antes de procesar
- [ ] Escapar outputs que se renderizan en la UI

**Archivos a crear/modificar**:
- `data/config-service/lib/validators.js` - Validadores centralizados
- `data/config-service/middleware/validate.js` - Middleware de validación
- Aplicar validación en todos los endpoints

---

### 0.3 Security Headers y HTTPS
- [ ] Configurar Helmet.js para headers de seguridad
- [ ] Implementar HSTS (HTTP Strict Transport Security)
- [ ] Configurar CSP (Content Security Policy)
- [ ] Forzar HTTPS en producción (redirección de HTTP a HTTPS)
- [ ] Configurar CORS con orígenes específicos (no `*`)

**Archivos a crear/modificar**:
- `data/config-service/server.js` - Agregar Helmet y configuración
- `server/nginx/conf.d/default.conf` - Configurar TLS y headers

---

### 0.4 Secrets Management
- [ ] Implementar rotación de `ENCRYPTION_KEY`
- [ ] Soporte para múltiples keys (key rotation sin downtime)
- [ ] No hardcodear secrets en código
- [ ] Validar que secrets tengan formato válido (longitud mínima, etc.)
- [ ] Soporte para inyección de secrets via vault externo (opcional)

**Archivos a crear/modificar**:
- `data/config-service/lib/encrypt.js` - Soportar key versioning
- `db/init-mongo.sh` - Validación de secrets en startup

---

### 0.5 Audit Logging Básico
- [ ] Registrar todos los cambios a credenciales (create, update, delete)
- [ ] Registrar intentos fallidos de autenticación
- [ ] Logs inmutables (no pueden ser modificados después)
- [ ] Retención configurável
- [ ] Exportación de logs para análisis externo

**Archivos a crear/modificar**:
- Colección MongoDB: `audit_log`
- `data/config-service/middleware/audit.js` - Middleware de auditoría
- `data/config-service/lib/audit.js` - Funciones de logging

---

### 0.6 Docker Socket Security
- [ ] Validar comandos ejecutados vía Docker socket (whitelist)
- [ ] No permitir ejecución de comandos arbitrarios
- [ ] Sanitizar parámetros de exec
- [ ] Logs de todas las operaciones Docker
- [ ] Considerar mover a socket proxy con autenticación

**Archivos a crear/modificar**:
- `data/config-service/lib/docker-utils.js` - Validación de comandos
- `data/config-service/routes/gateway.js` - Whitelist de operaciones permitidas

---

### 0.7 🔥 Tokens en Texto Plano en Archivos de Configuración

**Problema identificado (2025-02-10)**:
Los tokens de integración (Telegram, Slack, etc.) se escriben en texto plano en archivos del volumen compartido:

1. **`/home/node/.openclaw/integrations.env`** - Contiene tokens descifrados en formato `export TELEGRAM_BOT_TOKEN="valor_real"`
2. **`/home/node/.openclaw/openclaw.json`** - Contiene canales con tokens en texto plano en `channels[*].botToken`, `channels[*].accessToken`, etc.

**Impacto**:
- El bot de Telegram (u otros canales) puede leer sus propias credenciales
- Si el bot tiene acceso a lectura de archivos, puede exponer sus propios tokens
- Los archivos persisten en el volumen compartido entre contenedores

**Soluciones propuestas**:

| Opción | Descripción | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **A. Permisos de archivos** | `chmod 600` en `integrations.env` y `openclaw.json` | Simple, efectivo | Requiere root/user management |
| **B. tmpfs/ramdisk** | Montar configuración en memoria volátil | Se borra al reiniciar | Pierde config si el contenedor se cae |
| **C. Named pipes (FIFOs)** | Enviar tokens vía pipes sin archivos | No deja rastro en disco | Complejo de implementar |
| **D. Credential Service IPC** | Servicio separado que entrega tokens bajo demanda | Máximo aislamiento | Requiere arquitectura nueva |
| **E. Variables de entorno directas** | Inyectar tokens en `process.env` del gateway | OpenClaw ya soporta esto | Visible en `/proc/*/environ` |

**Estado**:
- [ ] Implementar solución de permisos de archivos (corto plazo)
- [ ] Evaluar tmpfs para `integrations.env` (medio plazo)
- [ ] Considerar Credential Service IPC (largo plazo)

**Archivos a modificar**:
- `data/config-service/routes/integrations.js` - Línea 526: `generateEnvFile()`
- `data/config-service/routes/integrations.js` - Línea 642: `fs.writeFile(envFilePath, ...)`
- `data/config-service/lib/sync-openclaw-auth.js` - Sincronización de credenciales

**Notas**:
- OpenClaw **necesita** los tokens en texto plano para funcionar (no hay forma de evitarlo)
- El objetivo es blindar el acceso sin perder funcionalidad del bot
- Ver también: `doc/SECURITY-ADVISORY-001.md` para contexto sobre `/proc/self/environ`

---

## 📌 FASE 1: Consolidación y Mejoras UX

**Objetivo**: Pulir las funcionalidades existentes y mejorar la experiencia de usuario

### 🔐 Validación de Seguridad - Fase 1

**1.1 Logs en Tiempo Real**
- [ ] Autenticación requerida para endpoint de logs SSE
- [ ] Validación de nombre de contenedor (whitelist de contenedores permitidos)
- [ ] Sanitización de logs para evitar filtración de datos sensibles (tokens, passwords)
- [ ] Rate limiting en conexiones SSE para prevenir DoS
- [ ] Logs no deben incluir `tokenEncrypted`, `ENCRYPTION_KEY`, ni credenciales en texto

**1.2 Health Dashboard**
- [ ] Autenticación obligatoria para métricas
- [ ] No exponer información sensible del sistema (paths internos, variables de entorno)
- [ ] Validar que `docker-stats` no filtre datos de otros contenedores en el host
- [ ] Rate limiting en consultas de métricas

**1.3 Validación de Configuración**
- [ ] Validar que URLs de webhooks usen HTTPS (o permitir HTTP solo para localhost)
- [ ] Sanitizar errores de APIs externas antes de mostrarlos (no filtrar headers de autenticación)
- [ ] Timeout para prevenir ataques de slow-response
- [ ] Limitar tamaño de payloads de configuración

**1.4 Historial de Cambios**
- [ ] Inmutable: registros de auditoría no pueden ser modificados o eliminados
- [ ] No almacenar credenciales (ni encriptadas) en el audit log
- [ ] Retención configurable con limpieza automática de logs antiguos
- [ ] Log de intentos fallidos de autenticación

---

### 1.1 Logs en Tiempo Real
- [ ] Streaming de logs del gateway en la UI
- [ ] Filtros por nivel (error, warn, info)
- [ ] Exportación de logs
- [ ] Selección de contenedor (gateway, config-service, nginx)
- **Impacto**: Alta visibilidad del sistema sin entrar al contenedor

**Archivos a crear/modificar**:
- `data/config-service/routes/logs.js` - Nuevo endpoint SSE para logs
- `data/frontend/src/views/Logs.vue` - Componente para streaming de logs
- `server/nginx/conf.d/default.conf` - Configurar proxy para SSE

---

### 1.2 Health Dashboard
- [ ] Vista consolidada del estado de todos los servicios
- [ ] Métricas básicas (CPU, memoria, conexiones activas)
- [ ] Historial de sincronizaciones
- [ ] Estado de MongoDB (conexiones, tamaño de colecciones)
- **Impacto**: Monitoreo centralizado

**Archivos a crear/modificar**:
- `data/config-service/routes/health.js` - Endpoint con métricas
- `data/frontend/src/views/Dashboard.vue` - Vista de dashboard
- `data/config-service/lib/docker-stats.js` - Utilidad para stats de contenedores

---

### 1.3 Validación de Configuración
- [ ] Validación en tiempo real al editar integraciones
- [ ] Tests de conexión (ping a APIs de Telegram, Slack, etc.)
- [ ] Previsualización de cambios antes de guardar
- [ ] Detección de configuraciones inválidas antes de sync
- **Impacto**: Reduce errores de configuración

**Archivos a crear/modificar**:
- `data/config-service/routes/integrations.js` - Agregar endpoint `/api/integrations/validate`
- `data/config-service/lib/validators.js` - Validadores de configuración
- `data/frontend/src/views/Integrations.vue` - UI de validación

---

### 1.4 Historial de Cambios
- [ ] Audit log de modificaciones a credenciales e integraciones
- [ ] Posibilidad de revertir cambios
- [ ] Filtros por fecha, usuario, recurso
- [ ] Exportación de historial
- **Impacto**: Trazabilidad y recuperación

**Archivos a crear/modificar**:
- Nueva colección MongoDB: `audit_log`
- `data/config-service/models/AuditLog.js` - Modelo de auditoría
- `data/config-service/middleware/audit.js` - Middleware para registrar cambios
- `data/frontend/src/views/AuditLog.vue` - Vista de historial

---

## 📌 FASE 2: Gestión de Agentes

**Objetivo**: Permitir configurar múltiples agentes con diferentes personalidades

### 🔐 Validación de Seguridad - Fase 2

**2.1 CRUD de Agentes**
- [ ] Validar que `systemPrompt` no incluya prompts de jailbreak
- [ ] Sanitizar input de prompts para prevenir inyección de comandos
- [ ] Límite de tamaño para system prompt (prevenir DoS por token overflow)
- [ ] Restricción de tool profiles sensibles (ej: `exec` solo para admins)
- [ ] Validar que `maxConcurrent` esté dentro de límites razonables

**2.2 Asignación de Canales por Agente**
- [ ] Validar que un agente solo acceda a canales autorizados
- [ ] No permitir que un agente acceda a credenciales de otro
- [ ] Aislamiento de contexto entre agentes en canales compartidos

**2.3 Variables de Entorno por Agente**
- [ ] Whitelist de variables permitidas (no permitir sobrescribir `ENCRYPTION_KEY`, `MONGO_URI`, etc.)
- [ ] Sanitización de valores para prevenir inyección de comandos
- [ ] No permitir variables con datos sensibles en texto plano
- [ ] Validar formato de valores (ej: URLs deben ser válidas)

---

### 2.1 CRUD de Agentes
- [ ] Crear/Editar/Eliminar agentes
- [ ] Configuración independiente por agente:
  - Modelo primario
  - Tool profile (minimal, coding, messaging, full)
  - Max concurrent operations
  - System prompt/personalidad
- **Impacto**: Múltiples bots con propósitos diferentes

**Archivos a crear/modificar**:
- `data/config-service/routes/agents.js` - Nuevo endpoint para agentes
- `data/config-service/lib/sync-openclaw-agents.js` - Sync de agentes a openclaw.json
- `data/frontend/src/views/Agents.vue` - UI de gestión de agentes

---

### 2.2 Asignación de Canales por Agente
- [ ] Cada canal puede estar asociado a un agente específico
- [ ] Un canal puede usar múltiples agentes (round-robin)
- [ ] Configuración de agente por defecto
- **Impacto**: Especialización de agentes

**Archivos a crear/modificar**:
- Modificar esquema de `integrations` para incluir `agentId`
- `data/config-service/routes/integrations.js` - Actualizar para manejar agentId
- `data/frontend/src/views/Integrations.vue` - Selector de agente

---

### 2.3 Variables de Entorno por Agente
- [ ] Variables específicas para cada agente
- [ ] Sobrescritura de config global
- [ ] Gestión de env vars desde la UI
- **Impacto**: Flexibilidad

**Archivos a crear/modificar**:
- `data/config-service/routes/agent-env.js` - Endpoint para env vars
- Colección MongoDB: `agent_environment`

---

## 📌 FASE 3: Tools y Profiles

**Objetivo**: Control granular de las capacidades de los agentes

### 🔐 Validación de Seguridad - Fase 3

**3.1 Gestión de Tool Profiles**
- [ ] Tools sensibles (`exec`, `fs:write`, `process`) requieren aprobación explícita
- [ ] Validar que profiles personalizados no combinen tools peligrosas
- [ ] Herramientas de ejecución de código deben estar deshabilitadas por defecto
- [ ] Limitar `exec` a comandos whitelist cuando se use en canales públicos

**3.2 Configuración de Tools Específicas**
- [ ] Timeout obligatorio para tools de red (`web`, `browser`)
- [ ] Límite de tamaño de archivos para `fs:write`
- [ ] Restricción de paths permitidos para `fs` operations
- [ ] Validar que `canvas` y `nodes` no generen contenido malicioso

**3.3 Custom Tools**
- [ ] Validar schema de tools custom antes de registrar
- [ ] URLs de endpoints HTTP deben usar HTTPS
- [ ] Sanitizar respuestas de tools custom antes de devolver al agente
- [ ] Limitar número de tools custom por instancia (DoS prevention)
- [ ] Tools custom no pueden acceder a variables de entorno sensibles

---

### 3.1 Gestión de Tool Profiles
- [ ] Interfaz para seleccionar profiles: minimal, coding, messaging, full
- [ ] Vista de qué tools incluye cada profile
- [ ] Creación de profiles personalizados
- **Impacto**: Control de seguridad y capacidades

**Archivos a crear/modificar**:
- `data/config-service/routes/tools.js` - Endpoint para tools
- `data/config-service/lib/tool-profiles.js` - Definición de profiles
- `data/frontend/src/views/ToolProfiles.vue` - UI de profiles

---

### 3.2 Configuración de Tools Específicas
- [ ] Activar/desactivar tools individuales
- [ ] Configuración de parámetros de tools (ej: timeout de exec)
- [ ] Permisos por tool group
- **Impacto**: Control granular

---

### 3.3 Custom Tools
- [ ] Definir tools custom desde la UI
- [ ] Endpoint HTTP para ejecutar comandos
- [ ] Documentación de tools
- **Impacto**: Extensibilidad sin tocar código

---

## 📌 FASE 4: Sessions y Memory

**Objetivo**: Gestión de las conversaciones y memoria del agente

### 🔐 Validación de Seguridad - Fase 4

**4.1 Sessions Manager**
- [ ] Solo admins pueden ver sesiones de otros usuarios
- [ ] Sanitizar mensajes al exportar (remover datos sensibles detectados)
- [ ] No incluir credenciales o tokens en los mensajes exportados
- [ ] Validar que `close session` requiera confirmación para evitar pérdida de datos
- [ ] Rate limiting en exportación de sesiones

**4.2 Memory Browser**
- [ ] Control de acceso basado en propietario de la memoria
- [ ] Sanitizar búsqueda para prevenir inyección (NoSQL injection)
- [ ] Logs de accesos a memoria sensible
- [ ] No permitir búsqueda de patrones que parezcan credenciales

**4.3 Context Injection**
- [ ] Validar tamaño de archivos subidos (límite configurável)
- [ ] Escanear archivos en busca de malware o datos sensibles
- [ ] Sandbox para archivos inyectados (aislados del sistema)
- [ ] Límite de cantidad de archivos de contexto por agente
- [ ] Tipos de archivo permitidos: whitelist (no .exe, .bat, .sh, etc.)

---

### 4.1 Sessions Manager
- [ ] Listado de sesiones activas
- [ ] Ver detalle de cada sesión (mensajes, contexto)
- [ ] Cerrar/terminar sesiones
- [ ] Exportar sesiones
- **Impacto**: Control de conversaciones

**Archivos a crear/modificar**:
- `data/config-service/routes/sessions.js` - Endpoint para sesiones
- `data/config-service/lib/gateway-api.js` - Cliente para API de OpenClaw
- `data/frontend/src/views/Sessions.vue` - UI de sesiones

---

### 4.2 Memory Browser
- [ ] Navegar la memoria persistente del agente
- [ ] Búsqueda por palabras clave
- [ ] Eliminar entradas de memoria
- [ ] Categorización de memoria
- **Impacto**: Gestión de conocimiento

---

### 4.3 Context Injection
- [ ] Inyectar contexto/knowledge base a un agente
- [ ] Upload de archivos para contexto
- [ ] Gestión de archivos de contexto
- **Impacto**: Personalización

---

## 📌 FASE 5: Integraciones Avanzadas

**Objetivo**: Más control sobre los canales de mensajería

### 🔐 Validación de Seguridad - Fase 5

**5.1 Configuración Raw de Canales**
- [ ] Validar schema JSON con AJV o similar antes de aplicar
- [ ] Sanitizar diff para no exponer datos sensibles en comparaciones
- [ ] No permitir modificar campos críticos de seguridad vía raw config
- [ ] Validar que URLs sean HTTPS o localhost
- [ ] Limitar tamaño de configuración JSON

**5.2 Webhooks Manager**
- [ ] Validación HMAC de webhooks entrantes cuando sea posible
- [ ] Rate limiting por IP/source para prevenir floods
- [ ] Validación de contenido (Content-Type, tamaño)
- [ ] Timeout estricto para webhook processing
- [ ] No procesar webhooks de IPs sin reputación (configurable)

**5.3 Custom Channels**
- [ ] Solo admins pueden crear canales custom
- [ ] Validar schema de configuración del canal
- [ ] No permitir canales que omitan autenticación
- [ ] Restricción de custom channels en entornos multi-tenant

---

### 5.1 Configuración Raw de Canales
- [ ] Editor JSON para configuración avanzada
- [ ] Validación de schema
- [ ] Comparación de configuraciones (diff)
- **Impacto**: Sin límites de configuración

---

### 5.2 Webhooks Manager
- [ ] Configurar webhooks entrantes
- [ ] Prueba de webhooks
- [ ] Logs de webhook calls
- [ ] Reintentos automáticos
- **Impacto**: Integraciones externas

---

### 5.3 Custom Channels
- [ ] Agregar canales no soportados nativamente
- [ ] Configurar via JSON schema
- [ ] Documentación de canales custom
- **Impacto**: Extensibilidad

---

## 📌 FASE 6: Automation

**Objetivo**: Tareas programadas y automatización

### 🔐 Validación de Seguridad - Fase 6

**6.1 Cron Jobs**
- [ ] Validar sintaxis de cron expression
- [ ] Limitar frecuencia mínima entre ejecuciones (prevenir DoS)
- [ ] Timeout obligatorio para cada job
- [ ] Sanitizar comandos/endpoint a ejecutar
- [ ] No permitir comandos que accedan a variables sensibles
- [ ] Logs de ejecución no deben incluir credenciales

**6.2 Triggers**
- [ ] Validar que triggers no creen loops infinitos
- [ ] Rate limiting de triggers por sesión
- [ ] Validar payload de eventos
- [ ] No permitir triggers sobre eventos de seguridad (auth failures, etc.)

**6.3 Workflows**
- [ ] Límite de steps por workflow (prevenir complejidad excesiva)
- [ ] Timeout total del workflow
- [ ] Validar que no haya referencias circulares
- [ ] Sanitizar inputs en cada step
- [ ] No permitir workflows que expongan credenciales

---

### 6.1 Cron Jobs
- [ ] Crear tareas programadas (cron syntax)
- [ ] Ejecutar comandos/endpoint a intervalos
- [ ] Logs de ejecución
- [ ] Notificaciones de fallos
- **Impacto**: Automatización

**Archivos a crear/modificar**:
- `data/config-service/routes/cron.js` - Endpoint para cron jobs
- `data/config-service/lib/scheduler.js` - Scheduler de tareas
- Colección MongoDB: `cron_jobs`

---

### 6.2 Triggers
- [ ] Event-based triggers (nuevo mensaje, etc.)
- [ ] Acciones predefinidas
- [ ] Cadena de triggers
- **Impacto**: Reactividad

---

### 6.3 Workflows
- [ ] Secuencias de acciones
- [ ] Condicionales y loops
- [ ] Editor visual de workflows
- **Impacto**: Automatización compleja

---

## 📌 FASE 7: Seguridad y Empresarial

**Objetivo**: Funcionalidades para entornos de producción

### 🔐 Validación de Seguridad - Fase 7

**7.1 Multi-Tenancy**
- [ ] Aislamiento estricto de datos entre tenants (database row-level security)
- [ ] Validar que queries no filtren datos entre tenants
- [ ] Rate limiting por tenant
- [ ] Cuotas de recursos por tenant (CPU, memoria, requests)
- [ ] Logs siempre incluyen tenant_id para trazabilidad

**7.2 RBAC**
- [ ] Principio de mínimo privilegio por defecto
- [ ] Roles predefinidos no pueden ser eliminados, solo modificados con restricciones
- [ ] MFA obligatorio para roles elevados (admin)
- [ ] Audit trail inmutable para cambios de permisos
- [ ] Validación de permisos en cada request (no caché de permisos)

**7.3 Backup/Restore**
- [ ] Backups encriptados en rest
- [ ] No incluir `ENCRYPTION_KEY` en backups (generar nueva al restore)
- [ ] Validar integridad de backup con checksum antes de restore
- [ ] Restore requiere autenticación MFA
- [ ] Logs de backup/restore en sistema separado (no en el mismo backup)

**7.4 API Rate Limiting**
- [ ] Rate limiting por usuario/IP/API key
- [ ] Limites configurable por endpoint
- [ ] Alertas por exceeding limits
- [ ] No apply rate limiting a endpoints de salud críticos
- [ ] Distributed rate limiting para setups multi-instance

---

### 7.1 Multi-Tenancy
- [ ] Múltiples organizaciones/usuarios
- [ ] Aislamiento de datos
- [ ] Cuotas por tenant
- **Impacto**: SaaS ready

---

### 7.2 RBAC
- [ ] Roles y permisos granulares
- [ ] Audit trail detallado
- [ ] MFA (Multi-factor authentication)
- **Impacto**: Seguridad empresarial

---

### 7.3 Backup/Restore
- [ ] Exportar toda la configuración
- [ ] Restaurar desde backup
- [ ] Migración entre instancias
- [ ] Backups automáticos programados
- **Impacto**: Resiliencia

**Archivos a crear/modificar**:
- `data/config-service/routes/backup.js` - Endpoint para backup/restore
- `data/config-service/lib/backup.js` - Lógica de backup

---

### 7.4 API Rate Limiting
- [ ] Límites de consumo por API
- [ ] Cuotas por usuario/org
- [ ] Alertas de límites
- **Impacto**: Control de costos

---

## 📌 FASE 8: Analytics

**Objetivo**: Visibilidad del uso y rendimiento

### 🔐 Validación de Seguridad - Fase 8

**8.1 Usage Metrics**
- [ ] No almacenar contenido de mensajes en analytics (solo metadatos)
- [ ] Agregación de datos para no identificar usuarios individuales
- [ ] Control de acceso a analytics (solo roles autorizados)
- [ ] No incluir credenciales o tokens en métricas
- [ ] Anonimización de IPs en logs de analytics

**8.2 Performance Dashboard**
- [ ] No exponer información del host en métricas públicas
- [ ] Validar que queries no filtren datos entre tenants
- [ ] Rate limiting en consultas de analytics
- [ ] Caché de métricas con TTL (no cálculos en tiempo real)

**8.3 Analytics de Conversaciones**
- [ ] PII detection y redacción automática
- [ ] No almacenar conversaciones completas (solo estadísticas)
- [ ] Consentimiento obligatorio para análisis de sentimiento
- [ ] Retención limitada de datos analíticos
- [ ] Exportación de analytics solo por usuarios autorizados

---

### 8.1 Usage Metrics
- [ ] Mensajes por canal
- [ ] Tokens consumidos
- [ ] Costos por proveedor
- [ ] Gráficos de tendencias
- **Impacto**: Control de gastos

---

### 8.2 Performance Dashboard
- [ ] Latencia de respuestas
- [ ] Uptime de servicios
- [ ] Errores por categoría
- [ ] Alertas de anomalías
- **Impacto**: Monitoreo

---

### 8.3 Analytics de Conversaciones
- [ ] Tipos de consultas más frecuentes
- [ ] Satisfacción (feedback)
- [ ] Análisis de sentimiento
- [ ] Word clouds
- **Impacto**: Mejora continua

---

## ⏱️ Priorización Sugerida

### 🔥 CRÍTICO (Antes de continuar)
- [ ] **Fase 0.1**: Rate limiting y DoS protection
- [ ] **Fase 0.2**: Input validation y sanitización
- [ ] **Fase 0.3**: Security headers y HTTPS
- [ ] **Fase 0.4**: Secrets management
- [ ] **Fase 0.5**: Audit logging básico
- [ ] **Fase 0.6**: Docker socket security

### Corto Plazo (1-2 semanas) - DESPUÉS de Fase 0
- [ ] **Fase 1.1**: Logs en tiempo real
- [ ] **Fase 1.3**: Validación de configuración

### Mediano Plazo (1-2 meses)
- [ ] **Fase 1.2**: Health Dashboard
- [ ] **Fase 2.1-2.2**: Gestión de Agentes básica
- [ ] **Fase 1.4**: Historial de cambios

### Largo Plazo (3-6 meses)
- [ ] **Fase 3**: Tools y Profiles
- [ ] **Fase 4**: Sessions y Memory
- [ ] **Fase 5**: Integraciones avanzadas

### Futuro (6+ meses)
- [ ] **Fase 6**: Automation
- [ ] **Fase 7**: Seguridad y Empresarial
- [ ] **Fase 8**: Analytics

---

## 🎯 Recomendación: Empezar por Fase 0 (Seguridad)

**Por qué:**
1. **Vulnerabilidades críticas** actuales deben ser atendidas primero
2. **Deuda técnica de seguridad** es más difícil de corregir después
3. **Protección de credenciales** es fundamental para un sistema de este tipo
4. **Compliance** - Si se planea uso empresarial, la seguridad es base

**Primer paso específico: Rate Limiting**
- Instalar `express-rate-limit` y `helmet`
- Configurar límites básicos por endpoint
- Agregar middleware en `server.js`
- Testing de carga para validar límites

**Después de Fase 0:**
Continuar con Fase 1 para mejorar UX, pero sobre una base segura.

---

## Referencias

- [OpenClaw Setup Guide: 25 Tools + 53 Skills Explained](https://yu-wenhao.com/en/blog/openclaw-tools-skills-tutorial)
- [OpenClaw Complete Guide 2026](https://www.nxcode.io/resources/news/openclaw-complete-guide-2026)
- [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills)
- [Dashboard & Web UI Guide](https://www.getopenclaw.ai/help/dashboard-web-ui-guide)
- [What Is OpenClaw? A Developer's Guide](https://www.andriifurmanets.com/blogs/openclaw-what-is-for-developers)
