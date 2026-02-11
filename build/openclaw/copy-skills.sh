#!/bin/sh
# Copiar skills desde el workspace al inicio del contenedor
# Ejecutar este script en post-start o agregar a entrypoint.sh

WORKSPACE_SKILLS_DIR="/home/node/.openclaw/workspace/agents/main/skills"
CONFIG_SKILLS_DIR="/home/node/.openclaw/skills"

if [ -d "$WORKSPACE_SKILLS_DIR" ]; then
  echo "📦 Copiando skills personalizados desde workspace..." >&2
  mkdir -p "$CONFIG_SKILLS_DIR" 2>/dev/null || true
  cp -r "$WORKSPACE_SKILLS_DIR"/* "$CONFIG_SKILLS_DIR/" 2>/dev/null || true
  chown -R node:node "$CONFIG_SKILLS_DIR" 2>/dev/null || true
  chmod -R 644 "$CONFIG_SKILLS_DIR"/* 2>/dev/null || true
  echo "✅ Skills personalizados copiados" >&2
fi

echo "Skills disponibles:"
ls "$CONFIG_SKILLS_DIR" 2>/dev/null || true