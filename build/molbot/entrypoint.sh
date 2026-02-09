#!/bin/sh
# Entrypoint: opcionalmente ejecuta openclaw onboard con fake TTY y valores por defecto, luego inicia el gateway.

set -e
OPENCLAW_HOME="${OPENCLAW_HOME:-/home/molbot/.openclaw}"
CONFIG_FILE="${OPENCLAW_HOME}/openclaw.json"

# Token del Gateway: quien conecte (p. ej. Cursor) debe usarlo. Por defecto un valor de desarrollo.
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-molbot-local-dev}"
EXTRA_ARGS="--host 0.0.0.0 --port 18789 --allow-unconfigured --token $GATEWAY_TOKEN --verbose"

# Si ya hay config o se pide saltar el onboard, ir directo al gateway
if [ -f "$CONFIG_FILE" ] || [ -n "$OPENCLAW_SKIP_ONBOARD" ]; then
  exec openclaw gateway $EXTRA_ARGS
fi

# Ejecutar onboard con fake TTY y respuestas por defecto
if command -v expect >/dev/null 2>&1; then
  # Con expect: respuestas automáticas
  expect /opt/molbot/onboard-expect.exp 2>/dev/null || true
else
  # Sin expect: script + archivo de Enters (acepta opciones por defecto)
  timeout 90 script -q -c "openclaw onboard" /dev/null < /opt/molbot/answers.txt 2>/dev/null || true
fi

# Arrancar el gateway (aunque el onboard falle o no haya completado)
exec openclaw gateway $EXTRA_ARGS
