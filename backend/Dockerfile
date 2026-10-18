# syntax=docker/dockerfile:1
#
# FinCore API: NestJS + Prisma on Node 20.
# The builder compiles TypeScript and generates the Prisma client for this
# exact base image; the runtime keeps only production dependencies and runs as
# the unprivileged `node` user.

ARG NODE_IMAGE=node:20.20.2-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Prisma's query engine links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
# One-off maintenance scripts (bootstrap users, actor key):
#   docker compose exec api node scripts/<name>.mjs
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
