# API, worker, and migrations (design §7). Build from the repository root:
#   docker build -f apps/api/Dockerfile --target api .
#   docker build -f apps/api/Dockerfile --target migrate .
# The `api` image runs the API by default and the worker with `node dist/worker.js`.

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.11.2
WORKDIR /app

# Package manifests first, so dependencies are cached until they change.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Everything needed to build, and to run migrations (the Prisma CLI is a dev dependency).
FROM manifests AS builder
# argon2 compiles its native binding if no prebuilt one matches.
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --filter "@studybook/api..."
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/api apps/api
# prisma.config.ts requires DATABASE_URL, but `prisma generate` never connects: a placeholder will do.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    sh -c 'pnpm --filter @studybook/shared build && pnpm --filter @studybook/api build'

# One-shot: applies pending migrations, then exits (design §7: migrations run on start).
FROM builder AS migrate
WORKDIR /app/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM manifests AS prod-deps
RUN apk add --no-cache python3 make g++
RUN pnpm install --frozen-lockfile --prod --filter "@studybook/api..."

FROM node:24-alpine AS api
# ffmpeg compresses audio and video in the worker (design §5.5).
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    STORAGE_DIR=/data/storage \
    PORT=4000
WORKDIR /app
COPY --from=prod-deps /app ./
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
# A new volume mounted here takes this owner, so the app can write uploads without root.
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
