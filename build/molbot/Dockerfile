# Molbot: Node 22 + OpenClaw. Instalación vía one-liner oficial; el setup interactivo falla sin TTY y se tolera.

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates bsdutils expect \
  && rm -rf /var/lib/apt/lists/*

# Instalador oficial: instala OpenClaw; el setup interactivo falla sin TTY y se tolera.
ENV CI=1
RUN curl -fsSL https://openclaw.ai/install.sh | bash || true

# Localizar openclaw (script: login shell + rutas habituales) y dejarlo en /usr/local/bin.
COPY build/molbot/post-install.sh /tmp/post-install.sh
RUN sed -i 's/\r$//' /tmp/post-install.sh 2>/dev/null || true && \
    chmod +x /tmp/post-install.sh && \
    sh /tmp/post-install.sh && \
    rm /tmp/post-install.sh

# Usuario dedicado (UID/GID 1001)
RUN groupadd -r molbot -g 1001 && useradd -r -u 1001 -g molbot -m -d /home/molbot -s /bin/sh molbot

# Fake TTY y scripts en /opt/molbot; el usuario molbot debe poder leerlos
RUN mkdir -p /opt/molbot \
  && yes "" | head -n 150 > /opt/molbot/answers.txt

COPY build/molbot/entrypoint.sh build/molbot/onboard-expect.exp /opt/molbot/
RUN sed -i 's/\r$//' /opt/molbot/entrypoint.sh /opt/molbot/onboard-expect.exp 2>/dev/null || true && \
    chmod +x /opt/molbot/entrypoint.sh /opt/molbot/onboard-expect.exp && \
    chown -R molbot:molbot /opt/molbot

EXPOSE 18789
USER molbot
ENV OPENCLAW_HOME=/home/molbot/.openclaw
WORKDIR /home/molbot
ENTRYPOINT ["/opt/molbot/entrypoint.sh"]
