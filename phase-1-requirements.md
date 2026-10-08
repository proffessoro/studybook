# Phase 1 Requirements: Web app, tasks and proof

> Status: **Draft v0.1** (2026-10-08). Based on `intent.md` v0.6.
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
| **Visitor** | Not logged in | View the landing page, sign up, log in, open an invite link |
| **Member** | One group | View content, submit proof, take quizzes, see their own progress (and others' if the leader allows), post and comment |
| **Moderator** | One group | Everything a member can do, plus manage content and tasks, moderate posts, remove members, view the dashboard and member contacts [ASSUMPTION] |
| **Leader (owner)** | One group | Everything, plus group settings, roles, and deleting the group |
| **Instance admin** | Whole server | Configure the instance (limits, email, Google login, storage) and manage users. On hosted, this is us; on self-hosted, the self-hoster |

Any user can be a leader of some groups and a member of others.

## 3. Definitions

| Term | Meaning |
|---|---|
| **Group** | A community with its own members, content, tasks, and settings |
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
- Sign-up requires **full name, email, phone number (Cameroon format, +237), password, and preferred language (FR/EN)**.
- Email must be unique on the instance. Phone must be unique on the instance [ASSUMPTION].
- The password has at least 8 characters and is stored hashed (never in plain text).
- A verification email is sent. The account stays limited (can't create or join groups) until the email is verified [ASSUMPTION].
- Invalid input shows clear field-level errors in the user's language.

**ACC-02 (M): Verify phone number**
*As the platform, I want the phone number confirmed so that it can serve as the account's backup and for tracking.*
- Verification by SMS code (OTP) when an SMS provider is configured on the instance.
- If no SMS provider is configured (e.g. a self-hosted instance), the phone number is stored without verification [ASSUMPTION].

**ACC-03 (M): Log in with email**
*As a user, I want to log in with my email and password.*
- Wrong credentials show a generic error that doesn't reveal whether the email exists.
- Login attempts are rate-limited (e.g. 5 failures, then a short lock).
- The session persists on the device until logout or expiry.

**ACC-04 (M): Log in with Google**
*As a user, I want to log in with Google so that I don't need to remember a password.*
- Google login works only if the instance admin has configured it.
- If the Google email matches an existing account, it logs into that account.
- If the Google email is new, the user is asked for a **phone number** before the account is created, because phone is required at first sign-up.

**ACC-05 (M): Recover my account**
*As a user who forgot my password, I want to reset it by email, or by phone if I lost access to my email.*
- A reset link is sent by email and expires after a limited time (e.g. 1 hour).
- Phone-based recovery by SMS code works if an SMS provider is configured [ASSUMPTION].

**ACC-06 (M): Edit profile**
*As a user, I want to edit my name, photo, language, email, and phone.*
- Changing email or phone requires verifying the new value.

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
- **Visibility:** private (invite only) or public (listed and joinable) [ASSUMPTION: private is the default].
- **Join approval:** members join instantly, or the leader approves each request.
- **Progress visibility:** members see only their own progress, or everyone's.
- **Group language:** shown as a label. The interface always follows each user's own language.

**GRP-03 (M): Invite members**
*As a leader or moderator, I want to invite people with a link.*
- The invite link can be copied and shared, e.g. on WhatsApp.
- The link can be reset, which disables the old one.
- Opening the link while logged out leads to sign-up or login, then back to the group.

**GRP-04 (S): Discover and join public groups**
*As a user, I want to browse public groups and join one.*

**GRP-05 (M): Delete or archive a group**
*As a leader, I want to archive my group (read-only) or delete it.*
- Deleting requires typing the group name to confirm. Files are removed from storage.

### 4.3 Members, roles, privacy (MEM)

**MEM-01 (M): Member list with privacy**
*As a member, I want to see who is in my group, without seeing their contact details.*
- Members see only **name and profile photo** of other members.
- **Leaders and moderators** also see each member's **email and phone**.
- The API enforces this, not only the interface: a member's request never returns other members' contact fields.

**MEM-02 (M): Manage roles**
*As a leader, I want to promote members to moderator, demote them, and transfer leadership.*

**MEM-03 (M): Remove or ban a member**
*As a leader or moderator, I want to remove a member, or ban them so they can't rejoin with the link.*

**MEM-04 (M): Approve join requests**
*As a leader, I want to accept or reject join requests when approval is on.*

**MEM-05 (M): Leave a group**
*As a member, I want to leave a group.*
- My submissions remain visible to the leader in the history [ASSUMPTION].

### 4.4 Content (CNT)

**CNT-01 (M): Create courses, modules, and lessons**
*As a leader, I want to organise my content into courses, modules, and lessons.*
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

**CNT-05 (S): Group feed (posts and comments)**
*As a member, I want to post questions and reply to others in the group.*
- Leaders and moderators can delete posts and comments, and pin posts.

### 4.5 Tasks and proof (TSK)

**TSK-01 (M): Create a task**
*As a leader or moderator, I want to create a task with a title, instructions, a proof type, and an optional deadline.*
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
- The leader can **extend the deadline**, which reopens submission [ASSUMPTION].

**TSK-04 (M): Edit or replace a submission**
*As a member, I want to replace my proof before the deadline.* [ASSUMPTION]

**TSK-05 (M): View submissions**
*As a leader or moderator, I want to open any member's proof (file, photo, link, quiz result).*

**TSK-06 (M): Member task list**
*As a member, I want to see my tasks grouped as To do, Completed, and Missed, with deadlines shown.*

### 4.6 Quizzes (QUZ)

**QUZ-01 (M): Build a quiz**
*As a leader, I want to create a quiz with questions and a minimum score.*
- Question types: **single choice, multiple choice, true/false** [ASSUMPTION: no free-text answers, since they can't be auto-graded].
- The minimum score is set as a percentage (e.g. 70%).

**QUZ-02 (M): Take a quiz with unlimited retries**
*As a member, I want to take the quiz and retry until I pass.*
- Each submission is graded right away and the score is shown.
- There is no limit on attempts, and retrying is allowed until the deadline.
- When the score is at least the minimum, the task becomes **Completed**.
- The leader sees the number of attempts and the best score for each member.
- Whether members see the correct answers after a failed attempt is a quiz setting [ASSUMPTION: default is to show only the score, so members can't pass by copying answers].

### 4.7 Tracking and dashboard (TRK)

**TRK-01 (M): Completion dashboard**
*As a leader, I want one screen showing who acted, who completed, and who did nothing.*
- A table with **members as rows and tasks as columns**, each cell showing the status (Not started / Viewed / Completed / Missed).
- Each task shows a summary, e.g. "18 completed · 5 viewed · 7 not started".
- Filters by task, course, status, and date range.
- Clicking a cell opens that member's proof.
- The dashboard loads in under 3 seconds for a group of 500 members and 50 tasks [ASSUMPTION].

**TRK-02 (M): Member profile progress**
*As a leader, I want one member's history: tasks completed, missed, and their completion rate.*

**TRK-03 (M): My progress**
*As a member, I want to see my completion rate and history in each group.*

**TRK-04 (M): Shared progress (when enabled)**
*As a member, I want to see other members' progress if the leader allows it.*
- When the setting is off, the API never returns other members' progress to members.
- When on, members see names, completion rates, and task statuses, but **never contact details or proof files** [ASSUMPTION].

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
- Settings include: domain, email (SMTP), optional Google login, optional SMS provider, file storage (local disk or S3-compatible), and default limits.

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
| **NFR-06 Privacy** | The contact-visibility and progress-visibility rules are enforced on the server, not only hidden in the interface |
| **NFR-07 Data protection** | Comply with Cameroon's personal data protection law: consent at sign-up, a privacy policy, and data export and deletion (ACC-07) |
| **NFR-08 Performance** | Common pages respond in under 2 seconds on hosted, for groups of up to 500 members |
| **NFR-09 Reliability** | Daily automated database backups on hosted |
| **NFR-10 Accessibility** | Readable font sizes, sufficient contrast, labelled form fields |
| **NFR-11 API-first** | All features are available through a documented API, so the Phase 3 Android app can use the same backend |

## 6. Out of scope for Phase 1

- **Payments** of any kind: entry fee, subscriptions, paid courses, platform fee, paid upgrades. These are Phase 2. Phase 1 only **prepares** for them: the course structure, the per-group limits, and access control.
- Native Android app (Phase 3) and iOS.
- **Notifications and reminders.** The only emails sent are verification and password reset.
- Live sessions.
- Leader approval of proof.
- Measuring "benefit" (outcomes beyond completion).
- WhatsApp/Telegram integration.

## 7. Open questions

1. **Moderator powers:** should moderators see member contact details and the completion dashboard like leaders, or only moderate content?
2. **Email verification:** must the email be verified before a user can create or join a group, or can they start immediately and verify later?
3. **SMS for self-hosters:** phone verification needs a paid SMS provider. Is it OK for self-hosted instances without SMS to store the phone number unverified?
4. **Public groups:** do we need public, discoverable groups in Phase 1, or are all groups invite-only for now?
5. **Courses:** is the "course → module → lesson" structure right? (It matters for Phase 2, where courses are sold.)
6. **Quiz answers:** after a failed attempt, should members see the correct answers, or only their score?
7. **Deadline extension:** can a leader extend a deadline after it has passed (reopening submission)?
8. **Replacing proof:** can members replace their proof before the deadline, or is the first submission final?
9. **Shared progress:** when progress sharing is on, should members also see each other's **proof** (e.g. photos), or only statuses?
10. **Group feed (CNT-05):** is a discussion feed needed in Phase 1, or should members keep discussing on WhatsApp for now?
