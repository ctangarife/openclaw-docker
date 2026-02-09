require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const credentialsRouter = require("./routes/credentials");
const configRouter = require("./routes/config");
const gatewayRouter = require("./routes/gateway");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// Forzar que los logs se escriban inmediatamente sin buffering
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');
if (process.stdout.isTTY) {
  process.stdout.setDefaultEncoding('utf8');
}

app.use(cors({ origin: true }));

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

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "molbot-config-service" });
});

// Endpoint de prueba SIN autenticación para verificar que el servidor recibe peticiones
app.get("/test-ping", (req, res) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [GET /test-ping] Petición recibida\n`;
  process.stdout.write(logMsg);
  process.stderr.write(logMsg);
  console.log(`[${timestamp}] [GET /test-ping] Petición recibida`);
  res.json({ status: "ok", timestamp, message: "Servidor funcionando" });
});

// Endpoint de prueba para verificar logs
app.get("/test-logs", (req, res) => {
  console.log("TEST LOGS ENDPOINT CALLED");
  process.stdout.write("STDOUT: TEST LOGS ENDPOINT\n");
  process.stderr.write("STDERR: TEST LOGS ENDPOINT\n");
  res.json({ test: "logs", timestamp: new Date().toISOString() });
});

// Redirección al Dashboard de OpenClaw con token (sin comandos ni pegar token).
// Por defecto redirige a http://localhost/chat?token=... (puerto 80, sin :18789).
// Para otro host/puerto define OPENCLAW_DASHBOARD_PUBLIC_URL en .env (ej. http://192.168.1.10).
function redirectOpenClawDashboard(req, res) {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) {
    return res.status(503).send("OPENCLAW_GATEWAY_TOKEN no configurado en el servidor.");
  }
  const raw = (process.env.OPENCLAW_DASHBOARD_PUBLIC_URL || "").trim();
  const base = raw || "http://localhost";
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
