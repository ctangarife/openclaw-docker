# Tutorial de Agent-Browser en Molbot

Guía completa de uso de agent-browser para automatización de navegador con IA.

## Índice

1. [Introducción](#introducción)
2. [Arquitectura](#arquitectura)
3. [Configuración](#configuración)
4. [Uso desde OpenClaw](#uso-desde-openclaw)
5. [Uso directo via HTTP API](#uso-directo-via-http-api)
6. [Ejemplos Prácticos](#ejemplos-prácticos)
7. [Solución de Problemas](#solución-de-problemas)

## Introducción

**Agent-Browser** es una herramienta de automatización de navegador desarrollada por Vercel Labs que permite a los agentes de IA interactuar con páginas web de forma determinista mediante un sistema de referencias de elementos.

### Características principales

- Navegación headless (sin ventana visible)
- Sistema de referencias deterministas (@e1, @e2, etc.)
- Extracción estructurada de contenido
- Screenshots y capturas de pantalla
- Llenado de formularios
- Clicks e interacciones con elementos
- Compatible con Chromium

## Arquitectura

En Molbot, agent-browser se ejecuta como un contenedor **sidecar** junto a openclaw-gateway:

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

### Volumen compartido

```
agent_browser_workspace/
├── screenshots/          # Capturas de pantalla
├── downloads/            # Archivos descargados
└── artifacts/            # Otros artefactos
```

## Configuración

### Variables de entorno

El servicio `agent-browser` se configura automáticamente en `docker-compose.yml`:

```yaml
agent-browser:
  environment:
    PORT: 9222              # Puerto del HTTP wrapper
    WORKSPACE: /workspace   # Directorio compartido
```

### Verificar estado

```bash
# Verificar que agent-browser está corriendo
docker compose ps agent-browser

# Ver logs
docker compose logs -f agent-browser

# Health check
curl http://localhost:9222/health
```

## Uso desde OpenClaw

El agente de OpenClaw puede usar agent-browser mediante el skill documentado en `skills/agent-browser/SKILL.md`.

### Flujo básico de trabajo

```
1. OPEN → Abrir URL
2. SNAPSHOT → Obtener estructura con referencias
3. INTERACTUAR → Click/Fill usando referencias
4. EXTRAER → Get text o screenshot
5. CLOSE (opcional) → Cerrar navegador
```

### Comandos disponibles

#### Abrir una URL
```
Open: https://example.com
```

#### Obtener snapshot (paso clave)
```
Snapshot: Get the current page state with interactive elements
```

El snapshot devuelve algo como:
```
- [ref=e1] Input: Search
- [ref=e2] Button: Submit
- [ref=e3] Link: About us
```

#### Click en elemento
```
Click reference: @e1
```

#### Llenar campo de texto
```
Fill reference: @e2 "texto a ingresar"
```

#### Obtener texto de elemento
```
Get text from: @e1
```

#### Tomar screenshot
```
Screenshot: Save current page as image
```

## Uso directo via HTTP API

Puedes usar agent-browser directamente desde cualquier aplicación que haga peticiones HTTP.

### Base URL

```
http://agent-browser:9222  # Desde otros contenedores Docker
http://localhost:9222      # Desde el host (requiere configuración nginx)
```

### Endpoints

#### 1. Health Check

```bash
GET /health
```

**Respuesta:**
```json
{
  "status": "healthy",
  "service": "agent-browser-http-wrapper",
  "timestamp": "2026-02-10T22:49:23.651Z"
}
```

#### 2. Abrir URL

```bash
POST /open
Content-Type: application/json

{
  "url": "https://example.com"
}
```

**Respuesta:**
```json
{
  "success": true,
  "error": null
}
```

#### 3. Obtener Snapshot

```bash
GET /snapshot?interactive=true&compact=true
```

**Parámetros:**
- `interactive` (bool): Solo elementos interactivos
- `compact` (bool): Salida compacta
- `depth` (number): Profundidad del DOM

**Respuesta:**
```json
{
  "success": true,
  "snapshot": "- [ref=e1] Button: Click me\n...",
  "refs": {
    "e1": {
      "element": "Button: Click me",
      "line": "- [ref=e1] Button: Click me"
    }
  },
  "rawLines": 42
}
```

#### 4. Click en Elemento

```bash
POST /click
Content-Type: application/json

{
  "ref": "e1"
}
```

**Alternativa con selector CSS:**
```json
{
  "selector": "#submit-button"
}
```

**Respuesta:**
```json
{
  "success": true,
  "result": "Clicked e1",
  "error": null
}
```

#### 5. Llenar Campo

```bash
POST /fill
Content-Type: application/json

{
  "ref": "e5",
  "text": "texto a ingresar"
}
```

**Respuesta:**
```json
{
  "success": true,
  "result": "Filled e5",
  "error": null
}
```

#### 6. Obtener Texto

```bash
GET /get-text?ref=e1
```

**O via POST:**
```bash
POST /get-text
Content-Type: application/json

{
  "ref": "e1"
}
```

**Respuesta:**
```json
{
  "success": true,
  "text": "Content of the element",
  "error": null
}
```

#### 7. Screenshot

```bash
POST /screenshot
Content-Type: application/json

{
  "filename": "screenshot.png",
  "full": false
}
```

**Respuesta:**
```json
{
  "success": true,
  "path": "/workspace/screenshot.png",
  "base64": "iVBORw0KGgoAAAANSUhEUg...",
  "error": null
}
```

#### 8. Comando Genérico

```bash
POST /exec
Content-Type: application/json

{
  "command": "back"
}
```

**Comandos disponibles:**
- Navegación: `back`, `forward`, `reload`
- Espera: `wait 5000` (milisegundos)
- Scroll: `scroll down`, `scroll up`
- Scripts: `run document.title`

#### 9. Cerrar Navegador

```bash
POST /close
```

## Ejemplos Prácticos

### Ejemplo 1: Búsqueda en GitHub

```bash
# 1. Abrir GitHub
curl -X POST http://agent-browser:9222/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/search"}'

# 2. Obtener snapshot
SNAPSHOT=$(curl -s http://agent-browser:9222/snapshot)
echo "$SNAPSHOT"

# Supongamos que encontramos:
# - [ref=e5] Input: Search
# - [ref=e6] Button: Search

# 3. Llenar campo de búsqueda
curl -X POST http://agent-browser:9222/fill \
  -H "Content-Type: application/json" \
  -d '{"ref": "e5", "text": "agent-browser"}'

# 4. Click en botón de búsqueda
curl -X POST http://agent-browser:9222/click \
  -H "Content-Type: application/json" \
  -d '{"ref": "e6"}'

# 5. Esperar resultados
curl -X POST http://agent-browser:9222/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "wait 3000"}'

# 6. Tomar screenshot
curl -X POST http://agent-browser:9222/screenshot \
  -H "Content-Type: application/json" \
  -d '{"filename": "github-search-results.png"}'
```

### Ejemplo 2: Login Automatizado

```bash
# 1. Abrir página de login
curl -X POST http://agent-browser:9222/open \
  -d '{"url": "https://example.com/login"}'

# 2. Obtener snapshot para encontrar campos
curl -s http://agent-browser:9222/snapshot

# Supongamos que encontramos:
# - [ref=e1] Input: Username
# - [ref=e2] Input: Password
# - [ref=e3] Button: Login

# 3. Llenar formulario
curl -X POST http://agent-browser:9222/fill \
  -d '{"ref": "e1", "text": "mi_usuario"}'

curl -X POST http://agent-browser:9222/fill \
  -d '{"ref": "e2", "text": "mi_password"}'

# 4. Submit
curl -X POST http://agent-browser:9222/click \
  -d '{"ref": "e3"}'

# 5. Verificar login exitoso
curl -s http://agent-browser:9222/snapshot
```

### Ejemplo 3: Scraping de Datos

```bash
# 1. Abrir página
curl -X POST http://agent-browser:9222/open \
  -d '{"url": "https://example.com/products"}'

# 2. Obtener snapshot
curl -s http://agent-browser:9222/snapshot > snapshot.txt

# 3. Extraer datos de múltiples elementos
# Supongamos que queremos extraer precios:
# - [ref=e10] Text: $29.99
# - [ref=e20] Text: $49.99
# - [ref=e30] Text: $99.99

for ref in e10 e20 e30; do
  text=$(curl -s "http://agent-browser:9222/get-text?ref=$ref" | jq -r '.text')
  echo "$ref: $text"
done
```

### Ejemplo 4: Uso desde el Chat de OpenClaw

En el chat de OpenClaw (`/chat`), puedes pedirle al agente:

```
"Navega a https://github.com/search, busca 'agent-browser',
toma un screenshot de los resultados y guárdalo como 'search-results.png'"
```

El agente usará el skill `agent-browser` para ejecutar estas tareas.

## Solución de Problemas

### El contenedor agent-browser no inicia

```bash
# Ver logs
docker compose logs agent-browser

# Reconstruir imagen
docker compose build --no-cache agent-browser

# Reiniciar servicio
docker compose restart agent-browser
```

### Error "Browser not ready"

El snapshot requiere que el navegador esté abierto. Siempre ejecuta `open` antes de `snapshot`.

```bash
# Correcto
POST /open → POST /snapshot

# Incorrecto
POST /snapshot (sin abrir primero)
```

### Health check falla

```bash
# Verificar que el servicio escucha
docker exec molbot-agent-browser netstat -tulpn | grep 9222

# Probar health check desde dentro del contenedor
docker exec molbot-agent-browser wget -O- http://localhost:9222/health
```

### Screenshots no se guardan

Verifica que el volumen `agent_browser_workspace` esté montado:

```bash
docker volume inspect molbot_agent_browser_workspace

# Ver contenido
docker exec molbot-agent-browser ls -la /workspace/
```

### Referencias cambian entre snapshots

Las referencias (@e1, @e2) son deterministas **mientras la página no cambie**. Si la página se actualiza dinámicamente, toma un nuevo snapshot antes de interactuar.

```bash
# Patrón correcto para páginas dinámicas
POST /open → GET /snapshot → POST /click → GET /snapshot → POST /click
```

## Referencia de Comandos agent-browser

### Navegación
- `open <url>` - Abrir URL
- `back` - Volver atrás
- `forward` - Ir adelante
- `reload` - Recargar página

### Interacción
- `click <ref>` - Click en elemento por referencia
- `click <selector>` - Click por selector CSS
- `fill <ref> "text"` - Llenar input
- `get text <ref>` - Obtener texto

### Información
- `snapshot` - Obtener snapshot completo
- `snapshot -i` - Solo elementos interactivos
- `snapshot -c` - Snapshot compacto

### Captura
- `screenshot` - Screenshot de viewport
- `screenshot --full` - Screenshot completo de página
- `screenshot "filename.png"` - Con nombre específico

### Utilidades
- `wait <ms>` - Esperar milisegundos
- `scroll down` / `scroll up` - Scroll vertical
- `run <js>` - Ejecutar JavaScript

## Recursos Adicionales

- [Repository oficial de agent-browser](https://github.com/vercel-labs/agent-browser)
- [Documentación del skill en Molbot](../data/molbot-workspace/agents/main/skills/agent-browser/SKILL.md)
- [Docker compose configuration](../docker-compose.yml)
