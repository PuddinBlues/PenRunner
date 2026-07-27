# API PenRunner su Railway (o qualsiasi host Docker).
# Build context = ROOT del monorepo:  docker build -f apps/api/Dockerfile .
FROM node:22-slim

WORKDIR /app
RUN corepack enable

# Manifest del workspace prima (cache dei layer sulle sole dipendenze)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @penrunner/api...

# Sorgenti (l'API gira con tsx: nessuno step di build, come in dev)
COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 3001

# Migrazioni al boot, poi il server: un deploy = schema allineato.
CMD ["sh", "-c", "pnpm --filter @penrunner/db migrate && pnpm --filter @penrunner/api start"]
