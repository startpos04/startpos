# ---------- Base stage ----------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---------- Dependencies stage ----------
FROM base AS install
COPY package.json pnpm-lock.yaml* ./
# Mount pnpm cache for faster re-installs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- Prisma Generation stage ----------
FROM install AS prisma-gen
COPY . .
RUN pnpm prisma generate

# ---------- Build stage ----------
FROM prisma-gen AS builder
COPY . .
# Now this only re-runs if code changes, but skips re-installing and re-generating Prisma
RUN pnpm run build

# ---------- Runtime stage ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]