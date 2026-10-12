# Phase 1 Technical Design: Web app, tasks and proof

> Status: **Draft v0.1** (2026-10-08). Based on `intent.md` v0.7 and `phase-1-requirements.md` v1.0.
> Requirement IDs (e.g. `TSK-03`) refer to `phase-1-requirements.md`.
> Builder: one developer working with AI coding agents. This design therefore favours **one language, a conventional structure, well-known libraries, and few moving parts**.

## 1. Design principles

1. **One modular backend, not microservices.** There is one API codebase with clear modules, plus one background worker built from the same code. This is the easiest shape to build, test, and self-host alone.
2. **API-first.** The web app uses the same documented REST API that the Android app will use in Phase 3 (`NFR-11`).
3. **Privacy and permissions live on the server.** Every response is shaped for the viewer's role. The interface never "hides" data the server has already sent (`NFR-06`).
4. **Self-hosting is a first-class target.** A single `docker compose up` must work on a 2 vCPU / 4 GB VPS. Our hosted service runs the exact same images (`OPS-01`).
5. **Derive, don't sync.** Values like a task's status (Missed, Completed) and a member's points are computed from stored facts, not kept up to date by scheduled jobs. That leaves fewer jobs and fewer bugs.
6. **Prepare Phase 2 and Phase 3 without building them.** We leave clean "seams" where payments and the mobile app will plug in.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language for web, API, worker, and the Phase 3 React Native app |
| Monorepo | **pnpm workspaces + Turborepo** | Shared types and validation between apps. One repo for contributors |
| Web app | **Next.js (App Router)**, `output: standalone` | Server rendering keeps phone downloads small (`NFR-02`) and makes the landing page and catalogue indexable by search engines. Easy to run in Docker |
| UI | **Tailwind CSS + shadcn/ui** (Radix primitives) | Accessible components (`NFR-10`), small CSS, well known to AI agents |
| PWA | Web app manifest + a minimal service worker (`serwist`) | Installable on the Android home screen (`NFR-03`) |
| i18n | **next-intl** (web). The API returns error **codes**, and clients translate them | FR/EN everywhere (`NFR-04`) |
| API | **NestJS** (on Fastify) | Its module structure maps directly to our requirement areas. Includes guards (permissions), validation, and OpenAPI out of the box |
| Validation | **Zod** schemas in a shared package, used by both API and web | One definition of each input, so no mismatches |
| Database | **PostgreSQL 18** | Reliable and free. Good at the joins the dashboard needs |
| ORM / migrations | **Prisma** | Very widely used, readable schema, automatic migrations on start (`OPS-04`) |
| Queue / cache | **Redis (Valkey)** + **BullMQ** | Background jobs (media processing, emails) and rate limiting |
| Background worker | Same NestJS codebase, started in "worker" mode | No second codebase to maintain |
| File storage | Storage **driver**: `local` disk (default) or any **S3-compatible** service | Self-hosters need nothing extra. Hosted can move to object storage later without code changes |
| Media processing | **ffmpeg** (video/audio), **sharp** (images) in the worker | Compression for low bandwidth (`CNT-04`). It can be switched off on small servers |
| Email | **SMTP** via Nodemailer | Works with any provider |
| Reverse proxy | **Caddy** | Automatic HTTPS with zero configuration, which matters most for self-hosters |
| Testing | **Vitest** (unit), **Supertest** (API), **Playwright** (end-to-end, on a throttled mobile viewport) | |
| CI/CD | **GitHub Actions** → Docker images on **GHCR** | Self-hosters pull ready-made images |
| Logs / errors | **pino** structured logs. Optional Sentry-compatible error reporting (e.g. self-hosted GlitchTip) | |
| Phase 3 (later) | **React Native (Expo)** in the same monorepo | Reuses the shared types, validation, and API client |

### 2.1 Versions

Checked against npm and Docker Hub on **2026-10-12**. The rule: use the **latest stable major**, never a beta/RC, and stay on an **LTS** line where one exists. Exact patch versions are pinned by `pnpm-lock.yaml` and by image tags in `docker-compose.yml`. Patch and minor updates come through Renovate or Dependabot PRs. Major upgrades are a deliberate decision.

**Runtime and tooling**

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24 LTS** ("Krypton", image `node:24-alpine`) | Node 26 is still "Current" and is due to become LTS in late October 2026. Move to 26 then, as a planned upgrade. Pin with `engines` and `.nvmrc` |
| pnpm | **12.x** | Pinned through the `packageManager` field in `package.json` (Corepack) |
| Turborepo | **2.11.x** | |
| TypeScript | **6.0.x** | **Not 7.0** yet: typescript-eslint (8.71) supports only `<6.1`, and NestJS relies on decorator metadata. Revisit once the tooling officially supports TS 7 |
| ESLint + typescript-eslint | **10.x** + **8.71.x** | |

**Web**

| Package | Version | Notes |
|---|---|---|
| Next.js | **16.x** (16.4 current) | App Router, `output: "standalone"` |
| React / React DOM | **19.3.x** | Must match what Next.js 16 expects |
| Tailwind CSS | **4.3.x** | v4 uses CSS-first config (no `tailwind.config.js` by default) |
| shadcn/ui CLI | **4.x** | Components are copied into the repo, so no runtime version to track |
| next-intl | **4.14.x** | |
| Serwist (`@serwist/next`) | **9.5.x** | |

**API and worker**

| Package | Version | Notes |
|---|---|---|
| NestJS (`@nestjs/core`, `common`, `platform-fastify`) | **12.1.x** | All `@nestjs/*` packages on the same major |
| `@nestjs/swagger` | **12.0.x** | OpenAPI generation |
| Fastify | **5.12.x** | Brought in by `@nestjs/platform-fastify` |
| Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | **7.10.x** | The `prisma` CLI's npm `latest` tag currently points to an **8.0 RC**, so pin `7.10.x` explicitly for all three packages |
| Zod | **4.6.x** | Shared between API and web |
| BullMQ | **6.3.x** | |
| Nodemailer | **10.1.x** | |
| sharp | **0.35.x** | |
| argon2 | **0.45.x** | |
| pino | **10.4.x** | |

**Testing**

| Package | Version |
|---|---|
| Vitest | **5.0.x** |
| Supertest | **7.3.x** |
| Playwright (`@playwright/test`) | **1.64.x** |

**Containers** (`deploy/docker-compose.yml`)

| Service | Image tag | Notes |
|---|---|---|
| PostgreSQL | `postgres:18-alpine` (18.6 current) | 19 is in beta. Upgrade majors only with a documented `pg_dump` / restore step |
| Valkey | `valkey/valkey:9.1-alpine` | 9.2 is still an RC |
| Caddy | `caddy:2.11-alpine` | |
| App images (web, api, worker) | built on `node:24-alpine` | The worker image adds `ffmpeg` from Alpine packages |

**Phase 3 (for reference only, re-check before starting):** Expo SDK 57 with React Native 0.87.

## 3. Architecture

```
                   ┌───────────────────────────── Docker host (VPS) ─────────────────────────────┐
 Browser (phone) ──┤  Caddy (HTTPS)                                                               │
 Android (Ph. 3) ──┤    ├── /            → web    (Next.js: pages, server rendering)              │
                   │    └── /api/v1/*    → api    (NestJS: REST + OpenAPI)                        │
                   │                          │  ├── PostgreSQL   (all data)                       │
                   │                          │  ├── Redis        (queues, rate limits)            │
                   │                          │  └── Storage      (local volume or S3-compatible)  │
                   │                     worker (NestJS, same code): media, email, cleanup         │
                   └──────────────────────────────────────────────────────────────────────────────┘
                     External: SMTP server · Google login (optional)
```

- The **web** app calls the API from the server (for initial page renders) and from the browser (for interactions). It never touches the database directly. This keeps one source of truth for permissions.
- The **API** is the only component that talks to PostgreSQL and storage.
- The **worker** takes slow jobs off the request path: video transcoding, image resizing, sending email, and deleting files of removed groups.

### 3.1 Repository layout

```
studybook/
├── apps/
│   ├── web/            Next.js app (landing, catalogue, app screens)
│   ├── api/            NestJS app (API + worker entry point)
│   └── mobile/         (Phase 3: Expo React Native)
├── packages/
│   ├── shared/         Zod schemas, enums, error codes, permission matrix
│   ├── api-client/     Typed client generated from the OpenAPI spec
│   └── config/         Shared ESLint / TS / Tailwind config
├── deploy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── .env.example
├── docs/               Self-hosting, backup/restore, contributing
└── LICENSE             AGPL-3.0
```

### 3.2 API modules (mapped to requirements)

| Module | Responsibility | Requirements |
|---|---|---|
| `auth` | Sign-up, email verification, login, Google, sessions, recovery | ACC-01…05 |
| `users` | Profile, pseudo, data export, account deletion | ACC-06, ACC-07 |
| `groups` | Groups, settings, archive/delete, catalogue, categories, tags | GRP-01…05 |
| `memberships` | Members, roles, invites, join requests, bans, leaving | GRP-03, MEM-01…05 |
| `content` | Courses, modules, lessons, attachments, lesson views | CNT-01…04 |
| `tasks` | Tasks, submissions, deadlines, statuses, points | TSK-01…06 |
| `quizzes` | Quiz building, attempts, grading, hints, answer reveal | QUZ-01…02 |
| `feed` | Posts, comments, reactions, pinning, moderation | CNT-05 |
| `tracking` | Dashboard, member progress, points board, CSV export | TRK-01…05 |
| `storage` | Upload/download, quotas, size limits, storage drivers | LIM-01, LIM-03 |
| `limits` | Member cap, quota defaults, per-group overrides | LIM-02, LIM-04 |
| `admin` | Instance settings, categories, user/group management | OPS-03, OPS-06 |
| `notify` | Email sending (used only for verification and recovery). An `SmsProvider` adapter is added here in Phase 2 | ACC-01, ACC-05 |

## 4. Data model

Main tables (Prisma models). `id` = UUID. All tables also have `created_at` / `updated_at`.

### 4.1 Identity

| Table | Key columns | Notes |
|---|---|---|
| `users` | full_name, **pseudo** (unique), email (unique), email_verified_at, phone (unique, E.164 `+237…`), phone_verified_at (always null in Phase 1, kept for Phase 2), password_hash (argon2id, nullable for Google-only), avatar_file_id, locale (`fr`/`en`), is_instance_admin, status (active/suspended/deleted) | A user is **active** once the email is verified (`ACC-01`) |
| `oauth_accounts` | user_id, provider (`google`), provider_user_id | |
| `sessions` | user_id, token_hash, client (`web`/`mobile`), expires_at, last_seen_at | Opaque tokens, stored hashed. They can be revoked |
| `verification_codes` | user_id, channel (`email`; `sms` added in Phase 2), purpose (`verify`/`recover`/`change`), code_hash, target, expires_at, attempts | Short expiry, limited attempts |

### 4.2 Groups and membership

| Table | Key columns | Notes |
|---|---|---|
| `groups` | owner_id, name, slug, description, cover_file_id, visibility (`private`/`listed`), invite_requires_approval, progress_visibility (`own`/`all`), feed_enabled, language_label, status (active/archived), **storage_quota_bytes**, **storage_used_bytes**, **member_cap** | Quota and cap are copied from the instance defaults at creation. A null value means unlimited. Phase 2 upgrades change these columns |
| `categories` | key, name_fr, name_en, sort | Managed by the instance admin |
| `group_categories` | group_id, category_id | |
| `group_tags` | group_id, tag (lowercased) | Free tags set by the leader |
| `memberships` | group_id, user_id, role (`leader`/`moderator`/`member`), status (`active`/`left`/`removed`/`banned`), joined_at, **access_expires_at** (nullable) | `access_expires_at` is unused in Phase 1 and is the **seam for Phase 2** subscriptions |
| `invite_links` | group_id, token, active, created_by | Resetting deactivates the old token |
| `join_requests` | group_id, user_id, source (`catalogue`/`invite`), status (`pending`/`accepted`/`rejected`) | |

### 4.3 Content

| Table | Key columns | Notes |
|---|---|---|
| `courses` | group_id, title, description, position, published | Becomes sellable in Phase 2 (seam: a future `price` column) |
| `modules` | course_id, title, position | |
| `lessons` | module_id, title, body (rich text, stored as sanitised JSON), position, published | |
| `lesson_attachments` | lesson_id, file_id, kind (`pdf`/`audio`/`video`/`image`), position | |
| `lesson_views` | lesson_id, user_id, first_viewed_at | Unique per lesson and user (`CNT-03`) |
| `files` | group_id, uploader_id, kind, mime, size_bytes, storage_key, processing_status (`pending`/`ready`/`failed`), variants (JSON: e.g. a 480p rendition) | **Every byte stored for a group is a `files` row**, so quotas are exact |

### 4.4 Tasks and quizzes

| Table | Key columns | Notes |
|---|---|---|
| `tasks` | group_id, lesson_id (nullable), title, instructions, **proof_type** (`checkbox`/`file`/`photo`/`link`/`quiz`), **points** (default 10), **deadline_at** (nullable, stored in UTC, shown in WAT), **published_at** (null = draft), created_by | Once `deadline_at` has passed it can't be changed (`TSK-03`) |
| `task_views` | task_id, user_id, first_viewed_at | Means "Viewed" (acted) |
| `submissions` | task_id, user_id, proof_type, link_url, checked, submitted_at, **completed_at** | **One current row** per task and member. Replacing proof updates it (`TSK-04`) |
| `submission_files` | submission_id, file_id | Old files are deleted when proof is replaced, which frees quota |
| `quizzes` | task_id, pass_percent | |
| `quiz_questions` | quiz_id, kind (`single`/`multiple`/`true_false`), prompt, **hint**, position | |
| `quiz_options` | question_id, label, is_correct | `is_correct` is never sent to members unless they are allowed to see answers |
| `quiz_attempts` | task_id, user_id, attempt_no, score_percent, passed, question_order (JSON), option_order (JSON), submitted_at | Shuffled order is stored for each attempt |
| `quiz_answers` | attempt_id, question_id, selected_option_ids | |

### 4.5 Feed

| Table | Key columns |
|---|---|
| `posts` | group_id, author_id, body, image_file_ids, pinned, hidden_at, hidden_by, deleted_at |
| `comments` | post_id, author_id, body, hidden_at, deleted_at |
| `reactions` | post_id, user_id, kind (`like`) (unique per post and user) |

### 4.6 Instance

| Table | Notes |
|---|---|
| `instance_settings` | Default quota and member cap (null = unlimited), upload limits per file type, media processing on/off, catalogue on/off. **Secrets (SMTP, Google) stay in environment variables**, not in the database |

## 5. Key logic

### 5.1 Task status (derived, `TSK-03`, `TRK-01`)

```
applies(task, member) = task.published_at >= membership.joined_at     (TSK-07)

status(task, member) =                       -- only for tasks that apply
  if submission.completed_at exists                    → Completed
  else if task.deadline_at exists and now > deadline   → Missed
  else if task_view exists                             → Viewed
  else                                                 → Not started
```

- **Late joiners (`TSK-07`):** a task published before the member joined doesn't apply to them. It is hidden from their task list, excluded from the dashboard row and from their completion rate, and the submit endpoints reject it with `TASK_NOT_APPLICABLE`.
- No scheduled job is needed: "Missed" appears automatically when the deadline passes.
- **Submission guard:** every submit endpoint checks, inside the database transaction, that `now <= deadline_at`. It rejects late requests with the error code `TASK_DEADLINE_PASSED`.
- **Points** for a member = the sum of `tasks.points` over their completed tasks. Passing a quiz after failed attempts still gives full points.

### 5.2 Dashboard query (`TRK-01`)

- One query returns, for a group, all members × all published tasks with their derived status. It uses a `LEFT JOIN` across `memberships`, `tasks`, `submissions`, and `task_views`.
- Indexes on `(task_id, user_id)` for `submissions` and `task_views`.
- 500 × 50 = 25,000 cells. The API returns the grid paginated by members (e.g. 50 rows per page) plus per-task totals computed with `GROUP BY`. Target: < 3 s.
- CSV export (`TRK-05`) is generated in the worker and streamed.

### 5.3 Quiz grading and answer reveal (`QUZ-02`)

1. **Start attempt.** The server picks a random order for questions and options and stores it on the attempt. It then sends questions **without** `is_correct`.
2. **Submit.** The server grades and stores `score_percent` and `passed`. If the score is at least `pass_percent`, the task submission's `completed_at` is set.
3. **What comes back after a fail:**
   - after **failed attempt 1:** the score, the wrong question IDs, and the **hints** for them;
   - after **2 or more failed attempts:** additionally the **correct options** for every question.
   The server counts failed attempts. The client never decides what to reveal.
4. Retries are unlimited, but are blocked after the deadline.

### 5.4 Privacy: response shaping (`MEM-01`, `TRK-04`, `NFR-06`)

Every endpoint that returns people uses one **serializer** that takes the viewer's role:

| Viewer | Sees about other members |
|---|---|
| Member / moderator | `pseudo`, `avatar` only |
| Leader | + `full_name`, `email`, `phone` |
| Points board (when `progress_visibility = all`) | `pseudo`, `avatar`, `points`, rank |

- A **permission matrix** in `packages/shared` defines each action, e.g. `task.create: [leader, moderator]` and `submission.read_any: [leader]`.
- A single NestJS guard enforces it. Automated tests go through the matrix for every role, so a leak breaks the build.

### 5.5 Uploads, quotas and media (`LIM-01`, `LIM-03`, `CNT-04`)

1. **Pre-check.** The client asks to upload (kind, size). The API checks the per-type size limit and that `storage_used_bytes + size <= storage_quota_bytes`.
2. **Reserve.** It reserves the bytes in a transaction (`UPDATE groups SET storage_used_bytes = storage_used_bytes + size WHERE … AND fits`). This stops two uploads from both passing the check.
3. **Upload.** The file is streamed through the API to the storage driver. On failure, the reservation is released.
4. **Process.** The worker runs these jobs, each one optional per instance:
   - **images:** resized and converted to WebP (`sharp`), with EXIF/location data stripped for privacy;
   - **video:** one 480p H.264 MP4 rendition with `faststart`, so it plays while downloading;
   - **audio:** re-encoded to 64 kbps AAC.
   The quota counts the **stored** sizes: the original size is replaced by the actual size after processing.
5. **Download.** Every download goes through an authorization check:
   - **local driver:** the API checks permission, then Caddy serves the file with HTTP range support for seeking in audio/video;
   - **S3 driver:** a short-lived pre-signed URL.
   File URLs are never public.
6. **Photos on the client.** The web app compresses them in the browser before upload (`TSK-02`), which saves members' data.

### 5.6 Authentication (`ACC-01…05`)

- **Sign-up** creates a `pending` user. An email code/link is sent through the worker. The user becomes `active` once the email is verified. The phone number is stored but not verified in Phase 1.
- **Sessions** use opaque random tokens:
  - **web:** an `httpOnly`, `Secure`, `SameSite=Lax` cookie;
  - **mobile (Phase 3):** an `Authorization: Bearer` header.
  The same session table serves both.
- **Google login** uses OpenID Connect (authorization code + PKCE). A new Google user lands on "add and verify phone + choose pseudo".
- **Rate limits** (Redis):
  - login: 5 failures per 15 min per account and IP;
  - verification and reset emails: e.g. 3 per hour per address and 10 per day per IP.
- **Passwords** use argon2id. Codes are stored hashed.

### 5.7 Group access and limits

- **Joining**, by any path (invite link, accepted request), runs one function. It checks, in a transaction:
  1. the user is active;
  2. the user isn't banned from this group;
  3. the group's active member count is below `member_cap`.
  If the group is full, it returns `GROUP_FULL` (`LIM-02`).
- **Catalogue** pages show only `visibility = listed` groups. They are rendered on the server, so search engines can index them.

## 6. API

- **REST + JSON** under `/api/v1`. An **OpenAPI** spec is generated from NestJS, and the typed `api-client` package is generated from it.
- **Errors** look like `{ "code": "TASK_DEADLINE_PASSED", "message": "...", "details": {...} }`. Clients translate the `code` into FR/EN.
- **Pagination:** cursor-based (`?cursor=…&limit=…`).

Main resources (not exhaustive):

```
POST   /auth/signup · /auth/verify-email · /auth/verify-phone · /auth/login · /auth/logout
POST   /auth/recover · /auth/recover/confirm · GET /auth/google · GET /auth/google/callback
GET    /me · PATCH /me · GET /me/export · DELETE /me

GET    /catalogue?category=&q=          (public)
POST   /groups · GET/PATCH/DELETE /groups/:id · POST /groups/:id/archive
GET    /groups/:id/members · PATCH /groups/:id/members/:userId (role) · DELETE … (remove/ban)
POST   /groups/:id/invite-link/reset · POST /invites/:token/join
POST   /groups/:id/join-requests · PATCH /groups/:id/join-requests/:reqId

CRUD   /groups/:id/courses · /courses/:id/modules · /modules/:id/lessons
POST   /lessons/:id/view

CRUD   /groups/:id/tasks · POST /tasks/:id/view
PUT    /tasks/:id/submission            (create or replace proof)
GET    /tasks/:id/submissions           (leader only)
POST   /tasks/:id/quiz/attempts · POST /quiz-attempts/:id/submit

GET    /groups/:id/dashboard · GET /groups/:id/members/:userId/progress
GET    /groups/:id/points-board · GET /me/groups/:id/progress · POST /groups/:id/dashboard/export

CRUD   /groups/:id/posts · /posts/:id/comments · PUT/DELETE /posts/:id/reaction
POST   /posts/:id/pin · POST /posts/:id/hide · POST /comments/:id/hide

POST   /groups/:id/uploads (pre-check + reserve) · PUT /uploads/:id (stream) · GET /files/:id

/admin/*  settings, categories, users, groups
```

## 7. Deployment and self-hosting (`OPS-01…05`)

**`deploy/docker-compose.yml`** runs 6 containers:

| Service | Image | Memory (approx.) |
|---|---|---|
| caddy | `caddy:2.11-alpine` | 30 MB |
| web | `ghcr.io/<org>/studybook-web` | 150 MB |
| api | `ghcr.io/<org>/studybook-api` | 200 MB |
| worker | same image as `api`, `command: worker` (includes ffmpeg) | 200 MB + transcoding bursts |
| postgres | `postgres:18-alpine` | 300 MB |
| redis | `valkey/valkey:9.1-alpine` | 30 MB |

This fits the 2 vCPU / 4 GB target with room for video transcoding. The worker processes **one video at a time**, so it can't starve the API.

- **Configuration:** a single `.env`. Required: `DOMAIN`, `DATABASE_URL`, `SMTP_*`, `SESSION_SECRET`. Optional: `GOOGLE_CLIENT_ID/SECRET`, `STORAGE_DRIVER=local|s3` + `S3_*`, `MEDIA_PROCESSING=on|off`.
- **First start:**
  - migrations run automatically;
  - if no admin exists, the logs print a one-time setup link to create the instance admin (`OPS-03`).
- **Backups:**
  - a documented script runs `pg_dump` plus a copy of the storage volume;
  - on hosted, a daily cron job sends backups off-server (`NFR-09`).
- **Updates:** `docker compose pull && docker compose up -d`. Migrations run on start.
- **Hosted service:** the same compose file on our VPS, with limits set to 1 GB and 500 members in `instance_settings`.

## 8. Quality and security

- **Tests that must exist** (CI blocks merges if they fail):
  - **permission matrix:** every role × every endpoint;
  - **privacy:** members never receive contact fields, `is_correct` too early, or others' proof;
  - **deadline:** submissions and quiz attempts are rejected after `deadline_at`, including requests made just before and just after the deadline;
  - **quota:** concurrent uploads can't exceed the group's quota;
  - **end-to-end:** the core Phase 1 flow in Playwright on a mobile viewport with slow-3G throttling, in FR and EN.
- **Security:**
  - Zod validation on every input;
  - rich text sanitised on the server;
  - CSRF protection on cookie sessions;
  - strict upload MIME sniffing (not trusting the file extension);
  - security headers via Caddy;
  - dependency scanning in CI.
- **Performance budget:** CI fails if the first-load JavaScript of the landing or group home page grows beyond **~170 KB gzipped** (`NFR-02`).

## 9. Seams for later phases

| Later need | Prepared in Phase 1 by |
|---|---|
| Paid entry fee / subscription (Phase 2) | `memberships.access_expires_at` and a single `canAccessGroup()` check used by every group endpoint |
| Paid courses (Phase 2) | Courses are their own entity. A `course_access` table can be added without touching lessons |
| Paid upgrades (Phase 2) | `groups.storage_quota_bytes` / `member_cap` are per-group columns |
| Maviance / other gateways (Phase 2) | A `PaymentProvider` interface will follow the same adapter pattern as the storage drivers |
| Android app (Phase 3) | Bearer-token sessions, OpenAPI client, shared Zod schemas, error codes translated on the client |
| Connecting the app to a self-hosted server (Phase 3) | `GET /api/v1/instance` returns the instance name, version, and enabled features, so the app can check a server address |

## 10. Build plan (Phase 1 sub-phases)

Each sub-phase ends with something that works end to end and is deployed to our VPS.

| Sub-phase | Delivers | Requirements |
|---|---|---|
| **1.1 Foundation** | Monorepo, CI, Docker Compose, Caddy, database, i18n setup, design system, landing page, admin setup | OPS-01…03, OPS-05, NFR-04 |
| **1.2 Accounts** | Sign-up with email verification, login, Google, recovery, profile, pseudo | ACC-01…06 |
| **1.3 Groups and members** | Groups, settings, invite links, join requests, roles, bans, member list with privacy, catalogue with categories and tags, member cap | GRP-01…05, MEM-01…05, LIM-02 |
| **1.4 Content and storage** | Courses/modules/lessons, uploads, quotas, media processing, players, lesson views | CNT-01…04, LIM-01, LIM-03, LIM-04 |
| **1.5 Tasks, proof and quizzes** | All proof types, deadlines, replacing proof, quizzes with hints/answer reveal, points | TSK-01…06, QUZ-01…02 |
| **1.6 Tracking** | Dashboard, member progress, points board, CSV export | TRK-01…05 |
| **1.7 Feed** | Posts, comments, reactions, moderation, feed on/off | CNT-05 |
| **1.8 Hardening and release** | Data export/deletion, admin panel, backups, self-hosting docs, performance and security pass, first public release | ACC-07, OPS-04, OPS-06, NFR-* |

## 11. Decisions to confirm and risks

| # | Item | Proposal / risk |
|---|---|---|
| 1 | **SMS provider** | **Deferred to Phase 2** (decided 2026-10-12). Phase 1 has no SMS: email verification only, phone stored unverified. Before Phase 2, compare price per SMS to Cameroon, delivery to MTN and Orange numbers, and API quality (local gateways, Africa's Talking, Twilio) |
| 2 | **Video on a small VPS** | Transcoding is CPU-heavy. Mitigation: one job at a time, a size limit on video uploads, and `MEDIA_PROCESSING=off` for tiny servers (originals are served as they are) |
| 3 | **Storage for hosted** | Start on the VPS disk (`local` driver). Move to S3-compatible object storage when disk or bandwidth becomes the bottleneck. No code change is needed |
| 4 | **Domain name** | Needed for HTTPS, email sending (SPF/DKIM), and Google login setup |
| 5 | **Email deliverability** | Use a transactional SMTP provider for hosted, so verification emails don't land in spam |
| 6 | **Maviance split payments** (Phase 2) | Still to verify. It doesn't block Phase 1, but should be checked early because it affects the Phase 2 design |
