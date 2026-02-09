const UI_SECRET = process.env.UI_SECRET;

function authMiddleware(req, res, next) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [AUTH] ${req.method} ${req.path} - Header X-UI-Secret: ${req.headers["x-ui-secret"] ? "presente" : "ausente"}\n`;
  process.stdout.write(logMsg);
  process.stderr.write(logMsg);
  console.log(`[${timestamp}] [AUTH] ${req.method} ${req.path}`);
  
  if (!UI_SECRET) {
    const warnMsg = `[${timestamp}] [AUTH WARN] UI_SECRET no configurado, permitiendo acceso\n`;
    process.stdout.write(warnMsg);
    return next();
  }
  // Solo leer del header, no del body (el body puede no estar parseado aún)
  const secret = req.headers["x-ui-secret"];
  if (secret !== UI_SECRET) {
    const errMsg = `[${timestamp}] [AUTH ERROR] No autorizado - Secret recibido: ${secret ? "presente pero incorrecto" : "ausente"}\n`;
    process.stdout.write(errMsg);
    process.stderr.write(errMsg);
    return res.status(401).json({ error: "Unauthorized" });
  }
  const successMsg = `[${timestamp}] [AUTH OK] Autenticación exitosa\n`;
  process.stdout.write(successMsg);
  process.stderr.write(successMsg);
  next();
}

module.exports = authMiddleware;
