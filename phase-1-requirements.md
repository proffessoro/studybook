# Phase 1 Requirements: Web app, tasks and proof

> Status: **v1.0, locked** (2026-10-08). Based on `intent.md` v0.7.
> Statements marked **[ASSUMPTION]** are proposals to confirm; see *Open questions* at the end.

## 1. Goal of Phase 1

Deliver a **mobile-first web app** in which a leader can:
1. create a group,
2. publish content and tasks,
3. see **who acted, who completed, and who did nothing**.

Phase 1 also ships the **self-hostable open-source package (AGPL)**, which our hosted service runs on our own VPS.

**Phase 1 is done when this flow works end to end, in French and English, on a low-end Android phone browser:**

```
Leader signs up → creates group → invites members → publishes a lesson + task
→ members submit proof / pass quiz before the deadline → leader sees the completion dashboard
```

## 2. Roles

| Role | Scope | Can do |
|---|---|---|
| **Visitor** | Not logged in | View the landing page and the group catalogue, sign up, log in, open an invite link |
| **Member** | One group | View content, submit proof, take quizzes, see their own progress (and others' scores if the leader allows), post and comment in the feed |
| **Moderator** | One group | Everything a member can do, plus **create and edit content** (courses, lessons, tasks, quizzes) and **moderate** (hide, delete, or pin posts and comments). **No** access to member contacts, the dashboard, members' proof, or member management |
| **Leader** | One group | Everything: content and tasks, dashboard and members' proof, member contacts, invitations, join requests, roles, group settings, deleting the group |
| **Instance admin** | Whole server | Configure the instance (limits, email, Google login, storage) and manage users. On hosted, this is us; on self-hosted, the self-hoster |

Any user can be a leader of some groups and a member of others.

## 3. Definitions

| Term | Meaning |
|---|---|
| **Group** | A community with its own members, content, tasks, feed, and settings |
| **Catalogue** | A public page on our domain that lists groups by **interest category**. Visitors can browse it and send join requests |
| **Pseudo** | A public nickname each user chooses. Other members see the pseudo; only leaders see real names and contacts |
| **Points** | What a member earns by completing tasks. Each task is worth a number of points set when it is created. The shared progress board ranks members by points |
| **Course** | An ordered set of **modules**, each holding **lessons**. Courses become sellable in Phase 2 [ASSUMPTION] |
| **Lesson** | A piece of content: text, PDF, audio, or video (one or several attachments) |
| **Task** | Something members must do. It has a **proof type**, an optional **deadline**, and can be standalone or attached to a lesson |
| **Proof type** | Checkbox, file, photo, link, or quiz |

**Task status per member**

| Status | Meaning |
|---|---|
| **Not started** | The member has never opened the task |
| **Viewed** | The member opened the task (this is what "acted" means) but has not completed it |
| **Completed** | Valid proof was submitted, or the quiz was passed with the minimum score |
| **Missed** | The deadline passed without completion |

---

## 4. User stories and acceptance criteria

Priority: **M** = Must for Phase 1, **S** = Should (included unless time runs out), **C** = Could (only if time allows).

### 4.1 Accounts and login (ACC)

**ACC-01 (M): Sign up with email and phone**
*As a visitor, I want to create an account with my email and phone number so that I can join or create groups.*
- Sign-up requires **full name, pseudo, email, phone number (Cameroon format, +237), password, and preferred language (FR/EN)**.
- The pseudo must be unique on the instance.
- Email must be unique on the instance. Phone must be unique on the instance [ASSUMPTION].
- The password has at least 8 characters and is stored hashed (never in plain text).
- **The email must be verified** (a link or code by email) before the user can create, join, or request to join a group.
- The phone number is collected and format-checked but **not verified in Phase 1** (decided 2026-10-12: no SMS provider in Phase 1).
- Invalid input shows clear field-level errors in the user's language.

**ACC-02 (deferred to Phase 2): Verify phone number**
*As the platform, I want the phone number confirmed so that it can serve as the account's backup and for tracking.*
- Dropped from Phase 1 to avoid SMS costs and sign-up drop-off. Phone verification by SMS code returns when payments need it (Phase 2).

**ACC-03 (M): Log in with email**
*As a user, I want to log in with my email and password.*
- Wrong credentials show a generic error that doesn't reveal whether the email exists.
- Login attempts are rate-limited (e.g. 5 failures, then a short lock).
- The session persists on the device until logout or expiry.

**ACC-04 (M): Log in with Google**
*As a user, I want to log in with Google so that I don't need to remember a password.*
- Google login works only if the instance admin has configured it.
- If the Google email matches an existing account, it logs into that account.
- If the Google email is new, the user must enter a phone number and choose a pseudo before the account is active. Google already counts as email verification.

**ACC-05 (M): Recover my account**
*As a user who forgot my password, I want to reset it by email.*
- A reset link is sent by email and expires after a limited time (e.g. 1 hour).
- Recovery by SMS (for users who lost access to their email) is deferred to Phase 2. Until then, the instance admin can help manually.

**ACC-06 (M): Edit profile**
*As a user, I want to edit my name, pseudo, photo, language, email, and phone.*
- Changing email requires verifying the new value. Changing phone only re-checks the format (no SMS in Phase 1).

**ACC-07 (S): Delete my account and export my data**
*As a user, I want to download my data and delete my account (data protection law).*
- Export gives a downloadable file of the user's profile, memberships, and submissions.
- Deletion removes personal data. Groups the user leads must first be transferred or deleted.

### 4.2 Groups (GRP)

**GRP-01 (M): Create a group**
*As a leader, I want to create a group with a name, description, and cover image.*
- There is no limit on the number of groups per user.
- The creator becomes the group's **leader**.
- A new group has 1 GB storage and 500 member slots on hosted (instance defaults, see LIM).

**GRP-02 (M): Configure group settings**
*As a leader, I want to control how my group works.*
- **Visibility:**
  - **Private** (the default): not visible anywhere and reachable only through an invite link.
  - **Listed in the catalogue**: visible under one or more interest categories. Visitors can see its name, description, cover, and member count, and can only **send a join request**, which the leader accepts or rejects.
- **Invite link joining:** people with the link join instantly, or need the leader's approval.
- **Progress visibility:** members see only their own progress, or everyone's.
- **Group language:** shown as a label. The interface always follows each user's own language.

**GRP-03 (M): Invite members**
*As a leader, I want to invite people with a link.*
- The invite link can be copied and shared, e.g. on WhatsApp.
- The link can be reset, which disables the old one.
- Opening the link while logged out leads to sign-up or login, then back to the group.

**GRP-04 (M): Public platform and group catalogue**
*As a visitor or user, I want to browse groups by interest and ask to join one.*
- Our domain has a **public landing page** where anyone can learn about Studybook, sign up, and create groups.
- The **catalogue** lists only groups whose leader chose *Listed in the catalogue*. Private groups never appear.
- Groups can be browsed by interest category and searched by name.
- Clicking **Request to join** asks a logged-out visitor to sign up or log in first. The request then goes to the leader (see MEM-04).
- Inside a listed group, members-only content stays hidden from non-members.
- **Categories and tags:**
  - Each listed group picks **one or more interest categories** from a fixed list managed by the instance admin (e.g. Languages, Tech, Business, Faith, Health, Exam prep).
  - Leaders can also add their own **free tags** (e.g. "BEPC", "Python", "bilingualism").
  - Catalogue search matches group names and tags.

**GRP-05 (M): Delete or archive a group**
*As a leader, I want to archive my group (read-only) or delete it.*
- Deleting requires typing the group name to confirm. Files are removed from storage.

### 4.3 Members, roles, privacy (MEM)

**MEM-01 (M): Member list with privacy**
*As a member, I want to see who is in my group, without seeing their contact details.*
- Members (and moderators) see only the **pseudo and avatar** of other members, **everywhere**: member list, feed, and shared progress.
- **Only the leader** also sees each member's **real name, email, and phone**.
- The API enforces this, not only the interface: a member's request never returns other members' contact fields.

**MEM-02 (M): Manage roles**
*As a leader, I want to promote members to moderator, demote them, and transfer leadership.*

**MEM-03 (M): Remove or ban a member**
*As a leader, I want to remove a member, or ban them so they can't rejoin with the link or a join request.*

**MEM-04 (M): Approve join requests**
*As a leader, I want to accept or reject join requests, both from the catalogue and from the invite link when approval is on.*

**MEM-05 (M): Leave a group**
*As a member, I want to leave a group.*
- My submissions remain visible to the leader in the history [ASSUMPTION].

### 4.4 Content (CNT)

**CNT-01 (M): Create courses, modules, and lessons**
*As a leader or moderator, I want to organise the group's content into courses, modules, and lessons.*
- Items can be reordered.
- Items can be saved as a draft (hidden from members) or published.

**CNT-02 (M): Lesson content types**
*As a leader, I want a lesson to contain text, PDF, audio, and/or video.*
- Text uses a simple rich-text editor (headings, bold, lists, links, images).
- PDFs can be read in the browser and downloaded.
- Audio and video play in the browser with streaming. Members don't have to download the whole file first.
- Each file type has its own maximum size (values defined later, configurable per instance).

**CNT-03 (M): Track lesson views**
*As a leader, I want to know which members opened each lesson.*

**CNT-04 (S): Lower data use for media**
*As a member on a slow, expensive connection, I want media to load without wasting data.*
- Videos don't autoplay.
- Images are compressed when uploaded.
- Video is served at a lower-bitrate option when available [ASSUMPTION: server-side compression is optional per instance because it needs CPU].

**CNT-05 (M): Group feed (posts and comments)**
*As a member, I want to post questions and reply to others inside the group, so that we don't need to go back to WhatsApp.*
- Posts support text, links, and images (images count toward the group's storage).
- Members can comment on posts and react to them (e.g. a like).
- Posts show the author's pseudo and avatar.
- Leaders and moderators can hide or delete posts and comments, and pin posts.
- Members can edit or delete their own posts and comments.
- The leader can turn the feed off for the group.

### 4.5 Tasks and proof (TSK)

**TSK-01 (M): Create a task**
*As a leader or moderator, I want to create a task with a title, instructions, a proof type, points, and an optional deadline.*
- **Points:** each task is worth a number of points (default 10 [ASSUMPTION]). A member earns them when the task is completed. Missed tasks earn 0.
- **Proof types:** checkbox, file, photo, link, quiz.
- The task is either standalone or attached to a lesson.
- The deadline is a date and time in Cameroon time (WAT, UTC+1).
- Tasks can be saved as a draft or published.

**TSK-02 (M): Submit proof**
*As a member, I want to complete a task by submitting the required proof.*

| Proof type | Valid submission | Then |
|---|---|---|
| Checkbox | Member ticks "I did it" | Completed |
| File | One or more files of allowed types, within the size limit | Completed |
| Photo | One or more images (camera or gallery), compressed before upload | Completed |
| Link | A valid URL | Completed |
| Quiz | See QUZ | Completed only if minimum score is reached |

- Submissions in the wrong format are rejected with a clear message.
- Completion is automatic. No approval is needed.

**TSK-03 (M): Deadline closes submission**
*As a leader, I want submissions to close when the deadline passes.*
- After the deadline, the submit button is disabled and the API rejects submissions.
- Members who haven't completed the task become **Missed**.
- **The deadline is final.** Once it has passed, no one (including the leader) can reopen submission or change the deadline.
- Before the deadline, the leader can still change it.

**TSK-04 (M): Edit or replace a submission**
*As a member, I want to replace my proof before the deadline.*
- The latest submission replaces the previous one. The leader sees the latest version and the time it was submitted.
- After the deadline, the proof can't be changed.

**TSK-05 (M): View submissions**
*As a leader, I want to open any member's proof (file, photo, link, quiz result).*

**TSK-06 (M): Member task list**
*As a member, I want to see my tasks grouped as To do, Completed, and Missed, with deadlines shown.*

**TSK-07 (M): Late joiners don't inherit earlier tasks**
*As a member who joins after tasks were published, I only see the courses and the feed for what came before me.*
- Tasks published **before** the member joined are hidden from that member: they don't appear in their task list, and they aren't counted as Missed on the dashboard or in their completion rate.
- Tasks published after the member joined apply normally.

### 4.6 Quizzes (QUZ)

**QUZ-01 (M): Build a quiz**
*As a leader or moderator, I want to create a quiz with questions and a minimum score.*
- Question types: **single choice, multiple choice, true/false** [ASSUMPTION: no free-text answers, since they can't be auto-graded].
- The minimum score is set as a percentage (e.g. 70%).
- Each question can have a **hint**, written by the leader, that explains the idea without giving the answer.

**QUZ-02 (M): Take a quiz with unlimited retries**
*As a member, I want to take the quiz and retry until I pass.*
- Each submission is graded right away and the score is shown.
- There is no limit on attempts, and retrying is allowed until the deadline.
- When the score is at least the minimum, the task becomes **Completed**.
- Passing gives the task's **full points**, no matter how many failed attempts came before.
- The leader sees the number of attempts and the best score for each member.
- What a member sees after a **failed** attempt:

| Failed attempt | Member sees |
|---|---|
| **1st** | Score, which questions were wrong, and the **hints** for those questions. No correct answers |
| **2nd and after** | Score and the **correct answers**, with the hints as explanation |

- Questions and answer options are shown in a **random order** on each attempt [ASSUMPTION], so seeing the answers doesn't let members pass just by memorising positions.

### 4.7 Tracking and dashboard (TRK)

**TRK-01 (M): Completion dashboard**
*As a leader, I want one screen showing who acted, who completed, and who did nothing.* (Leader only. Moderators don't see it.)
- A table with **members as rows and tasks as columns**, each cell showing the status (Not started / Viewed / Completed / Missed).
- Each task shows a summary, e.g. "18 completed · 5 viewed · 7 not started".
- Each member's total points are shown.
- Filters by task, course, status, and date range.
- Clicking a cell opens that member's proof.
- The dashboard loads in under 3 seconds for a group of 500 members and 50 tasks [ASSUMPTION].

**TRK-02 (M): Member profile progress**
*As a leader, I want one member's history: tasks completed, missed, and their completion rate.*

**TRK-03 (M): My progress**
*As a member, I want to see my points, completion rate, and history in each group.*

**TRK-04 (M): Shared progress (when enabled)**
*As a member, I want to see other members' progress if the leader allows it.*
- When the setting is off, the API never returns other members' progress to members.
- When on, members see a **points board**: each member's **pseudo, avatar, and total points**, ranked from highest to lowest.
- Members never see real names, contact details, per-task statuses, or proof files.
- Each member always sees their own points, whether sharing is on or off.

**TRK-05 (S): Export**
*As a leader, I want to export the dashboard as a CSV file.*

### 4.8 Hosted limits (LIM)

**LIM-01 (M): Storage limit per group**
*As the platform, I want each group limited to its storage quota (1 GB by default on hosted).*
- All files in the group count toward the quota: content and members' proof.
- The leader sees usage, e.g. "620 MB of 1 GB".
- An upload that would exceed the quota is rejected with a clear message to the uploader. The leader is shown a warning at 80% [ASSUMPTION].

**LIM-02 (M): Member limit per group**
*As the platform, I want each group limited to its member cap (500 by default on hosted).*
- When the group is full, the invite link and join requests show "This group is full".

**LIM-03 (M): Upload size per file type**
*As the platform, I want a maximum size per file type (values defined later).*

**LIM-04 (M): Limits are instance settings**
*As an instance admin, I want to set the default limits, or turn them off.*
- On self-hosted, the defaults are **no storage or member limit**. Upload size limits still apply, to protect the server.
- The admin can change one group's limits by hand. This is the hook used for paid upgrades in Phase 2.

### 4.9 Self-hosting and administration (OPS)

**OPS-01 (M): One-command deployment**
*As a self-hoster, I want to start the full app with Docker Compose on a single VPS.*
- `docker compose up` starts the app, database, and file storage, with a documented `.env` file.
- Minimum documented server size (target: 2 vCPU, 4 GB RAM [ASSUMPTION]).
- The **hosted service runs the same package** on our VPS.

**OPS-02 (M): Configuration**
*As a self-hoster, I want to configure the instance through environment variables.*
- Settings include: domain, email (SMTP), optional Google login, file storage (local disk or S3-compatible), default limits, and interest categories.

**OPS-03 (M): First admin setup**
*As a self-hoster, I want to create the first instance admin account on first start.*

**OPS-04 (M): Backups and updates**
*As a self-hoster, I want documented steps to back up data and update to a new version without losing data.*
- Database migrations run automatically on update.

**OPS-05 (M): Open-source repository**
*As a contributor, I want a public repository with an AGPL license, a README, setup instructions, and contribution guidelines.*

**OPS-06 (S): Admin panel**
*As an instance admin, I want to see and manage users and groups, and to suspend abusive accounts.*

---

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| **NFR-01 Mobile-first** | Designed for small screens first. Usable on a low-end Android phone (e.g. 2 GB RAM) in Chrome |
| **NFR-02 Low bandwidth** | First page load under ~500 KB (excluding media). Usable on a slow 3G connection. Images compressed and lazy-loaded |
| **NFR-03 PWA** | Installable on the Android home screen |
| **NFR-04 Languages** | Every screen, email, and error message in **French and English**. The user chooses, and the browser language is the default |
| **NFR-05 Security** | HTTPS only. Hashed passwords. Permission checks on every API request (role + group). Uploaded files reachable only by authorised users. Protection against the OWASP Top 10 |
| **NFR-06 Privacy** | The pseudo, contact-visibility, and progress-visibility rules are enforced on the server, not only hidden in the interface |
| **NFR-07 Data protection** | Comply with Cameroon's personal data protection law: consent at sign-up, a privacy policy, and data export and deletion (ACC-07) |
| **NFR-08 Performance** | Common pages respond in under 2 seconds on hosted, for groups of up to 500 members |
| **NFR-09 Reliability** | Daily automated database backups on hosted |
| **NFR-10 Accessibility** | Readable font sizes, sufficient contrast, labelled form fields |
| **NFR-11 API-first** | All features are available through a documented API, so the Phase 3 Android app can use the same backend |

## 6. Out of scope for Phase 1

- **Payments** of any kind: entry fee, subscriptions, paid courses, platform fee, paid upgrades. These are Phase 2. Phase 1 only **prepares** for them: the course structure, the per-group limits, and access control.
- Native Android app (Phase 3) and iOS.
- **Notifications and reminders.** The only emails sent are for verification and account recovery. No SMS at all in Phase 1.
- Live sessions.
- Leader approval of proof.
- Measuring "benefit" (outcomes beyond completion).
- WhatsApp/Telegram integration.

## 7. Open questions

None blocking. The remaining **[ASSUMPTION]** items are reasonable defaults that can be adjusted during design and build.
