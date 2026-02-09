# Build OpenClaw from official repo (zero manual steps).
# See https://docs.openclaw.ai/install/docker

# -----------------------------------------------------------------------------
# Stage 1: clone and build
# -----------------------------------------------------------------------------
FROM node:22-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /src

ARG OPENCLAW_REPO=https://github.com/openclaw/openclaw.git
ARG OPENCLAW_REF=main
RUN git clone --depth 1 --branch "${OPENCLAW_REF}" "${OPENCLAW_REPO}" .

RUN pnpm install --frozen-lockfile
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

# -----------------------------------------------------------------------------
# Stage 2: runtime image
# -----------------------------------------------------------------------------
FROM node:22-bookworm

# --chown evita RUN chown -R (muy lento con miles de archivos en node_modules)
COPY --from=builder --chown=node:node /src /app
WORKDIR /app

# Inyecta OPENCLAW_GATEWAY_TOKEN en openclaw.json al arrancar (gateway.auth + gateway.remote)
# Sincroniza API keys desde MongoDB a auth-profiles.json
COPY --chown=node:node build/openclaw/entrypoint.sh /app/entrypoint.sh
COPY --chown=node:node build/openclaw/inject-token.cjs /app/inject-token.cjs
COPY --chown=node:node build/openclaw/sync-auth-profiles.cjs /app/sync-auth-profiles.cjs
COPY --chown=node:node build/openclaw/generate-env-from-mongo.cjs /app/generate-env-from-mongo.cjs
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh
# Instalar mongoose para sincronización de credenciales desde MongoDB
# Usar pnpm con flag -w para agregar a la raíz del workspace
RUN corepack enable && pnpm add -w mongoose@^8.0.3

# Instalar gosu para poder cambiar de usuario después de corregir permisos
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# No establecer USER aquí, lo manejamos en el entrypoint después de corregir permisos
# USER node

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured"]
