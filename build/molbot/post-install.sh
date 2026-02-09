#!/bin/sh
# Localiza openclaw tras el one-liner (puede estar en /root/.local/bin o en PATH de login)
# y lo deja en /usr/local/bin para que el usuario molbot lo tenga.

set -e
OPENCLAW_BIN=""

# Login shell por si el instalador modificó .profile/.bashrc
if command -v bash >/dev/null 2>&1; then
  OPENCLAW_BIN=$(bash -lc 'which openclaw 2>/dev/null' 2>/dev/null) || true
fi
[ -n "$OPENCLAW_BIN" ] && [ -x "$OPENCLAW_BIN" ] || OPENCLAW_BIN=""

# Rutas habituales si which no lo encontró
if [ -z "$OPENCLAW_BIN" ]; then
  for dir in /root/.local/bin /usr/local/bin; do
    if [ -x "$dir/openclaw" ]; then
      OPENCLAW_BIN="$dir/openclaw"
      break
    fi
  done
fi

if [ -n "$OPENCLAW_BIN" ] && [ -x "$OPENCLAW_BIN" ]; then
  if [ "$(dirname "$OPENCLAW_BIN")" != "/usr/local/bin" ]; then
    cp -p "$OPENCLAW_BIN" /usr/local/bin/openclaw
  fi
  echo "openclaw listo en /usr/local/bin"
else
  echo "ERROR: openclaw no encontrado tras el instalador. Revisa que el one-liner haya instalado correctamente."
  exit 1
fi
