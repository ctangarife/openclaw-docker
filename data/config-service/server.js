require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const credentialsRouter = require("./routes/credentials");
const configRouter = require("./routes/config");
const gatewayRouter = require("./routes/gateway");
const auditRouter = require("./routes/audit");
const notificationsRouter = require("./routes/notifications");
const channelsRouter = require("./routes/channels");
const telegramRouter = require("./routes/telegram");
const integrationsRouter = require("./routes/integrations");
const authMiddleware = require("./middleware/auth");
const { getSystemHealth, getSimpleHealth } = require("./lib/health-check");
const { auditMiddleware, notify } = require("./lib/audit-log");
const { sseManager, notify: sseNotify } = require("./lib/notifications");

const app = express();
const PORT = process.env.PORT || 3001;

// Forzar que los logs se escriban inmediatamente sin buffering
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');
if (process.stdout.isTTY) {
  process.stdout.setDefaultEncoding('utf8');
}

app.use(cors({ origin: true }));

// Middleware de auditoría - loggea cambios en credenciales, config, etc.
app.use(auditMiddleware());

// Middleware de logging ANTES de cualquier otra cosa - FORZAR escritura inmediata
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${req.method} ${req.path}\n`;
  // Múltiples métodos para asegurar que se vea
  process.stdout.write(logMsg);
  process.stderr.write(logMsg);
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  console.error(`[STDERR] [${timestamp}] ${req.method} ${req.path}`);
  if (req.path.startsWith('/api/')) {
    process.stdout.write(`[API] ${req.method} ${req.path} - Headers: x-ui-secret=${req.headers['x-ui-secret'] ? 'present' : 'missing'}\n`);
  }
  next();
});

// Configurar express.json para aceptar body vacío sin error
app.use(express.json({ strict: false }));

// Endpoint de prueba SIN autenticación para verificar que el servidor recibe peticiones
app.get("/test-ping", (req, res) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [GET /test-ping] Petición recibida\n`;
  process.stdout.write(logMsg);
  process.stderr.write(logMsg);
  console.log(`[${timestamp}] [GET /test-ping] Petición recibida`);
  res.json({ status: "ok", timestamp, message: "Servidor funcionando" });
});

app.use("/api/credentials", authMiddleware, credentialsRouter);
app.use("/api/config", authMiddleware, configRouter);
app.use("/api/gateway", authMiddleware, gatewayRouter);
app.use("/api/audit", auditRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/channels", authMiddleware, channelsRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/integrations", authMiddleware, integrationsRouter);

// Health check con dos modos:
// - Simple (para load balancers): GET /health
// - Detallado (para monitoreo): GET /health?detailed=true
app.get("/health", async (req, res) => {
  const detailed = req.query.detailed === 'true';

  if (detailed) {
    try {
      const health = await getSystemHealth();

      // Determinar HTTP status code basado en health status
      const statusCode = health.overall === 'unhealthy' ? 503
                        : health.overall === 'warning' ? 200  // Warning sigue siendo 200 pero con info
                        : 200;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        overall: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Health check simple para load balancers
    const simple = await getSimpleHealth();
    const statusCode = simple.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      status: simple.status,
      service: "molbot-config-service"
    });
  }
});

// Redirección al Dashboard de OpenClaw con token (sin comandos ni pegar token).
// Detecta automáticamente el host desde la request, o usa OPENCLAW_DASHBOARD_PUBLIC_URL si está configurada.
// Ejemplo de configuración manual en .env: OPENCLAW_DASHBOARD_PUBLIC_URL=http://192.168.1.10
function redirectOpenClawDashboard(req, res) {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) {
    return res.status(503).send("OPENCLAW_GATEWAY_TOKEN no configurado en el servidor.");
  }

  // Prioridad: 1) Variable de entorno, 2) Host detectado desde la request, 3) localhost como fallback
  let base;
  const raw = (process.env.OPENCLAW_DASHBOARD_PUBLIC_URL || "").trim();

  if (raw) {
    // Usar URL configurada explícitamente en .env
    base = raw;
  } else {
    // Detectar host desde la request (soporta IP, dominio, localhost)
    // Nginx debe reenviar los headers X-Forwarded-* o Host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';

    // Remover puerto si está presente (para usar puerto 80 por defecto)
    const hostWithoutPort = host.split(':')[0];
    base = `${protocol}://${hostWithoutPort}`;
  }

  // El Control UI acepta ?gatewayUrl=ws://... para configurar el WebSocket (se guarda en localStorage)
  // Redirigir a /set-gateway-token para que Nginx setee la cookie, luego a /chat con gatewayUrl
  const baseClean = base.replace(/\/$/, "");
  const wsUrl = baseClean.replace(/^http/, "ws");
  const url = `${baseClean}/set-gateway-token?token=${encodeURIComponent(token)}&gatewayUrl=${encodeURIComponent(wsUrl)}`;
  res.redirect(302, url);
}
app.get("/openclaw-dashboard", redirectOpenClawDashboard);
app.get("/openclaw-dashboard/", redirectOpenClawDashboard);

async function start() {
  const uri =
    process.env.MONGO_URI ||
    (process.env.MONGO_PASSWORD &&
      `mongodb://${encodeURIComponent(process.env.MONGO_INITDB_ROOT_USERNAME || "root")}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST || "mongodb"}:27017/${process.env.MONGO_DB || "molbot"}?authSource=admin`);
  if (!uri) {
    console.error("MONGO_URI or MONGO_PASSWORD is required");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("MongoDB connected");

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Config service listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
