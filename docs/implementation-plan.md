# Implementation plan

> Status: **v0.1** (2026-10-12). Based on `phase-1-design.md` §10. Versions follow §2.1 of the design.
> Each step ends with something that works end to end and is deployed to our VPS. A step is **done** only when its exit check passes.

## Overview

| Phase | Steps | Outcome |
|---|---|---|
| **Phase 1: Web app, tasks and proof** | 1.1 → 1.8 | Mobile-first web app + self-hostable Docker package |
| **Phase 2: Payments** | 2.1 → 2.5 | Maviance, entry fee, subscriptions, paid courses, 10% fee, upgrades |
| **Phase 3: Android app** | 3.1 → 3.4 | Expo app connecting to hosted or self-hosted servers |

## Phase 1

### 1.1 Foundation

| # | Work | Status |
|---|---|---|
| 1 | Monorepo: pnpm workspaces, Turborepo, shared TS config, `.nvmrc`, `.gitignore`, AGPL `LICENSE` | ✅ |
| 2 | `apps/web`: Next.js 16 (App Router, standalone), Tailwind 4, next-intl (FR/EN, no locale in URL) | ✅ |
| 3 | `apps/api`: NestJS 12 on Fastify, ESM, `GET /api/v1/health` and `GET /api/v1/instance` | ✅ |
| 4 | `packages/shared`: Zod, error codes, roles (consumed by web and api) | ✅ |
| 5 | Prisma 7 + PostgreSQL 18, `prisma.config.ts`, first model (`instance_settings`). **First migration not run yet** (Docker unresponsive on 2026-10-12) | 🟡 |
| 6 | Dev services: `deploy/docker-compose.dev.yml` (Postgres, Valkey). Written, not yet started | 🟡 |
| 7 | Design system: shadcn/ui init, base layout, mobile nav, FR/EN switcher | ⬜ |
| 8 | Linting (ESLint 10 flat config), Vitest wiring, Playwright skeleton | ⬜ |
| 9 | Production Dockerfiles (web, api/worker), `deploy/docker-compose.yml`, Caddyfile, `.env.example` | ⬜ |
| 10 | GitHub Actions: lint, typecheck, test, build images, push to GHCR | ⬜ |
| 11 | Landing page (FR/EN) | ⬜ |
| 12 | First-admin setup link (`OPS-03`), migrations as a one-shot service | ⬜ |
| 13 | Deploy to our VPS with a domain and HTTPS | ⬜ |

**Exit check:** `docker compose up` on a fresh VPS serves the landing page over HTTPS in FR and EN, and `/api/v1/health` returns `ok`.

### 1.2 Accounts (`ACC-01…06`)

Sign-up (email verification only, phone stored unverified), login, sessions (opaque token in cookie), rate limits, Google login (optional per instance), password reset by email, profile and pseudo, email sending through the worker (BullMQ + Nodemailer).

**Exit check:** a new user signs up on a phone, verifies their email, logs out and in, and resets their password, in both languages.

### 1.3 Groups and members (`GRP-01…05`, `MEM-01…05`, `LIM-02`)

Groups, settings, invite links, join requests, roles, bans, leaving, member list with privacy serializer, permission matrix + guard, catalogue with categories and tags, member cap.

**Exit check:** a leader creates a group, shares the link, two members join; members see only pseudos; the permission-matrix and cross-group (IDOR) tests pass.

### 1.4 Content and storage (`CNT-01…04`, `LIM-01`, `LIM-03`, `LIM-04`)

Courses, modules, lessons, rich text, storage drivers (local/S3), uploads with quota reservation, media processing in the worker (sharp, ffmpeg), protected downloads with range support, lesson views.

**Exit check:** a leader uploads a PDF, an audio file, and a video; a member streams the video on throttled 3G; an upload over quota is rejected.

### 1.5 Tasks, proof and quizzes (`TSK-01…07`, `QUZ-01…02`)

Tasks with all proof types, deadlines (final), replacing proof, late-joiner rule, quizzes with shuffling, hints, and answer reveal, points.

**Exit check:** the deadline tests (just before / just after) and the quiz-reveal tests pass; a late joiner doesn't see earlier tasks.

### 1.6 Tracking (`TRK-01…05`)

Status view in SQL, dashboard grid with filters, member progress, my progress, points board, CSV export.

**Exit check:** the dashboard loads in under 3 s with seeded data for 500 members × 50 tasks.

### 1.7 Feed (`CNT-05`)

Posts, comments, reactions, pinning, hiding, feed on/off.

### 1.8 Hardening and release (`ACC-07`, `OPS-04`, `OPS-06`, `NFR-*`)

Data export and account deletion, admin panel, backup/restore scripts and docs, self-hosting docs, performance budget in CI, security pass, first public release.

**Exit check:** the full core flow passes in Playwright on a throttled mobile viewport in FR and EN; a self-hoster follows the docs on a clean VPS.

## Phase 2: Payments (settle intent.md open questions 2–7 first)

| Step | Work |
|---|---|
| 2.1 | Verify Maviance capabilities (split payments, payouts); `PaymentProvider` interface + Maviance adapter; SMS provider + phone verification (`ACC-02`) |
| 2.2 | Entry fee and access rules (`memberships.access_expires_at`, `canAccessGroup()`) |
| 2.3 | Monthly subscriptions, expiry, renewal flow |
| 2.4 | Paid courses (`course_access`) |
| 2.5 | Platform fee accounting, paid upgrades of limits |

## Phase 3: Android app

| Step | Work |
|---|---|
| 3.1 | `apps/mobile` (Expo) using `packages/api-client`, Bearer sessions, server-address screen (`GET /api/v1/instance`) |
| 3.2 | Accounts, groups, content, media playback |
| 3.3 | Tasks, proof (camera), quizzes, progress |
| 3.4 | Payments, Play Store release |
