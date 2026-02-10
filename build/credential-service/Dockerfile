# Molbot Credential Service
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY data/credential-service/package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY data/credential-service/ ./

# Copiar librería de encriptación compartida
COPY --chown=node:node data/config-service/lib/encrypt.js /tmp/encrypt.js

# Crear usuario no-root
RUN addgroup -g 1001 -S node && \
    adduser -S node -u 1001 && \
    chown -R node:node /app

# Usuario para ejecutar
USER node

# Exponer socket (interno, no puerto)
VOLUME ["/tmp"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "const net=require('net');const c=require('net').createConnection('/tmp/credential.sock');c.on('connect',()=>{c.write(JSON.stringify({action:'health'})+'\\n');c.on('data',d=>{console.log(d.toString());process.exit(0)});c.on('error',()=>process.exit(1)});c.setTimeout(5000,()=>process.exit(1));" || exit 1

CMD ["node", "index.js"]
