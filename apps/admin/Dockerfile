# Build context: monorepo root (web/)
# Run: docker build -f apps/admin/Dockerfile .

# ---------- Base stage ----------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

# ---------- Dependencies stage ----------
FROM base AS install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/platform/package.json ./packages/platform/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- Dev stage ----------
FROM install AS dev
RUN --mount=type=cache,target=/var/cache/apt apt-get update -y \
  && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN touch apps/admin/.env apps/admin/.env.local .env.config
ENV SCHEMA_AUTO_CONFIRM=yes
ENV DEPLOYMENT_COUNTRY=PH
RUN pnpm --filter @startpos/platform run prisma:generate
ENV NODE_ENV=development
EXPOSE 3001
CMD ["pnpm", "--filter", "@startpos/admin", "run", "dev:docker"]

# ---------- Production build ----------
FROM install AS builder
COPY . .
RUN touch .env.config
ENV SCHEMA_AUTO_CONFIRM=yes
ENV DEPLOYMENT_COUNTRY=PH
RUN pnpm --filter @startpos/platform run prisma:generate
RUN pnpm --filter @startpos/admin run build

# ---------- Production runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/admin/.output ./apps/admin/.output
COPY --from=builder /app/apps/admin/package.json ./apps/admin/package.json
COPY --from=builder /app/package.json ./package.json
EXPOSE 3001
CMD ["node", "apps/admin/.output/server/index.mjs"]
