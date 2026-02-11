# OPENCLAW DOCKER

Administración centralizada para el bot OpenClaw: configuración, credenciales e integraciones con plataformas de mensajería desde una interfaz web, persistidas en MongoDB con cifrado AES-256-GCM.

## Características

- **Gestión de credenciales centralizada**: API keys de múltiples proveedores (Anthropic, OpenAI, MiniMax, etc.)
- **Rate Limiting inteligente**: Sistema de colas FIFO por provider con límites de concurrencia configurables
- **Fallback en cascada**: Hasta 2 modelos de soporte que se activan automáticamente si falla el principal
- **Integraciones con plataformas de mensajería**: Telegram, Slack, Discord, WhatsApp, y más
- **Automatización de navegador**: Agent-browser para navegación web headless desde el chat del bot
- **Interfaz web moderna**: UI en Vue 3 para administrar todo sin editar archivos
- **Sincronización automática**: Las credenciales e integraciones se sincronizan automáticamente con OpenClaw
- **Seguridad**: Tokens cifrados con AES-256-GCM en MongoDB
- **.env mínimo**: Solo variables de infraestructura, sin API keys de terceros

## Stack

- **MongoDB** - Almacenamiento de credenciales, configuración e integraciones
- **config-service** (Node.js/Express) - API para gestión de credenciales e integraciones
- **molbot-ui** (Vue 3) - Interfaz web de administración
- **agent-browser** (Node.js) - HTTP wrapper para automatización de navegador headless
- **Nginx** - Reverse proxy y punto de entrada único
- **OpenClaw Gateway** - Bot de IA construido desde el [repo oficial](https://github.com/openclaw/openclaw)

---

## Guía de Inicio Rápido

### Paso 1: Levantar los servicios

```bash
# 1. Copiar el template de variables de entorno
cp env.template .env

# 2. (Opcional) Revisar/modificar .env si es necesario
# - UI_SECRET: Clave para acceder a la interfaz web
# - ENCRYPTION_KEY: Clave para cifrar tokens (mínimo 32 caracteres)
# - OPENCLAW_GATEWAY_TOKEN: Token para autenticación del gateway

# 3. Levantar todos los servicios
docker compose up -d --build
```

**Nota**: La primera vez puede tardar varios minutos mientras se construye la imagen de OpenClaw (clona y compila el repo oficial).

### Paso 2: Verificar que todo esté funcionando

```bash
# Ver estado de los contenedores
docker compose ps

# Ver logs de un servicio específico
docker compose logs -f config-service
```

Todos los servicios deben estar "healthy" o "running". Si MongoDB queda "unhealthy", ver la sección [Solución de problemas](#solución-de-problemas).

### Paso 3: Configurar credenciales API

1. **Ingresar a la interfaz**: http://localhost
2. **Autenticarse**: Usa el valor de `UI_SECRET` de tu archivo `.env`
3. **Ir a Credenciales**: http://localhost/admin/credentials
4. **Agregar tus API keys**:
   - Click en "+ Agregar credencial"
   - Selecciona el proveedor (ej: "Anthropic", "OpenAI")
   - Pega tu API key
   - Click en "Guardar"

Las credenciales se **sincronizan automáticamente** con OpenClaw y el gateway se reinicia para aplicar los cambios.

### Paso 4: Configurar modelos (Principal + Soportes)

1. **Ir a Configuración**: http://localhost/admin/config
2. **Configurar la cadena de modelos**:
   - **Modelo Principal** (obligatorio): El modelo que usa el agente por defecto
   - **Modelo de Soporte 1** (opcional): Primer fallback si el principal falla
   - **Modelo de Soporte 2** (opcional): Segundo fallback si el soporte 1 falla
3. **Guardar cambios**

**Cómo funciona el fallback en cascada:**
```
Si el Principal falla (después de 3 reintentos)
       ↓
   Intenta con Soporte 1
       ↓ (si falla)
   Intenta con Soporte 2
       ↓ (si falla)
   Usa fallback por defecto (hardcoded)
```

**Ejemplo de configuración:**
- Principal: `Anthropic/Claude 3.5 Sonnet` (modelo premium)
- Soporte 1: `Anthropic/Claude 3.5 Haiku` (más rápido y económico)
- Soporte 2: `OpenAI/GPT-3.5 Turbo` (backup de otro provider)

### Paso 5: Configurar integraciones (opcional)

Si quieres que el bot responda en plataformas de mensajería:

1. **Ir a Integraciones**: http://localhost/admin/integrations
2. **Agregar una integración**:
   - Click en "+ Agregar integración"
   - Selecciona la plataforma (Telegram, Slack, Discord, etc.)
   - Configura los tokens/credenciales necesarios
   - Click en "Guardar"
3. **La integración se sincroniza automáticamente** con OpenClaw

**Plataformas soportadas:**
- **Telegram**: Bot token
- **Slack**: Bot token, Signing secret, App token
- **Discord**: Bot token
- **WhatsApp**: Access token, Phone number, Business ID
- **MSTeams**: App ID, App password
- **Line**: Channel access token, Channel secret

### Paso 6: Acceder al Dashboard de OpenClaw

1. **Abrir el Dashboard**: http://localhost/openclaw-dashboard
   - También funciona con IP: http://192.168.1.x/openclaw-dashboard
   - O con dominio: http://tu-dominio.com/openclaw-dashboard
   - El sistema detecta automáticamente el host desde el cual accedes
2. ¡Listo! Ya puedes chatear con el bot usando las credenciales configuradas

**Nota**: Para configurar manualmente el host (ej. para acceso remoto con dominio), puedes establecer la variable `OPENCLAW_DASHBOARD_PUBLIC_URL` en `.env`:
```bash
OPENCLAW_DASHBOARD_PUBLIC_URL=http://mi-dominio.com
```

---

## URLs de Acceso

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **UI Molbot** | http://localhost | Interfaz de administración |
| **Credenciales** | http://localhost/admin/credentials | Gestión de API keys |
| **Configuración** | http://localhost/admin/config | Modelos (Principal + Soportes) y Rate Limiting |
| **Integraciones** | http://localhost/admin/integrations | Gestión de plataformas de mensajería |
| **OpenClaw Dashboard** | http://localhost/openclaw-dashboard | Chat con el bot (token auto-aplicado) - también funciona con IP o dominio |
| **Healthcheck** | http://localhost:8080/nginx-health | Verificar estado de Nginx |
| **Agent-Browser API** | http://agent-browser:9222 | API de automatización de navegador (interna) |

---

## Flujo de Configuración Detallado

```
1. Levantar servicios
       ↓
2. Acceder a http://localhost
       ↓
3. Autenticarse con UI_SECRET
       ↓
4. Configurar Credenciales (/admin/credentials)
       ↓
5. Configurar Modelo (/admin/config)
       ↓
6. (Opcional) Configurar Integraciones (/admin/integrations)
       ↓
7. Usar el Bot (/openclaw-dashboard)
```

### Paso 3: Credenciales API

Las credenciales se almacenan **cifradas** en MongoDB. Cuando las agregas o modificas:

1. Se cifra el token con AES-256-GCM usando `ENCRYPTION_KEY`
2. Se guarda en MongoDB (colección `api_credentials`)
3. Se sincroniza automáticamente con OpenClaw (`auth-profiles.json`)
4. Se reinicia el contenedor `openclaw-gateway`

**Proveedores soportados:**
- **Anthropic**: API Key, OAuth, Setup Token
- **OpenAI**: API Key, Code Subscription
- **Chinos**: MiniMax, Moonshot, Kimi Coding
- **Gateways**: Vercel AI Gateway, Cloudflare AI Gateway
- **Genérico**: Cualquier API key

### Paso 4: Configuración del Modelo

El modelo por defecto se usa cuando el agente no tiene un modelo específico configurado. Puedes cambiarlo en cualquier momento desde la interfaz.

---

Para más detalles, consulta el tutorial completo:
- **`doc/AGENT-BROWSER-TUTORIAL.md`** - Guía completa de uso con ejemplos

---

## Solución de Problemas

### Acceso remoto (desde otra red)

Para acceder al bot desde una red diferente (ej: desde Internet o otra LAN), tienes dos opciones:

**Opción 1: Detección automática (Recomendado)**
```bash
# Si accedes por IP o dominio, el sistema detecta automáticamente el host
http://192.168.1.100/openclaw-dashboard
http://mi-dominio.com/openclaw-dashboard
```

**Opción 2: Configurar URL pública manualmente**
```bash
# Agregar a tu archivo .env:
OPENCLAW_DASHBOARD_PUBLIC_URL=http://tu-dominio.com

# Para HTTPS:
OPENCLAW_DASHBOARD_PUBLIC_URL=https://tu-dominio.com
```

**Nota**: Si usas un proxy reverso adicional (ej: Cloudflare, Nginx externo), configura `OPENCLAW_DASHBOARD_PUBLIC_URL` con el dominio público.

### MongoDB queda "unhealthy"

Si ves en los logs: `UserNotFound: Could not find user "root"`

**Causa**: La imagen oficial solo crea el usuario root cuando el volumen `/data/db` está **vacío**. Si el volumen tiene datos de una ejecución anterior con contraseña diferente, falla.

**Solución**:
```bash
# Borrar volúmenes y recrear todo
docker compose down -v
docker volume ls  # Verificar que molbot_mongodb_data ya no existe
docker compose up -d
```

### Las credenciales no se sincronizan

Verificar que el archivo existe:
```bash
docker exec molbot-openclaw-gateway cat /home/node/.openclaw/agents/main/agent/auth-profiles.json
```

Sincronizar manualmente:
```bash
# Sincronizar credenciales
curl -X POST http://localhost/api/credentials/sync -H "X-UI-Secret: TU_UI_SECRET"

# Sincronizar integraciones
curl -X POST http://localhost/api/integrations/sync -H "X-UI-Secret: TU_UI_SECRET"
```

### Reiniciar un servicio específico

```bash
docker compose restart openclaw-gateway
docker compose restart config-service
```

### Reconstruir una imagen

```bash
docker compose up -d --build config-service
docker compose up -d --build molbot-ui
```

### Ver logs en tiempo real

```bash
docker compose logs -f config-service
docker compose logs -f openclaw-gateway
docker compose logs -f nginx
```

---

## Comandos Útiles

### OpenClaw CLI

```bash
# Onboard/reconfigurar OpenClaw
docker compose --profile tools run --rm openclaw-cli onboard --no-install-daemon

# Acceder al shell de OpenClaw
docker compose --profile tools run --rm openclaw-cli

# El workspace está montado en ./data/molbot-workspace/workspace
```

### Gestión de contenedores

```bash
# Ver estado
docker compose ps

# Detener todo (preservando volúmenes)
docker compose down

# Detener todo y borrar volúmenes (¡cuidado! se pierden datos)
docker compose down -v

# Reiniciar un servicio
docker compose restart openclaw-gateway
```

---

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Molbot UI     │     │  Config Service │     │    MongoDB      │
│  (Vue 3 /admin) │────▶│  (Node.js:3001) │────▶│     (:27017)    │
│                 │     │  ┌───────────┐  │     │                 │
│  - Credenciales │     │  │ Request   │  │     │ - api_credentials
│  - Config       │     │  │ Queue     │  │     │ - app_config
│  - Rate Limit   │     │  │ Fallback  │  │     │ - integrations
└─────────────────┘     │  └───────────┘  │     │ - rate_limit_config
                         └─────────────────┘     └─────────────────┘
                                │
                                ▼ sincroniza credenciales e integraciones
                         ┌─────────────────┐
                         │  OpenClaw       │
                         │  Gateway(:18789)│
                         │                 │
                         │  - Rate Limited │
                         │  - Fallback     │
                         └─────────────────┘
                                ▲
                         ┌─────────────────┐
                         │     Nginx       │
                         │     (:80/:8080) │
                         └─────────────────┘
```

### Flujo de Sincronización de Integraciones

Cuando agregas o modificas una integración:

1. La UI envía los datos a `POST /api/integrations`
2. `config-service` cifra los tokens sensibles con AES-256-GCM
3. Se guarda en MongoDB (colección `integrations`)
4. Se sincroniza con `openclaw.json`:
   - Los tokens se inyectan directamente en la configuración del canal
   - Los plugins correspondientes se habilitan automáticamente
5. El gateway se reinicia automáticamente
6. OpenClaw se conecta a la plataforma de mensajería

### Colecciones MongoDB

- **`api_credentials`**: Credenciales API cifradas (`provider`, `name`, `tokenEncrypted`, `enabled`, `metadata`)
- **`integrations`**: Integraciones con plataformas de mensajería (`channelId`, `accountId`, `config`, `encryptedConfig`, `enabled`)
- **`app_config`**: Configuración de la aplicación (`defaultAgentModel`, `fallbackModel1`, `fallbackModel2`, `workspacePath`)
- **`rate_limit_config`**: Configuración de rate limiting (`providerLimits`, `globalEnabled`, `maxRetries`, `enableFallback`)

---

## Rate Limiting y Fallback

### Sistema de Colas FIFO por Provider

El sistema implementa colas FIFO (First In, First Out) para controlar la concurrencia de peticiones a cada proveedor de LLM, evitando rate limits.

**Características:**
- Límites de concurrencia configurables por provider (ej: Anthropic: 5, OpenAI: 10)
- Backoff exponencial: 1s → 2s → 4s → 10s
- Backoff agresivo para errores 429 (rate limit): 3s → 6s → 12s
- Estadísticas en tiempo real (ejecutando, en cola)

**Configuración en `/admin/#/config`:**
- Toggle global para habilitar/deshabilitar rate limiting
- Sliders por provider (1-50 concurrentes)
- Configuración de reintentos (0-10)
- Toggle para habilitar fallback automático

### Fallback en Cascada

Cuando un modelo falla después de los reintentos configurados, el sistema intenta automáticamente con los modelos de soporte en orden:

```
Principal (con 3 retries)
    ↓ si falla
Soporte 1
    ↓ si falla
Soporte 2
    ↓ si falla
Fallback por defecto (hardcoded)
```

**Ejemplo de uso:**
1. Configuras Sonnet como principal (modelo premium)
2. Configuras Haiku como Soporte 1 (más rápido)
3. Configuras GPT-3.5 como Soporte 2 (otro provider)
4. Si Sonnet falla por rate limit, automáticamente usa Haiku
5. Si Haiku también falla, intenta con GPT-3.5

---

---

## Seguridad

- Todos los tokens se cifran con **AES-256-GCM** antes de almacenarse
- La API está protegida con el header `X-UI-Secret`
- **Rate limiting** por provider previene abuse y optimiza el uso de APIs
- **Fallback automático** asegura disponibilidad del servicio incluso cuando un provider falla
- El gateway de OpenClaw usa tokenización independiente
- Configuración de agente con restricciones de paths para prevenir acceso no autorizado
- En producción, configura `OPENCLAW_ALLOW_INSECURE_AUTH=false`

**Advertencia**: Revisa `doc/SECURITY-ADVISORY-001.md` para información sobre consideraciones de seguridad importantes.

---

## Roadmap y Desarrollo

Para ver las funcionalidades planeadas y el estado del proyecto, consulta:
- **`doc/ROADMAP.md`** - Plan de desarrollo completo con 8 fases
- **`doc/AGENT-BROWSER-TUTORIAL.md`** - Tutorial completo de automatización de navegador
- **`doc/SECURITY-ADVISORY-001.md`** - Advisory de seguridad y mitigaciones implementadas
- **`doc/SECURITY-IMPLEMENTATION-001.md`** - Detalles de implementación de seguridad

**Funcionalidades futuras**:
- Múltiples agentes con configuraciones independientes
- Gestión de tools y skills
- Sessions y memoria persistente
- Automatización y cron jobs
- Multi-tenancy y RBAC
- Analytics y métricas
