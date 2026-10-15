# ── Stage 1: build ────────────────────────────────────────────────────────────
# Run on the native build platform to avoid slow QEMU emulation for npm.
# The compiled output is pure JS so it runs on any target platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Install production deps natively too — all deps (mysql2, pino, leaflet) are
# pure JS with no platform-specific binaries, so native-built node_modules
# work on any arch.
RUN npm ci --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.title="Zygarde" \
      org.opencontainers.image.description="Web-based area management dashboard for Dragonite scanner deployments" \
      org.opencontainers.image.url="https://hub.docker.com/r/xerock/zygarde" \
      org.opencontainers.image.source="https://github.com/XerockXMG/zygarde" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

WORKDIR /app

# Copy production deps and compiled output from the native build stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build

# Persistent directory for route backup files written during Koji generation.
# Mount a volume here to survive container restarts: -v /host/route-backups:/app/route-backups
RUN mkdir -p route-backups

# Run as a non-root user — reuse the node user (uid/gid 1000) built into node:alpine
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Environment variables are injected at runtime via -e / --env-file / compose.
# Do NOT bake a .env file into the image.
CMD ["node", "build"]
