# syntax=docker/dockerfile:1

#############################################
# Stage 1 — build (frontend + full deps)
#############################################
FROM oven/bun:1 AS builder
WORKDIR /app

# Install all deps first (better layer caching: only re-runs when
# package.json/bun.lock change, not on every source edit).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Now copy the rest of the source and build the React/Vite frontend.
# (server.ts needs no build step — Bun runs TypeScript directly at runtime.)
COPY . .
ENV NODE_ENV=production
RUN bun run build

#############################################
# Stage 2 — runtime (slim, + python3)
#############################################
FROM oven/bun:1-slim AS runtime
WORKDIR /app

# python3 + pip are a HARD requirement at runtime: executePython() in
# server.ts spawns `python3` as a subprocess to run each protected project's
# decrypted code, and that same python3 auto-installs whatever third-party
# packages the project imports (see auto_install_missing in server.ts).
# python3-venv is included because it also provides the `ensurepip` module,
# used as a one-time bootstrap if a base image ever ships python3 without
# pip preinstalled. ca-certificates is required for pip/urllib to validate
# HTTPS certs (both for installing packages and for the Telegram bot API).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         python3 \
         python3-pip \
         python3-venv \
         ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Debian's system pip refuses plain `pip install` as "externally managed"
# (PEP 668); the Python auto-installer in server.ts already passes
# --break-system-packages / --target itself, but setting this too covers any
# other direct pip invocation.
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Only the production dependency tree is needed at runtime — devDependencies
# (vite, tailwind, typescript, ...) were only needed to build dist/ above,
# and the server only imports vite lazily inside a dev-only code path, so a
# production-only install here is safe and keeps the image smaller.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Built frontend + server source. projects_data.json seeds the store if no
# volume is mounted yet (see the Railway Volume note in README.md) — if one
# IS mounted at DATA_DIR/DATA_FILE, that file takes precedence after the
# first write and this copy is irrelevant.
COPY --from=builder /app/dist ./dist
COPY server.ts telegramBot.ts ./
COPY projects_data.json ./

# Railway injects PORT at runtime; server.ts already reads process.env.PORT
# (falling back to 3000), so nothing else to configure here.
EXPOSE 3000

CMD ["bun", "server.ts"]
