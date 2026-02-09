#!/bin/bash
# Crea la DB molbot y las colecciones. Usa el usuario root creado por la imagen con MONGO_INITDB_ROOT_PASSWORD.
# Solo se ejecuta la primera vez (volumen vacío). Para re-crear: docker compose down -v y volver a levantar.

set -e
ROOT_PWD="${MONGO_INITDB_ROOT_PASSWORD}"
MONGO_DB="${MONGO_DB:-molbot}"

if [ -z "$ROOT_PWD" ]; then
  echo "MONGO_INITDB_ROOT_PASSWORD not set"
  exit 1
fi

mongosh admin -u root -p "$ROOT_PWD" --eval "
  const db = db.getSiblingDB('${MONGO_DB}');
  db.createCollection('api_credentials');
  db.api_credentials.createIndex({ provider: 1 });
  db.api_credentials.createIndex({ enabled: 1 });
  db.createCollection('app_config');
  db.app_config.createIndex({ key: 1 }, { unique: true });
"
