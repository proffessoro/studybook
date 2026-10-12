# Studybook

Open-source (AGPL-3.0) platform for accountable, monetizable learning communities. See `intent.md`, `phase-1-requirements.md`, `phase-1-design.md`, and `docs/implementation-plan.md`.

## Development

Requirements: Node.js 24 LTS, pnpm 12 (`npm i -g pnpm@12`), Docker.

```sh
pnpm install
pnpm db:up                               # Postgres 18 + Valkey 9 in Docker
pnpm --filter @studybook/api db:migrate  # apply database migrations
pnpm dev                                 # web on :3000, API on :4000
```

| App | Path | URL |
|---|---|---|
| Web (Next.js 16) | `apps/web` | http://localhost:3000 |
| API (NestJS 12) | `apps/api` | http://localhost:4000/api/v1/health |
| Shared types and schemas | `packages/shared` | |

Other commands: `pnpm build`, `pnpm typecheck`.

## License

[AGPL-3.0](./LICENSE)
