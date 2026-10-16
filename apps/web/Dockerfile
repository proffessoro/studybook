# The web app (Next.js standalone output, design §7). Build from the repository root:
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.11.2
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@studybook/web..."
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @studybook/shared build \
 && pnpm --filter @studybook/api-client build \
 && pnpm --filter @studybook/web build

FROM node:24-alpine AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# The standalone server traces only the files it needs; static assets are copied beside it.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
