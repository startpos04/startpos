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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- Dev stage ----------
FROM install AS dev
RUN --mount=type=cache,target=/var/cache/apt apt-get update -y \
  && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*
COPY . .
# Ensure .env.local exists so --env-file=.env.local never fails inside the container.
# On a dev machine it is gitignored and holds local overrides; inside Docker it stays empty.
RUN touch .env.local
ENV NODE_ENV=development
EXPOSE 3000 51212
CMD ["pnpm", "run", "dev:docker"]

# ---------- Production build ----------
FROM install AS builder
COPY . .
RUN pnpm run build

# ---------- Production runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
