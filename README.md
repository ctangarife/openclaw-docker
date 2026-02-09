# Molbot

Administración centralizada para el bot OpenClaw: configuración y credenciales desde una interfaz web, persistidas en MongoDB con cifrado AES-256-GCM.

## Características

- **Gestión de credenciales centralizada**: API keys de múltiples proveedores (Anthropic, OpenAI, MiniMax, etc.)
- **Interfaz web moderna**: UI en Vue 3 para administrar todo sin editar archivos
- **Sincronización automática**: Las credenciales se sincronizan automáticamente con OpenClaw
- **Seguridad**: Tokens cifrados con AES-256-GCM en MongoDB
- **.env mínimo**: Solo variables de infraestructura, sin API keys de terceros

## Stack

- **MongoDB** - Almacenamiento de credenciales y configuración
- **config-service** (Node.js/Express) - API para gestión de credenciales
- **molbot-ui** (Vue 3) - Interfaz web de administración
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

### Paso 4: Configurar el modelo por defecto

1. **Ir a Configuración**: http://localhost/admin/config
2. **Seleccionar el modelo por defecto**:
   - Elige el modelo que usará el agente por defecto
   - Opciones disponibles dependen de las credenciales agregadas
3. **Guardar cambios**

### Paso 5: Acceder al Dashboard de OpenClaw

1. **Abrir el Dashboard**: http://localhost/openclaw-dashboard
2. ¡Listo! Ya puedes chatear con el bot usando las credenciales configuradas

---

## URLs de Acceso

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **UI Molbot** | http://localhost | Interfaz de administración |
| **Credenciales** | http://localhost/admin/credentials | Gestión de API keys |
| **Configuración** | http://localhost/admin/config | Configuración del modelo |
| **OpenClaw Dashboard** | http://localhost/openclaw-dashboard | Chat con el bot (token auto-aplicado) |
| **Healthcheck** | http://localhost:8080/nginx-health | Verificar estado de Nginx |

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
6. Usar el Bot (/openclaw-dashboard)
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

## Solución de Problemas

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
curl -X POST http://localhost/api/credentials/sync -H "X-UI-Secret: TU_UI_SECRET"
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
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼ sincroniza credenciales
                         ┌─────────────────┐
                         │  OpenClaw       │
                         │  Gateway(:18789)│
                         └─────────────────┘
                                ▲
                         ┌─────────────────┐
                         │     Nginx       │
                         │     (:80/:8080) │
                         └─────────────────┘
```

### Colecciones MongoDB

- **`api_credentials`**: Credenciales API cifradas (`provider`, `name`, `tokenEncrypted`, `enabled`, `metadata`)
- **`app_config`**: Configuración de la aplicación (`defaultAgentModel`, etc.)

---

## Seguridad

- Todos los tokens se cifran con **AES-256-GCM** antes de almacenarse
- La API está protegida con el header `X-UI-Secret`
- El gateway de OpenClaw usa tokenización independiente
- En producción, configura `OPENCLAW_ALLOW_INSECURE_AUTH=false`
