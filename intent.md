# Intent: Studybook — accountable, monetizable learning communities

> Status: **v0.7, ready for Phase 1** (2026-10-08). All Phase 1 questions are answered. Statements marked **[ASSUMPTION]** still need confirmation; see *Open questions* (mostly Phase 2).

## Problem

People who build groups around learning (a coach, a teacher, a mentor, a study circle, a professional skills group) mostly run them on chat tools like WhatsApp or Telegram. Those tools were made for conversation, not for getting results, so three things go wrong:

1. **No accountability.** When a leader shares a lesson, a task, or a challenge, there is no simple way to see who acted on it, who finished it, and who ignored it. Following up means scrolling through chat and messaging people one by one.
2. **The relationship is one-sided.** Members take what they need: they ask questions, download resources, and leave. The leader gives a lot of value and gets little back, either in money or in visible progress from members. Members who do put in effort get no recognition either.
3. **Monetization is hard, especially in Africa.** Existing community platforms (e.g. Skool) charge in USD, need international cards, and don't support local payment methods like Mobile Money in XAF. Leaders in Cameroon end up collecting payments by hand and tracking manually who has paid.

Closed SaaS platforms also lock a community's data and rules inside one vendor. Organisations that want to own their data or run the platform themselves can't do that.

"Study" here means **any structured learning or growth**, not only formal schooling: languages, trades, business, faith groups, fitness, exam prep, and so on.

## Proposed outcome

Studybook is an **open-source (AGPL) community platform**, available as a **mobile-first web app and a native Android app with a matching interface**, where anyone can easily:

- **Create** any number of communities (groups) and organise their content: **text, PDF, audio, and video** lessons and resources, tasks, and discussions.
- **Manage** members: invitations, roles, access levels, and moderation.
- **Get discovered (optional):** groups are invite-only by default. A leader can also list a group in a public **catalogue by interest** on our domain, where people can send a join request.
- **Discuss** inside the group with a built-in feed, so members don't have to go back to WhatsApp.
- **Track follow-through:** see who acted on each task and who completed it (details below).
- **Monetize** a group with **one-time entry fees, monthly subscriptions, and paid courses**, all at the same time if the leader wants (details below).

### Accountability

- When creating a task, the leader chooses **what counts as completion**:
  - a **checkbox** ("I did it"),
  - an uploaded **file**,
  - an uploaded **photo**,
  - a **link**,
  - a **quiz**, which is completed only when the member reaches the **minimum score** set by the leader. Members can **retake a quiz as many times as needed**.
- Every proof type except the quiz is **automatically marked completed as soon as the member submits it in the required format**. Leaders don't need to approve it.
- **Deadlines are optional:** the leader decides, task by task, whether a task has one. **Submission closes when the deadline passes.** Members who haven't completed the task by then stay "not completed".
- **No notifications or reminders** in the first release.
- The leader sees, on one screen, **who acted, who completed, and who did nothing**. Each member sees their own progress.
- **Progress visibility is a leader setting:** the leader decides whether members can see each other's progress.
- The first release measures **action and completion only**. Measuring whether a member *benefited* comes later.

### Monetization (critical: the core selling point)

A leader can **combine all three models in the same group**:

| Model | Example |
|---|---|
| **One-time entry fee** | Pay 5,000 XAF to join the group |
| **Monthly subscription** | 2,000 XAF/month for continued access |
| **Paid courses** | A free or paid group sells a course for 10,000 XAF |

**Access rules**
- **Entry fee:** grants full access to the group and all its advantages **for the first month**.
- **After that first month**, the leader's setting decides what happens:
  - **(a)** the member must pay the **monthly subscription** to keep access, or
  - **(b)** the member **keeps access without paying more**.
- **When a subscription expires and isn't renewed, the member loses access to the group immediately.** There is no grace period.
- **No refunds** in the first release.

**Payments** go through **Maviance**, a payment aggregator in Cameroon, in **XAF** using Mobile Money (MTN MoMo, Orange Money). The aggregator collects each payment and the platform's share is separated from the leader's share, using rules we define.

**Core flow (confirmed)**

```
Leader posts a task (chooses proof type) → member submits proof (or passes quiz) → task completed → leader sees who did and who didn't
```

The result should be a **two-sided relationship**: leaders can see and reward real engagement, and members get structure, recognition, and results.

### Accounts and login

- **Sign-up requires both an email and a phone number.** Each one is a backup for the other, and the phone number is also used for our account tracking.
- **Email is the main identifier.** After the first sign-in, users can log in with **email or Google login**.

### Delivery and business model

| | Hosted (by us) | Self-hosted (open source) |
|---|---|---|
| Features | **Same as self-hosted.** Some services may become proprietary later | Same as hosted |
| Price | Free, with paid per-feature upgrades | **Completely free, we earn nothing** |
| Infrastructure | Run by us | Run and paid for by the self-hoster |
| Storage | **1 GB per group**, can be upgraded | Whatever the self-hoster provides |
| Members per group | **Max 500 per group**, can be upgraded | No limit set by us |
| Groups per leader | Unlimited (for now) | Unlimited |
| Payments | Through our Maviance integration | Our integration is **encouraged but optional**. They may plug in any gateway |
| Transaction fee | **10% of every member payment**, which includes the aggregator's fee | **None** |
| Mobile app | Official Android app | **Same official app.** The user enters their server address to connect |

**Pay-as-you-go** means each limited feature (e.g. storage, member cap) is upgraded separately, and the leader pays only for what they raise. The list of limited features and their prices will be defined later.

### Delivery phases

v1 is the complete first version of the app, and it is built in **three phases**. Each phase can be split into sub-phases if needed.

| Phase | Scope |
|---|---|
| **Phase 1: Web app, tasks and proof** | Mobile-first web app: accounts, groups, members, roles, content (text/PDF/audio/video), tasks (optional deadlines), all proof types including quizzes, completion tracking, progress-visibility setting, privacy rules, FR/EN, hosted limits (storage, members, upload size per file type). **The self-hosted package is ready at the end of Phase 1**: our hosted service runs the same open-source code on our own VPS |
| **Phase 2: Payments** | Maviance integration, entry fee, monthly subscription, paid courses, all access rules, 10% platform fee, paid upgrades of limited features |
| **Phase 3: Android app** | Native Android app with an interface similar to the web app, able to connect to our hosted server or to any self-hosted server |

### How we'll know it worked [ASSUMPTION, to be confirmed]

- **Phase 1:**
  - A leader can create a group and post a first task in under 5 minutes.
  - Leaders can answer "who did what I asked?" in one screen, without scrolling through chat.
- **Phase 2:**
  - A member can pay an entry fee, a subscription, or for a course with Mobile Money in XAF, without needing a card.
  - Access is granted and removed automatically according to the rules above.
- **Phase 3:**
  - Everything above works in the Android app.
  - A self-hoster can connect the app to their own server.
- **Self-hosting:** a technical user can run their own instance with a documented one-command setup (e.g. Docker).

## Affected users and systems

**Users**
- **Community creators / leaders:** teachers, coaches, mentors, trainers, associations. They create groups, set pricing and access rules, publish tasks and courses, track completion, see member contacts, and earn money.
- **Moderators / assistants:** help leaders run larger communities.
- **Members / learners:** join, pay, consume content, submit proof, take quizzes, and track their own progress. Most are **mobile-first, with limited or costly data**.
- **Self-hosters:** schools, NGOs, companies, and developers who run their own instance at their own cost.
- **Open-source contributors:** developers who extend and maintain the AGPL codebase.
- **Studybook operators (us):** run the hosted service, feature upgrades and billing, support, the Maviance integration, and the official Android app.

**Systems**
- **Maviance** (payment aggregator, Cameroon): collects Mobile Money payments in XAF and handles how they are shared out.
- **Web app** (mobile-first, PWA) and **official native Android app**, which can connect to our hosted service or to **any self-hosted server**.
- **Backend / API** shared by both clients and by self-hosted instances.
- **File storage** for content (text, PDF, audio, video) and proof uploads, counted against each group's 1 GB quota on hosted.
- **Quiz engine** with minimum-score rules.
- **Access/subscription engine:** grants and removes group access based on entry fee, subscription expiry, and the leader's settings.
- **Identity:** email + phone at sign-up (with verification [ASSUMPTION]), plus **Google login**.
- **Notifications:** **none in the first release.** Email is used only for account needs (verification, password reset).
- **Hosted infrastructure:** our own VPS, running the same open-source package as self-hosters.
- **Self-hosted deployments:** Docker / VPS.

## Constraints

**Licensing and hosting**
- **License: AGPL.** The full platform is open source, and any modified version offered as a hosted service must publish its source.
- **Feature parity:** the hosted and self-hosted versions are identical. Proprietary services may come later.
- **Self-hosted is free and fee-less.** No platform fee and no transaction fee. Self-hosters pay for their own infrastructure. Payment gateways must be **pluggable**, so Maviance is encouraged but never required.
- **Hosted limits:** 1 GB storage per group and 500 members per group, each upgradeable separately with pay-as-you-go. No limit on the number of groups for now.
- **Self-hosting from day one:** the open-source package must be deployable at the end of Phase 1. We dogfood it by running the hosted service on our own VPS with the same code.

**Payments**
- **Platform fee: 10% of each member payment (hosted)**, with Maviance's fee paid out of it.
- **Monetization is critical:** entry fee, monthly subscription, and paid courses must all work, **in any combination within one group**.
- **We never hold funds.** The aggregator collects payments.
- **Market:** **Cameroon only**, XAF and Mobile Money. A card is never required.
- **No refunds** in the first release.
- **No grace period:** access ends as soon as a subscription expires unpaid.

**Platforms and content**
- **Platforms:** the web app first (Phase 1), Android app last (Phase 3). **No iOS for now.**
- **Content:** text, PDF, audio, video. **No live sessions.**
- **Low-bandwidth:** must work on low-end Android phones and slow or expensive connections. Uploads (especially video and proof) need compression.
- **Upload limits:** each file type (video, audio, PDF, photo, other files) has its own maximum size. Exact values will be defined later.
- **Languages:** French and English.

**Accounts and privacy**
- **Accounts:** email and phone number are both required **and verified** at first sign-up (SMS through a paid third-party provider). Email is the main login, and Google login is available after that.
- **Privacy:**
  - Members see other members only by **pseudo and avatar**, never their real name or contact details.
  - **Only leaders** see their own members' real names and contact details. Moderators don't.
- **Regulation:** follow Cameroon's personal data protection law. The payment design relies on Maviance as a licensed aggregator [ASSUMPTION: needs legal check].

**Team**
- **Team / budget / timeline:** [TBD]

## Open questions

**Phase 1 (deferred, not blocking)**
1. **Exact upload limits** per file type, to be defined later.

**Monetization (Phase 2, settle before Phase 2 starts)**
2. **Entry fee and paid courses:** the entry fee gives access to "everything" for the first month. Does that include **paid courses**, or are courses always bought separately?
3. **Course access:** once a member buys a course, do they keep it **forever**, even if their subscription expires or they leave the group?
4. **Renewal:** Mobile Money can't reliably debit automatically each month, and there are no notifications in the first release. How will members know their subscription is about to expire? (E.g. a banner in the app, or a Phase 2 exception for renewal reminders?)
5. **Maviance capabilities:** can Maviance **split a payment automatically** between the leader and us, and **pay leaders out**? If not, we need another way to share the money. *To verify with Maviance's API docs or sales team.*
6. **Payout frequency:** how often do leaders receive their share (instantly, daily, weekly)?
7. **Upgrades:** besides storage and members per group, which other features are limited on the hosted version? Prices for each upgrade? [pricing spec]

**Product scope (later)**
8. **WhatsApp/Telegram:** integrate with them (notifications, importing groups), or fully replace them?

**Organisation**
9. Team size, budget, and target date for each phase?
