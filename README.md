# Molbot

Administración centralizada para el bot (OpenClaw): configuración y credenciales desde una interfaz, persistidas en MongoDB.

## Stack

- **MongoDB**, **config-service** (API Node), **UI** (Vue 3), **Nginx**
- **OpenClaw Gateway** (imagen construida desde el [repo oficial](https://github.com/openclaw/openclaw) en `build/openclaw/Dockerfile`)

Todo se levanta con Docker Compose; no hace falta clonar ni construir nada a mano. La primera vez, la construcción de la imagen de OpenClaw (clone + build del repo oficial) puede tardar varios minutos.

### Cómo levantar

```bash
cp env.template .env
docker compose up -d --build
```

**Si MongoDB queda "unhealthy"** (logs: `UserNotFound: Could not find user "root"`): la imagen oficial solo crea el usuario root cuando el volumen `/data/db` está **vacío**. Si el volumen tiene datos de una ejecución anterior, no se crea root. Solución:

```bash
docker compose down -v
docker volume ls
# Comprobar que no aparece molbot_mongodb_data; si aparece: docker volume rm molbot_mongodb_data
docker compose up -d
```

El volumen tiene nombre fijo `molbot_mongodb_data` para que `down -v` lo elimine siempre.

- **UI Molbot:** http://localhost (sesión con `UI_SECRET` de `.env`).
- **Dashboard OpenClaw (con token ya aplicado):** http://localhost/openclaw-dashboard — redirige a `localhost:18789/chat?token=...`; no hace falta pegar el token. (Reconstruir `config-service` si da 404.)
- **Gateway OpenClaw (puerto directo):** http://localhost:18789 para el Dashboard y la API (el Dashboard no funciona bien tras proxy con prefijo, por eso la redirección apunta al puerto).
- **Config/workspace:** `data/molbot-workspace`. Si quieres reconfigurar: `docker compose --profile tools run --rm openclaw-cli onboard --no-install-daemon`.

- [doc/PRIMERA-ITERACION.md](doc/PRIMERA-ITERACION.md) – Mongo, config-service, UI.
- [doc/OPENCLAW-DOCKER.md](doc/OPENCLAW-DOCKER.md) – Comandos OpenClaw (onboard, canales, dashboard).
