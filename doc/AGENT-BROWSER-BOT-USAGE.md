# Cómo el Bot Usa Agent-Browser

Guía de uso de agent-browser desde el chat de OpenClaw.

## Configuración Actual

El bot ahora tiene un **tool personalizado** llamado `agent_browser` que permite interactuar con el servicio agent-browser.

### Archivos del Sistema

```
data/molbot-workspace/agents/main/agent/
├── agent.json           ← Configuración del agente (tool habilitado)
└── tools/
    └── agent-browser.mjs  ← Tool personalizado para agent-browser
```

## Cómo Funciona

### Arquitectura

```
Usuario en Chat
       ↓
   OpenClaw Agent
       ↓
   Tool: agent_browser
       ↓
   HTTP Request (fetch)
       ↓
   agent-browser container (puerto 9222)
       ↓
   agent-browser CLI → Chromium headless
```

### Variables de Entorno

El servicio `openclaw-gateway` tiene configurada:
- `AGENT_BROWSER_URL=http://agent-browser:9222`

Esta URL es usada por el tool para hacer peticiones HTTP.

## Uso desde el Chat

### Comandos Básicos

El bot entiende comandos en lenguaje natural. Aquí hay ejemplos:

#### 1. Abrir una URL

```
"Abre https://example.com"
"Navega a https://github.com"
"Ve a https://google.com"
```

#### 2. Obtener Snapshot

```
"Toma un snapshot de la página"
"¿Qué elementos hay en la página?"
"Muéstrame la estructura de la página actual"
```

#### 3. Interactuar con Elementos

```
"Haz click en @e5"
"Click en el botón de buscar"
"Haz click en el enlace del artículo"
```

```
"Llena el campo @e3 con 'mi texto'"
"Escribe 'search query' en el campo de búsqueda"
"Pon 'hola mundo' en el input"
```

```
"¿Qué dice @e10?"
"Obtén el texto del elemento @e2"
"¿Cuál es el contenido de @e15?"
```

#### 4. Screenshots

```
"Toma un screenshot"
"Saca una foto de la página"
"Captura la pantalla actual"
```

```
"Guarda el screenshot como results.png"
"Toma un screenshot llamado prueba.png"
```

## Ejemplos Completos

### Ejemplo 1: Búsqueda en GitHub

```
Usuario: "Abre https://github.com/search, busca 'agent-browser',
         toma un screenshot de los resultados"

Bot: Ejecuta los siguientes pasos:
1. tool: agent_browser, action: "open", url: "https://github.com/search"
2. tool: agent_browser, action: "snapshot"
3. tool: agent_browser, action: "fill", ref: "@e5", text: "agent-browser"
4. tool: agent_browser, action: "click", ref: "@e6"
5. tool: agent_browser, action: "screenshot", filename: "github-results.png"
```

### Ejemplo 2: Scraping de Datos

```
Usuario: "Abre https://example.com/products, extrae los precios
         de los primeros 3 productos"

Bot: Ejecuta los siguientes pasos:
1. tool: agent_browser, action: "open", url: "https://example.com/products"
2. tool: agent_browser, action: "snapshot"
3. tool: agent_browser, action: "get_text", ref: "@e10" (precio 1)
4. tool: agent_browser, action: "get_text", ref: "@e20" (precio 2)
5. tool: agent_browser, action: "get_text", ref: "@e30" (precio 3)
```

### Ejemplo 3: Login Automatizado

```
Usuario: "Entra en https://example.com/login, pon mi usuario 'test@example.com'
         y password 'secreto123', haz click en login"

Bot: Ejecuta los siguientes pasos:
1. tool: agent_browser, action: "open", url: "https://example.com/login"
2. tool: agent_browser, action: "snapshot"
3. tool: agent_browser, action: "fill", ref: "@e1", text: "test@example.com"
4. tool: agent_browser, action: "fill", ref: "@e2", text: "secreto123"
5. tool: agent_browser, action: "click", ref: "@e3"
```

## Sistema de Referencias

El bot usa el sistema de referencias de agent-browser:

- `@e1`, `@e2`, `@e3`, ... = Referencias a elementos interactivos
- Las referencias se obtienen del comando `snapshot`
- Son deterministas y estables mientras la página no cambie

### Flujo Típico

```
1. OPEN URL
2. SNAPSHOT → Obtener referencias (@e1, @e2, etc.)
3. Interactuar con elementos usando referencias
4. Obtener datos o screenshot
```

## Configuración del Tool

### Archivo: `agent.json`

```json
{
  "tools": {
    "profile": "full",
    "allowed": ["agent_browser"],
    "forbidden": ["process"],
    ...
  }
}
```

### Archivo: `tools/agent-browser.mjs`

El tool exporta:

- `metadata` = Información del tool (nombre, descripción, parámetros)
- `default function` = Función principal que ejecuta las acciones

## Solución de Problemas

### El bot no reconoce el comando "agent_browser"

**Solución**: El bot debería entender comandos en lenguaje natural. No es necesario usar el nombre del tool directamente.

### Error: "Cannot reach agent-browser service"

**Verificar**:
```bash
# Desde el host
curl http://agent-browser:9222/health

# Desde el contenedor gateway
docker exec molbot-openclaw-gateway wget -O- http://agent-browser:9222/health
```

### Error: "Tool not found: agent_browser"

**Verificar** que el tool esté copiado:
```bash
docker exec molbot-openclaw-gateway ls -la /home/node/.openclaw/agents/main/agent/tools/
```

### El snapshot muestra muchos elementos

**Solución**: Usa comandos más específicos:
- "Toma un snapshot solo de elementos interactivos"
- "Muéstrame solo los botones y enlaces"

## Pruebas Rápidas

Desde el chat de OpenClaw (`http://localhost/openclaw-dashboard`):

```
# Test 1: Abrir página
"Abre https://example.com"

# Test 2: Snapshot
"Toma un snapshot"

# Test 3: Screenshot
"Toma un screenshot"

# Test 4: Flujo completo
"Abre https://github.com/search, busca 'openclaw',
toma un screenshot de los resultados"
```

## Referencias

- **Tutorial completo**: `doc/AGENT-BROWSER-TUTORIAL.md`
- **API HTTP**: `http://agent-browser:9222` (interna)
- **Skill documentación**: `data/molbot-workspace/agents/main/skills/agent-browser/SKILL.md`
