#!/bin/sh
# Healthcheck para MongoDB. Usa variables del contenedor (evita problemas de comillas en compose).
[ -z "$MONGO_INITDB_ROOT_PASSWORD" ] && exit 1
exec mongosh --quiet admin -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --eval 'db.adminCommand("ping")'
