# 🌙 Moon API — Server-Side Code Protection & Sandbox Engine

> Original source code **never leaves the server**. Users receive a lightweight client stub and a project API key only.

## 🚀 Overview

Moon API is a server-side execution and protection system for Python scripts and algorithms:
- **AES-256 / Fernet Encryption**: Source code is stored encrypted at rest with a master secret key.
- **Sandboxed Execution**: Runs functions and scripts in isolated processes with memory, CPU, file size, and execution timeouts.
- **API Key Access Control**: Per-project cryptographic API keys (`moon_...`) with TTL expiration, rate limiting, and instant revocation.
- **Client Stub Generator**: Generates clean, zero-logic client scripts (`client.py`) that forward function calls and arguments to the server.
- **Developer Dashboard**: Full interactive web interface with live sandbox execution, project management, API key issuance, client downloads, and audit logs.

## 🌐 API Endpoints

| Endpoint | Method | Authentication | Description |
|---|---|---|---|
| `/` | `GET` | None | System status and service watermark |
| `/api/health` | `GET` | None | Health check endpoint |
| `/api/run` | `POST` | `X-API-Key` | Execute function (`action="call"`) or script (`action="script"`) with stdin |
| `/api/functions` | `GET` | `X-API-Key` | List callable public functions in the protected project |
| `/api/info` | `GET` | `X-API-Key` | Project metadata and key expiration timestamp |
| `/api/client-stub` | `GET` | None | Generate or download client distribution stub |
| `/admin/projects` | `POST`/`GET` | `X-Admin-Key` | Create or list encrypted projects |
| `/admin/projects/:id`| `DELETE` | `X-Admin-Key` | Delete project and deactivate linked keys |
| `/admin/keys` | `POST`/`GET` | `X-Admin-Key` | Issue new project API key or list keys |
| `/admin/keys/:id` | `DELETE` | `X-Admin-Key` | Revoke API key |
| `/admin/logs` | `GET` | `X-Admin-Key` | Execution audit trail logs |

## 💻 Quickstart

### Run with Node.js
```bash
npm install
npm run dev
```

App runs on `http://0.0.0.0:3000`.

### Calling a Remote Function
```bash
curl -X POST http://0.0.0.0:3000/api/run \
  -H "X-API-Key: moon_demo_secret_key_12345" \
  -H "Content-Type: application/json" \
  -d '{"function": "fib", "args": [10]}'
```

## 🚂 Deploy on Railway (Dockerfile)

This repo ships a `Dockerfile` (multi-stage: builds the frontend with Bun, then
runs on a slim image with `python3`/`pip` installed — required because the
server spawns `python3` to execute each project's protected code). Railway
auto-detects it; no extra setup beyond environment variables.

1. Push this repo to GitHub (or `railway up` from this folder with the Railway CLI).
2. In Railway: **New Project → Deploy from GitHub repo**, pick this repo.
   Railway reads `railway.json` and builds the included `Dockerfile` automatically.
3. Set environment variables under the service's **Variables** tab (see
   `.env.example` for the full list) — at minimum set `MOON_MASTER_SECRET`
   and `ADMIN_API_KEY` to real secrets instead of the development defaults
   baked into `server.ts`. Do **not** set `PORT` — Railway injects it
   automatically and the server already reads `process.env.PORT`.
4. **Persistent storage (important):** project/API-key data is stored in
   `projects_data.json`, written to the container's local disk. Container
   disks on Railway are **ephemeral** — every redeploy wipes them. To keep
   your projects and keys across deploys:
   - Add a **Volume** to the service in Railway (Settings → Volumes), e.g.
     mounted at `/data`.
   - Set the environment variable `DATA_DIR=/data` (or `DATA_FILE=/data/projects_data.json`
     for a custom filename). The server creates the file there automatically.
   - Without a volume, the service still works, but every project/key you
     create is lost on the next deploy or restart.
5. Once deployed, confirm `GET /api/health` returns `200` (Railway's health
   check in `railway.json` already points here), then use the dashboard at
   your Railway-assigned URL exactly as with the local/Render setup.
