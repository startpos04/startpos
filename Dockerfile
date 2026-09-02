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
# Copy monorepo root manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy all workspace package.json files so pnpm can resolve the graph
COPY apps/web/package.json ./apps/web/package.json
COPY packages/platform/package.json ./packages/platform/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- Dev stage ----------
FROM install AS dev
RUN --mount=type=cache,target=/var/cache/apt apt-get update -y \
  && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*
# Copy full source after deps are installed
COPY . .
# Ensure .env files exist so --env-file never fails inside the container
RUN touch apps/web/.env apps/web/.env.local apps/web/.env.config
# Set schema generation environment variables for non-interactive mode
ENV SCHEMA_AUTO_CONFIRM=yes
ENV DEPLOYMENT_COUNTRY=PH
# Generate Prisma schema and client from base files
RUN pnpm --filter @startpos/web run prisma:generate:docker
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@startpos/web", "run", "dev:docker"]

# ---------- Production build ----------
FROM install AS builder
COPY . .
ENV SCHEMA_AUTO_CONFIRM=yes
ENV DEPLOYMENT_COUNTRY=PH
RUN pnpm --filter @startpos/web run prisma:generate:docker
RUN pnpm --filter @startpos/web run build

# ---------- Production runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.output ./apps/web/.output
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "apps/web/.output/server/index.mjs"]
