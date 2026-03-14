# Active Backlog (2026-02-23)

## Bugfix - Eliminate Raw D1 Transaction SQL Callers (2026-03-14)

### Goal
Remove every remaining application path in the current branch that issues raw `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` SQL against Cloudflare D1, so event and poll workflows stop rediscovering the same runtime failure.

### Acceptance Criteria
- [x] Inventory every remaining raw transaction caller in the current branch.
- [x] Replace each application caller with a supported D1 pattern (`db.batch()` and explicit statement sequencing) without regressing workflow behavior.
- [x] Add or update regression coverage for the affected event and poll flows.
- [x] Verify with targeted tests, typecheck, and build.
- [ ] Commit with DCO signoff and push the branch.

### Active Tasks
- [x] Audit the current branch for `runInTransaction()` and direct `BEGIN` / `COMMIT` / `ROLLBACK` statements.
- [x] Migrate event create/delete plus poll-close flows to D1-safe batching.
- [x] Update route tests that currently assert raw transaction statements.
- [ ] Run verification, commit, and push.

### Working Notes
- The current branch has two classes of D1 problems: the newer event feature uses `runInTransaction()` from `/Users/jspahr/repo/meatup-club/app/app/lib/d1-transactions.server`, while older poll routes issue raw transaction SQL inline.
- `origin/main` does not contain the local event-edit work, so this hardening needs to land on the feature-branch lineage rather than as a small patch to production `main`.

### Results
- Replaced every remaining raw-SQL D1 transaction caller in the current branch: member/admin event create and update flows, admin event delete, admin poll close with event creation, and `/api/polls` poll close with event creation.
- Added reusable D1-safe statement builders in `/Users/jspahr/repo/meatup-club/app/app/lib/events.server.ts` and `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts` so event creation, staged invite/update/cancel delivery inserts, and event deletion can all run through `db.batch()`.
- Updated `/Users/jspahr/repo/meatup-club/app/app/lib/d1-transactions.server.ts` to fail fast with an explicit error instead of silently encouraging unsupported raw transaction SQL.
- Regression coverage now proves the affected flows no longer depend on raw `BEGIN` / `COMMIT` statements:
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.test.ts`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.security.test.ts`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/api.polls.test.ts`
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.events.test.ts app/routes/dashboard.admin.events.test.ts app/routes/dashboard.admin.polls.security.test.ts app/routes/api.polls.test.ts` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed with the existing Vite dynamic-import warnings and the known Wrangler log-file `EPERM` warning.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`38` files, `353` tests).

## Bugfix - Event Edit Time Update Failure (2026-03-13)

### Goal
Fix the event-edit flow so changing an event time succeeds instead of returning the shared `Failed to update event` error.

### Acceptance Criteria
- [x] Reproduce or otherwise isolate the current edit failure on the code path the screenshot actually came from.
- [x] Identify the exact failing persistence path for event edits.
- [x] Implement the smallest safe fix without disturbing unrelated event workflows.
- [x] Add regression coverage for the failure mode.
- [x] Run targeted verification and record the root cause, fix, and any remaining risk.

### Active Tasks
- [x] Inspect the current member/admin event edit routes and supporting persistence helpers.
- [x] Reproduce the failure with a focused test or minimal route-action exercise.
- [x] Implement the fix and add regression coverage.
- [x] Run verification and summarize results.

### Working Notes
- The live UI error is the page-level alert `Failed to update event`, which implies the route action handled the exception and returned an error state rather than crashing the request.
- `tasks/lessons.md` already records a production failure mode where Cloudflare D1 rejected raw SQL `BEGIN TRANSACTION` statements with error code `7500`; the edit path may still be using that helper.
- The screenshot showed the member-facing `Upcoming Events` page, which narrowed the failing path to `/dashboard/events` in the dirty root worktree rather than the clean `main` admin page.

### Results
- Root cause: both the member and admin event `update` actions still wrapped their persistence flow in `runInTransaction()`, whose implementation issues raw `BEGIN TRANSACTION` / `COMMIT` SQL through D1. That matches the earlier D1 rejection lesson and explains the generic `Failed to update event` alert.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` so event edits now use `db.batch()` with an explicit `calendar_sequence` bump plus staged email-delivery inserts/selects, instead of the unsupported raw-SQL transaction helper.
- Added reusable batched statement helpers in `/Users/jspahr/repo/meatup-club/app/app/lib/events.server.ts` and `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts` for the D1-safe update path.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.test.ts` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts` that simulates D1 rejecting raw transaction SQL and proves update actions still succeed through the batched path.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.events.test.ts app/routes/dashboard.admin.events.test.ts` passed (`17` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed. Vite emitted the existing dynamic-import warnings, and Wrangler repeated the known sandbox log-file `EPERM` warning under `/Users/jspahr/Library/Preferences/.wrangler/logs`.
- Remaining risk:
  - Other flows still use `runInTransaction()`, notably event create/delete and the poll-close event-creation path, so they remain candidates for the same D1 failure until they are migrated off the helper.

## Feature - Events Page Tile Layout And In-Place Actions (2026-03-13)

### Goal
Make the member events page easier to scan when there are multiple events, and stop lower-page event actions from bouncing the user back to the top of the page.

### Acceptance Criteria
- [x] Upcoming events render as compact summary tiles so members can tell at a glance that multiple events exist.
- [x] Event details can still be accessed inline without sending members to a separate page.
- [x] RSVP and edit interactions no longer reset scroll position when used on a lower event card.
- [x] Automated coverage proves the new disclosure/tile behavior, and route verification still passes.
- [x] Results capture what changed, how it was verified, and any remaining UX tradeoffs.

### Active Tasks
- [x] Review the current events page layout and identify the smallest safe redesign.
- [x] Implement a tile/disclosure layout for upcoming events.
- [x] Preserve scroll position for in-page event actions.
- [x] Add focused regression coverage for the new member-facing behavior.
- [x] Run verification and summarize results.

### Working Notes
- The current `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx` renders each upcoming event as a long full-width card with RSVP controls and attendee lists always expanded, so multiple events read like one continuous page.
- Route actions currently `redirect("/dashboard/events")` after create, update, and RSVP submissions; combined with standard `<Form>` navigation, that returns the user to the top of the page.
- A summary-first tile layout with opt-in expansion should solve the scanning problem without splitting the page into separate routes.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx` so upcoming events now render as compact summary tiles with response-count stat blocks, a single expandable details panel per event, and a smaller two-column layout for past events.
- Changed the same route action to return success payloads instead of redirecting back to `/dashboard/events`, which preserves the current scroll position after RSVP, create, and edit submissions while still revalidating loader data.
- Sorted upcoming events chronologically so the nearest meetup appears first, and surfaced a "Next up" summary above the tile grid.
- Added UI coverage in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.ui.test.tsx` for the multi-tile collapsed state and inline expansion behavior, and updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.test.ts` to cover chronological ordering plus the new non-redirect action contract.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.events.test.ts app/routes/dashboard.events.ui.test.tsx` passed (`7` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed. Existing Vite dynamic-import warnings remained, and Wrangler again emitted the known sandbox log-file permission warning under `/Users/jspahr/Library/Preferences/.wrangler/logs`.
- Remaining UX tradeoff:
  - Action errors still surface in the shared page-level alert near the top of the route. Success-path scrolling is fixed, but a future polish pass could mirror errors inline inside the active tile as well.

## Bug Investigation - Partial Event Invite Delivery (2026-03-12)

### Goal
Identify why some active members did not receive the latest calendar invite email when a new event was created, then fix the code path if the issue is in-app.

### Acceptance Criteria
- [x] Reproduce or otherwise isolate the invite-delivery failure mode in the current code.
- [x] Confirm which event-creation flows are affected.
- [x] Implement the smallest safe fix if the failure is caused by application logic.
- [x] Add regression coverage for the identified failure mode.
- [x] Run verification and record the root cause, fix, and remaining risks.

### Active Tasks
- [x] Review the current invite-delivery implementation and identify likely partial-send failure modes.
- [x] Reproduce the failure with focused tests around the shared notification code.
- [x] Implement the minimal fix in the affected invite-delivery path(s).
- [x] Run targeted verification and summarize findings.

### Working Notes
- Both `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.tsx` feed the same Resend invite sender in `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`.
- The current invite sender issued one outbound Resend request per recipient in a single sequential `waitUntil()` background promise; that makes initial invite delivery uniquely vulnerable to partial completion when runtime/background windows are tight.
- Event updates and cancellations already fan out concurrently, so the sequential behavior was isolated to initial event invite creation.
- Wrangler access is valid for `workers_tail`, but `wrangler tail` is a live stream only; it does not surface historical invite-send logs after the fact.
- Production D1 has `11` active users (`2` admins, `9` non-admin members), and the exact invite-recipient query (`SELECT email FROM users WHERE status = 'active'`) returns the two admin emails first.
- The affected March 7 event records (`event 4` and `event 5`) were direct event creations, not poll-close-created events; poll `2` closed later with `created_event_id = NULL`.
- Production is behind the current repo schema at least on `events.created_by`, so a safe production fix should avoid bundling newer event-ownership code with the invite hotfix.

### Results
- Root cause isolated in `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`: `sendEventInvites()` processed recipients strictly one at a time even though the create-event flows hand it off to a background `waitUntil()` task.
- This affects both `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.tsx`, because both route actions ultimately use the same invite sender for new-event invites.
- Updated `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts` to send invites with bounded parallelism (`6` concurrent sends), keeping the personalized `.ics` attachment per recipient while reducing wall-clock time for the background job.
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.notifications.test.ts` coverage proving the sender now dispatches the first six invite requests before waiting on earlier recipients to finish.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/email.server.notifications.test.ts` passed (`10` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/email.server.test.ts app/lib/email.server.send.test.ts app/lib/email.server.notifications.test.ts` passed (`50` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed. Wrangler emitted sandbox-related log-file permission warnings while writing under `/Users/jspahr/Library/Preferences/.wrangler/logs`, but the production build artifacts were generated successfully.
  - `cd /Users/jspahr/repo/meatup-club/app && wrangler whoami` succeeded and confirmed `workers_tail` access on account `c6d9ae7d3aa1e5c2cce04194cf33b768`.
  - `cd /Users/jspahr/repo/meatup-club/app && wrangler tail --help` confirmed the available worker-log path is live tailing.
  - A filtered live tail for `"Calendar invites"` produced no matching events during the sample window, and a grep through `/Users/jspahr/Library/Preferences/.wrangler/logs` found no stored local Wrangler debug logs containing the invite-send messages.
- Remaining risk:
  - If the active member count grows beyond what a single request can safely fan out through direct outbound email API calls, the next step should be a durable outbox/queue job rather than more in-request delivery work.
  - The currently deployed production app appears older than the current repo in at least one schema-dependent area, so deploying a broad event-route bundle without first reconciling migrations could introduce unrelated runtime failures.

## Durable Event Email Delivery (2026-03-12)

### Goal
Replace in-request event invite/update/cancellation fan-out with a durable, auditable email delivery pipeline backed by schema state and a Cloudflare Queue.

### Acceptance Criteria
- [x] Event create/update/cancel flows persist intended email deliveries durably before any outbound send attempt.
- [x] A queue consumer sends event emails from persisted delivery rows rather than from request-time `waitUntil()` fan-out.
- [x] Delivery rows track provider handoff and webhook-delivered status updates.
- [x] Resend admin setup configures or documents the delivery-status webhook path needed for state transitions.
- [x] Verification covers staging/enqueue/send/status-update behavior with automated tests plus typecheck/build.

### Active Tasks
- [x] Add schema and migration support for durable event email deliveries and provider webhook metadata.
- [x] Implement delivery staging, queue enqueue/recovery, and queue-consumer send logic.
- [x] Update event mutation routes to wrap event changes and delivery staging in transactions.
- [x] Add a Resend delivery-status webhook handler and integrate setup/config support.
- [x] Run targeted verification and record the rollout requirements.

### Working Notes
- Production evidence shows the old invite query returns the two admin emails first, which is why early termination manifested as “admins only.”
- The durable design should snapshot all data needed to send an email so cancellation deliveries survive later event deletion.
- Queue provisioning belongs in `app/wrangler.toml` in this repo; the worker itself is not managed by Terraform here.

### Results
- Added durable delivery persistence in `/Users/jspahr/repo/meatup-club/app/migrations/20260312_add_event_email_deliveries.sql` and `/Users/jspahr/repo/meatup-club/schema.sql`, including `event_email_deliveries` and `provider_webhooks`.
- Implemented queue-backed delivery staging, send/retry, backlog recovery, and provider-webhook status updates in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts`, and wired the worker queue/scheduled handlers in `/Users/jspahr/repo/meatup-club/app/workers/app.ts`.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.tsx` so event creation, update, cancellation, and poll-close event creation stage deliveries inside the same DB transaction as the event mutation, then enqueue after commit.
- Extended `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts` with provider-aware single-recipient invite/update/cancel senders that return Resend message ids and accept idempotency keys.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-delivery.tsx` for Resend delivery-status webhooks and updated `/Users/jspahr/repo/meatup-club/app/app/routes/api.admin.setup-resend.tsx`, `/Users/jspahr/repo/meatup-club/app/app/lib/resend-setup.server.ts`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.setup.tsx` to provision and surface delivery webhook tracking, including Resend rate-limit retries and the current webhook-create payload shape.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-delivery.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.security.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.notifications.test.ts`, and `/Users/jspahr/repo/meatup-club/app/test/route-health.test.ts`.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/event-email-delivery.server.test.ts app/lib/email.server.notifications.test.ts app/routes/dashboard.events.test.ts app/routes/dashboard.admin.events.test.ts app/routes/dashboard.admin.polls.security.test.ts app/routes/api.webhooks.email-delivery.test.ts` passed (`38` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- test/route-health.test.ts` passed (`36` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`34` files, `322` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed. Existing Vite dynamic-import warnings remained, and Wrangler emitted the same sandbox-only log-file permission warnings under `/Users/jspahr/Library/Preferences/.wrangler/logs`.
- Remaining rollout requirements:
  - None. Production migration, queue provisioning, worker deploy, and delivery webhook secret storage are complete.

### Rollout Evidence
- Captured a D1 Time Travel rollback bookmark before production schema changes: `000001c6-0000001a-0000502d-554a408716c8240b6342775d240ca4aa`.
- Applied remote D1 migrations `20260307_add_event_created_by.sql` and `20260312_add_event_email_deliveries.sql` to `meatup-club-db`, then verified `event_email_deliveries`, `provider_webhooks`, and `events.created_by` exist in production.
- Created Cloudflare Queue `meatup-club-email-delivery` (`1c1c8adee2b04060a89a95c8c47cebe6`) and dead-letter queue `meatup-club-email-delivery-dlq` (`8b498771fa884e13a65fc1bef8c8b956`), and verified the deployed worker is attached as producer/consumer for the main queue.
- Deployed worker versions `0186329d-09b9-48b4-8e35-2e725a5a9163`, `29f52deb-3429-492f-9880-54f93318f4e1`, `34555d1f-2215-4ada-935d-ac3581082c2f`, `437cde23-81d8-476c-833f-548210734833`, `86b03989-8938-4bda-81ba-c1245642146f`, and final version `b40a11e9-1ad9-4d17-a44d-84450087bb59` while iterating on production-only Resend setup issues.
- The production rollout exposed three Resend integration issues in sequence, each confirmed by live scheduled-worker logs and then fixed in code:
  - `2026-03-12 22:00 EDT`: `401 restricted_api_key` on `GET /domains` until the production `RESEND_API_KEY` was replaced with a full-access key.
  - `2026-03-12 23:45 EDT`: `429 rate_limit_exceeded` while creating the delivery webhook, fixed by retry/backoff around Resend management requests.
  - `2026-03-13 00:30 EDT`: `422 missing_required_field` because Resend webhook creation expects `endpoint` instead of `url`, fixed in the request payload.
- Live scheduled-worker logs at `2026-03-13 00:45 EDT` on version `b40a11e9-1ad9-4d17-a44d-84450087bb59` reported `Configured Resend email setup from scheduled bootstrap` with domain `mail.meatup.club` and delivery webhook `https://meatup.club/api/webhooks/email-delivery`.
- Verified production `provider_webhooks` now contains:
  - `provider = resend`
  - `purpose = delivery_status`
  - `webhook_id = 34e00589-9a1d-4ec7-b59c-d4a5c86d2a87`
  - `endpoint = https://meatup.club/api/webhooks/email-delivery`
  - `has_signing_secret = 1`
  - `created_at = 2026-03-13 04:45:28`

## Feature - Admin Calendar Resend For Existing Events (2026-03-13)

### Goal
Allow admins to resend a calendar request for an existing event so missed recipients can receive it and existing recipients get a clean calendar update.

### Acceptance Criteria
- [x] Admins can trigger a resend for an existing event without editing the event details manually.
- [x] Resending bumps the event `calendar_sequence` and stages a fresh durable email batch for all active members.
- [x] Regression coverage proves the resend action increments sequence and enqueues update deliveries.
- [x] Verification passes for targeted tests and `npm run typecheck`.

### Active Tasks
- [x] Add a server-side resend action and sequence increment path for existing events.
- [x] Add a resend control to the admin events UI.
- [x] Add regression tests for the resend flow.
- [x] Run verification and summarize how to use it for the March 18, 2026 and April 17, 2026 events.

### Working Notes
- Production’s latest upcoming events are `Angus Barn` on `2026-03-18 19:00` (event `4`) and `TBD - Soo's Cafe?` on `2026-04-17 19:00` (event `5`).
- A resend should behave like a new calendar revision, so the event `calendar_sequence` should increment even if the event details are unchanged.
- Reusing the existing `update` delivery type keeps the queue/webhook pipeline unchanged while still sending a fresh `METHOD:REQUEST` with a new sequence and dedupe key.

### Results
- Added a dedicated resend action in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` that increments `events.calendar_sequence`, stages a fresh durable `update` delivery batch, enqueues it, and logs `resend_event_calendar`.
- Added a reusable sequence bump helper in `/Users/jspahr/repo/meatup-club/app/app/lib/events.server.ts`.
- Added admin UI affordance in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` so upcoming events expose a `Resend Calendar` action without requiring manual event edits.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts` for successful resend and cancelled-event rejection paths.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.admin.events.test.ts` passed (`9` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
- `cd /Users/jspahr/repo/meatup-club/app && npm run deploy` passed and deployed worker version `65bfd201-bedb-47ae-93b4-f64c9f3a0d37`.
- `cd /Users/jspahr/repo/meatup-club/app && wrangler d1 execute meatup-club-db --remote --command "SELECT id, restaurant_name, event_date, event_time, status, calendar_sequence, created_at FROM events ORDER BY event_date DESC, event_time DESC, id DESC LIMIT 5;"` confirmed the latest upcoming events remain `Angus Barn` on `2026-03-18 19:00` and `TBD - Soo's Cafe?` on `2026-04-17 19:00`.

## Feature - Targeted Calendar Resend Controls (2026-03-13)

### Goal
Allow admins to resend event calendar emails only to members missing an accepted delivery, or to an explicitly selected subset of members, while preserving the durable queue-backed delivery pipeline.

### Acceptance Criteria
- [x] Admins can queue a resend to only active members without any `provider_accepted` or `delivered` row for that event.
- [x] Admins can queue a resend to an explicitly selected subset of active members even if those members already had a delivered or accepted row.
- [x] The admin events UI exposes recipient history/status so resend targeting is understandable.
- [x] Regression coverage proves the server-side recipient targeting behavior.
- [x] Verification passes for targeted tests, `npm run typecheck`, and production backfill of the two admin invite rows is completed.

### Active Tasks
- [x] Add targeted event-email staging helpers for missing-only and selected-user resend scopes.
- [x] Update the admin events loader/UI to show delivery history and submit the new resend scopes.
- [x] Add regression coverage for missing-only and selected resend actions plus delivery helper behavior.
- [x] Deploy the feature and backfill delivered rows for the two admins on the March 18, 2026 and April 17, 2026 events.

### Working Notes
- The new resend feature should build on `event_email_deliveries`, not bypass it, so queue/webhook observability stays intact.
- “Missing” is defined by the absence of any `provider_accepted` or `delivered` row for the same `event_id` and `user_id`.
- The two admin recipients shown as delivered in the Resend screenshot need one-time production backfill rows so they are excluded from “missing” for those historical events.

### Results
- Added recipient-targeted delivery helpers in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts`:
  - `getActiveMemberIdsWithoutAcceptedEventEmailDelivery`
  - `listEventEmailRecipientDeliveryHistory`
  - `stageEventUpdateDeliveriesForUserIds`
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` so admins can resend to:
  - missing recipients only
  - selected active members
  - all active members
  and can see per-member delivery history directly in the admin event card.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.test.ts` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts`.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/event-email-delivery.server.test.ts` passed (`9` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.admin.events.test.ts` passed (`11` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run deploy` passed and deployed worker version `1de088b2-edcd-4713-83ca-64d0a69ae312`.
- Production backfill completed:
  - inserted four `delivered` invite rows for admin users `1` and `2` on events `4` (`Angus Barn`, March 18, 2026) and `5` (`TBD - Soo's Cafe?`, April 17, 2026)
  - canonical dedupe keys: `invite:4:0:1`, `invite:4:0:2`, `invite:5:0:1`, `invite:5:0:2`
- post-backfill missing counts are now `9` for event `4` and `9` for event `5`, which excludes the two admins as intended

## Bugfix - Production Resend Action Failed (2026-03-13)

### Goal
Fix the production admin resend action after the first live attempt returned `Failed to resend calendar event`.

### Acceptance Criteria
- [x] Identify whether the production failure was in the new recipient-targeting logic or in the surrounding persistence path.
- [x] Deploy a production fix for the resend action.
- [x] Verify local tests/typecheck/build via deploy and record the deployed version.

### Working Notes
- Production DB state after the failed click showed `events.calendar_sequence` still at `0` for events `4` and `5`, with no new `update` delivery rows, so the action failed before commit.
- A direct remote D1 experiment showed Cloudflare rejecting SQL `BEGIN TRANSACTION` with error code `7500`; that matches the custom helper in `/Users/jspahr/repo/meatup-club/app/app/lib/d1-transactions.server.ts`.
- The resend action was updated to use `db.batch()` with an event-sequence update statement, a staged update-delivery insert statement, and a batch-id select statement, which preserves atomicity without SQL transaction statements.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` so the resend branch uses batched D1 statements instead of `runInTransaction`.
- Added reusable staged-update statement builders in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts` for the batched resend path.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.admin.events.test.ts` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run deploy` passed and deployed worker version `765bb4fc-c2fc-449f-a3f3-7e04fd927bd0`.

## Bugfix - Event Email Queue Rate Limiting (2026-03-13)

### Goal
Prevent queue-driven event email sends from repeatedly hitting Resend `429 Too Many Requests` responses during resends or backlog recovery.

### Acceptance Criteria
- [x] Event email queue processing no longer bursts enough concurrent send requests to exceed Resend's per-second API limit under normal resend batches.
- [x] Retry handling honors provider retry guidance when available and avoids synchronized retry storms.
- [x] Regression coverage proves `429` responses propagate retry delay information and queue processing respects the throttled send model.
- [x] Verification passes for targeted tests and `npm run typecheck`.

### Active Tasks
- [x] Confirm the current queue/send burst behavior and provider rate-limit constraints.
- [x] Implement queue-side pacing plus provider-aware retry delay handling.
- [x] Add regression coverage for `429` handling and paced queue execution.
- [x] Run verification and record production rollout notes.

### Working Notes
- Production resend batches for events `4` and `5` created `retry` rows with `last_error = Failed to send email: Too Many Requests`.
- The queue consumer currently accepts up to `10` messages per batch and processes them with `Promise.all`, which can burst above provider limits even for small member counts.
- Resend `429` responses should drive retry timing directly when a `Retry-After` header is present; fixed backoff alone is too coarse and can keep colliding.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts` to capture provider retry hints (`Retry-After` and `RateLimit-Reset`) on failed Resend API responses and to include those values in failure logs.
- Updated `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.ts` so queue batches process sequentially with a 1-second inter-send delay, and retry scheduling uses provider-supplied retry timing plus small jitter when present.
- Updated `/Users/jspahr/repo/meatup-club/app/wrangler.toml` to cap the email queue consumer at `max_concurrency = 1` so Cloudflare does not run multiple event-email batches in parallel.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/lib/event-email-delivery.server.test.ts` and `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.notifications.test.ts` for `429` retry timing and sequential queue pacing.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/event-email-delivery.server.test.ts app/lib/email.server.notifications.test.ts` passed (`24` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`35` files, `336` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run deploy` passed and deployed worker version `6b24f4fa-a7ad-46db-b9bf-55185d8c9a87`.
- Production verification:
  - At `2026-03-13 06:42:35 UTC`, event `5` had fully drained to `9 delivered` while event `4` still had `5 retry` rows awaiting the next scheduled backlog recovery.
  - At `2026-03-13 06:46:23 UTC`, production D1 showed both event `4` and event `5` update batches fully drained to `9 delivered` and `0 retry`.

## Feature - Ad Hoc Member Announcement Email (2026-03-13)

### Goal
Allow admins to send a one-off announcement email, such as the event-invite postmortem, to all active members or a selected subset using Resend.

### Acceptance Criteria
- [x] Admins can compose and send a one-off announcement email from the admin UI.
- [x] The send can target either all active members or a selected subset of active members.
- [x] Sending uses Resend safely without tripping per-recipient event-email rate limits.
- [x] The action is covered by regression tests and verification passes.

### Active Tasks
- [x] Reuse or extend the existing email-sending helpers for ad hoc announcements.
- [x] Add an admin route/UI for composing and sending the message.
- [x] Add regression coverage for validation, recipient selection, and successful sends.
- [x] Run verification and record the rollout result.

### Working Notes
- For this use case, Resend batch sending is a better fit than the event-email queue because the announcement email has no calendar attachments and can be sent in one API request for the current member count.
- The route should use the production DB and Resend bindings directly, so admins can send from the deployed app without local secret handling.

## Enhancement - Announcement Drafts and Self-Test Send (2026-03-13)

### Goal
Make the existing admin announcements page the normal workflow for incident communication by adding a saved postmortem draft and a one-click `Just me (test)` send mode.

### Acceptance Criteria
- [x] Admins can load a saved postmortem draft directly from the announcements page.
- [x] Admins can send an announcement to just themselves for a test without manually selecting their own member row.
- [x] The existing all-active and selected-recipient flows continue to work.
- [x] Regression coverage proves the new `me_only` recipient mode and verification passes.
- [x] The updated admin announcements page is deployed.

### Active Tasks
- [x] Add a shared announcement draft definition for the member-facing postmortem text.
- [x] Extend the announcements loader/UI to expose and load saved drafts.
- [x] Add a `me_only` recipient mode in the announcements action and UI.
- [x] Add regression coverage for the new recipient mode.
- [x] Run verification and deploy the enhancement.

### Working Notes
- The clean solution here is to extend the deployed admin workflow instead of relying on terminal-only delivery tooling.
- The existing announcement page already handled all-active and selected recipients, so the smallest useful enhancement was draft loading plus a direct self-test mode.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/announcement-drafts.ts` with a saved calendar-invite postmortem draft, including the member-facing subject and Markdown body.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.announcements.tsx` so the loader returns the current admin and available drafts, the UI can load a draft into the form, and the action supports `recipient_mode = 'me_only'` for one-click self-test sends.
- Kept `/Users/jspahr/repo/meatup-club/app/app/lib/announcement.server.ts` as the shared active-member lookup and recipient-selection helper for the announcements flow.
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.announcements.test.ts` for the new `me_only` mode and retained the existing selected/all-active coverage.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.admin.announcements.test.ts app/lib/announcement.server.test.ts` passed (`11` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`37` files, `350` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run deploy` passed and deployed worker version `e71d03b0-9f77-4178-9653-b996d7a2a4cf`.

## Bugfix - Poll Winner Visibility After Manual Event Creation (2026-03-07)

### Goal
Preserve closed-poll winner visibility after an admin manually creates an event from the events page and later closes the poll without creating another event.

### Acceptance Criteria
- [x] Closed polls continue to display their winning restaurant and date even when no linked event exists.
- [x] The admin events UI no longer implies that creating an event from vote leaders also closes the active poll.
- [x] Regression coverage proves the no-created-event winner case.
- [x] Verification passes for targeted tests, `npm run typecheck`, and the relevant route suite.

### Active Tasks
- [x] Reproduce the missing-winner path in the member polls loader and confirm where winner data is sourced.
- [x] Update the previous-polls query to read persisted winner ids instead of `created_event_id`.
- [x] Clarify admin events copy so manual event creation is described as a prefill, not poll finalization.
- [x] Add regression coverage for closed polls without a created event.
- [x] Run verification and record results.

### Working Notes
- Poll close already stores `winning_restaurant_id` and `winning_date_id`, so the prior member-page dependency on `events.created_event_id` was the wrong source of truth.
- The confusing user path is specifically the admin events page action that prefills an event from current vote leaders without touching poll status.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx` so previous poll winners come from the poll's stored winning ids rather than a linked event row.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx` copy to say `Prefill from Vote Leaders` and to explicitly note that creating an event there does not close the active poll.
- Expanded `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.route.test.ts` with regression coverage for closed polls that have winners but no created event.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`32` files, `306` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed.
- Known residual warnings:
  - Existing Vite dynamic-import warnings remain during `npm run build` for auth/session/email modules; this bugfix did not change that behavior.

## Goal
Keep only unresolved, high-impact work and remove stale planning artifacts.

## Baseline Snapshot
- Non-test runtime `as any` usages: `66`
- `window.confirm()` call sites: `7`
- Legacy/non-semantic color-pattern hits in route files: `15`
- Dashboard route `ErrorBoundary` exports: `1`
- `HydrateFallback` usage: `0`

## Acceptance Criteria
- [x] Non-test runtime `as any` usage is reduced from `66` to `0` (or explicitly documented exceptions).
- [x] Destructive confirm behavior is centralized and used in all current call sites.
- [x] Remaining legacy color/error utility patterns are migrated to semantic tokens/shared UI primitives.
- [x] High-risk dashboard routes have route-level `ErrorBoundary` exports.
- [x] Dashboard index, polls, and events routes provide explicit loading fallback UI.
- [x] Request-handler logs are redacted and avoid payload/PII dumps.
- [x] Verification passes: `npm run typecheck`, `npm run test:run`, `npm run build`.

## Active Tasks

### P0 - Safety and Correctness
- [x] Eliminate runtime `as any` in non-test code, starting with `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.sms.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/auth.google.callback.tsx`, `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`, and `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.ts`.
- [x] Redact/normalize request-handler logging in `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-rsvp.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.admin.setup-resend.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.search.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.details.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/api.places.photo.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`.

### P1 - UX and Consistency
- [x] Replace duplicated `window.confirm()` flows with a shared abstraction in `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.members.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.restaurants.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.dates.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.email-templates.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/components/CommentThread.tsx`.
- [x] Migrate remaining legacy color/error classes in `/Users/jspahr/repo/meatup-club/app/app/routes/accept-invite.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.setup.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/_index.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.restaurants.tsx`.

### P1 - Resilience
- [x] Add route-level `ErrorBoundary` exports to `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, and at least one admin entry route (`/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin._index.tsx`).
- [x] Add `HydrateFallback` skeletons for `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard._index.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`.

### P2 - Conventions
- [x] Add action response conventions to `/Users/jspahr/repo/meatup-club/CLAUDE.md` (success/error shape and redirect rules).
- [x] Add short JSDoc usage examples to shared UI components in `/Users/jspahr/repo/meatup-club/app/app/components/ui/`.

## Verification
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck`.
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run test:run`.
- [x] Run `cd /Users/jspahr/repo/meatup-club/app && npm run build`.
- [x] Record outcomes and any remaining risks.

## Results
- Completed all active backlog items across safety, UX consistency, resilience, and conventions.
- Verification status:
  - `npm run typecheck` passed.
  - `npm run test:run` passed (`17` files, `193` tests).
  - `npm run build` passed for client, SSR, and worker bundles.
- Remaining low-risk warnings:
  - Vite reports existing dynamic-import chunking warnings for shared modules (`auth.server`, `db.server`, `session.server`, `activity.server`, `email.server`).

## Current Task (2026-02-25)

### Goal
Resolve Twilio toll-free verification rejection and resubmit within the prioritized 7-day window.

### Acceptance Criteria
- [ ] Twilio resubmission text is finalized for all required fields.
- [ ] Public compliance pages include clear SMS consent, STOP/HELP instructions, frequency disclosure, and rates disclosure.
- [ ] A public consent-proof URL exists and does not require login.
- [ ] Public terms URL exists and is linked from landing/privacy.
- [ ] Verification performed: local route check/build and manual URL accessibility notes.

### Active Tasks
- [x] Audit current public compliance routes and consent copy.
- [x] Draft Twilio field-by-field resubmission content.
- [x] Propose minimal site changes and get user approval before editing.
- [x] Implement approved compliance page/copy updates.
- [x] Verify routes/build and summarize resubmission steps.

### Working Notes
- Twilio rejection reasons: 30484, 30485, 30491, 30513.
- Compliance routes are public and return `200`: `/privacy`, `/terms`, `/sms-consent`.
- Homepage footer now links to `/`, `/sms-consent`, `/privacy`, and `/terms`.
- Public copy now states sole proprietor operation, optional SMS enrollment, and explicit HELP/STOP wording.

## Review Task (2026-03-05)

### Goal
Review PR #72 (`feature/popular-dates-grid`) for correctness, regression risk, and test coverage gaps before merge.

### Acceptance Criteria
- [x] Identify any behavior regressions or correctness issues in the diff.
- [x] Check affected tests and call out missing regression coverage if needed.
- [x] Summarize findings with file/line references and verification evidence.

### Active Tasks
- [x] Inspect PR metadata and changed files.
- [x] Analyze behavioral changes against existing route/component patterns.
- [x] Review impacted tests or run targeted verification if needed.
- [x] Record findings and verification notes.

### Results
- Reviewed PR #72 (`feature/popular-dates-grid`) against `origin/main`.
- Verification in isolated worktree:
  - `npm run typecheck` passed.
  - `npm run test:run` passed (`17` files, `196` tests).
- Finding recorded: collapsed grid now recomputes each voter's `Total` from only `displayedDates`, so users who voted only on hidden dates render as `0` votes even though they participated.

## Coverage Audit (2026-03-06)

### Goal
Assess current automated test coverage from the live Vitest report and identify the most important gaps.

### Acceptance Criteria
- [ ] Run the current coverage suite successfully.
- [ ] Capture top-line statement/branch/function/line coverage numbers.
- [ ] Identify the lowest-coverage production files or directories that materially affect risk.
- [ ] Summarize the verification story and practical next steps.

### Active Tasks
- [x] Review existing testing docs and Vitest coverage configuration.
- [x] Run `npm run test:coverage`.
- [x] Inspect the generated report for the weakest coverage areas.
- [x] Summarize findings and recommended follow-up.

### Working Notes
- `app/TESTING.md` coverage counts are stale; it still documents `98` tests while the last backlog verification recorded `196`.
- Current Vitest coverage excludes `node_modules/`, `test/`, config files, generated `+types`, and `build/`.

### Results
- `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`17` files, `196` tests).
- Current aggregate coverage is low: `15.09%` statements, `10.38%` branches, `6.64%` functions across `68` instrumented files.
- Coverage is concentrated in a few critical backend paths, especially `/Users/jspahr/repo/meatup-club/app/app/routes/api.webhooks.email-rsvp.tsx` (`92.68%` statements) and targeted server helpers under `/Users/jspahr/repo/meatup-club/app/app/lib/`.
- The biggest gaps are untested dashboard routes/components and large server modules: `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`, `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`, and `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`.
- Test count overstates confidence in some areas because `/Users/jspahr/repo/meatup-club/app/test/route-health.test.ts` is mostly export/smoke validation and `/Users/jspahr/repo/meatup-club/app/test/admin-polls-e2e.test.tsx` largely exercises inline test components instead of the real route module.

## Testing Docs Refresh (2026-03-06)

### Goal
Create a concrete coverage-improvement plan, refresh the main testing guide to match the current repo state, and codify durable testing standards in the repository instructions.

### Acceptance Criteria
- [ ] `app/TESTING.md` reflects the current test suite, current coverage baseline, and a prioritized improvement plan.
- [ ] `AGENTS.md` includes explicit testing standards for new behavior changes, regression coverage, and acceptable test shapes.
- [ ] Documentation is internally consistent with the current Vitest setup and current suite count.
- [ ] Verification includes reviewing the edited docs for correctness and repo alignment.

### Active Tasks
- [x] Review current `AGENTS.md` and `app/TESTING.md`.
- [x] Design the updated testing guidance and coverage roadmap.
- [x] Update `app/TESTING.md`.
- [x] Update `AGENTS.md`.
- [x] Verify final docs for clarity and consistency.

### Working Notes
- Current live baseline from `npm run test:coverage`: `196` tests, `15.09%` statements, `10.38%` branches, `6.64%` functions.
- Existing `app/TESTING.md` still reports `98` tests and does not distinguish smoke/import checks from true behavioral coverage.
- The highest-value missing coverage areas are dashboard admin/event flows and larger server modules (`email.server.ts`, `sms.server.ts`).

### Results
- Rewrote `/Users/jspahr/repo/meatup-club/app/TESTING.md` to reflect the live `2026-03-06` baseline, current test commands, interpretation of the existing suite, and a phased coverage-improvement roadmap.
- Added explicit testing standards to `/Users/jspahr/repo/meatup-club/AGENTS.md`, including regression-test requirements, route/component test expectations, and limits of smoke coverage.
- Verification performed:
  - Reviewed the edited docs against the live Vitest config and the current coverage run.
  - Confirmed `app/TESTING.md` now matches the current suite size (`196` tests in `17` files) and the live coverage metrics.

## Testing Plan Implementation (2026-03-06)

### Goal
Implement the first high-value slice of the coverage improvement plan by adding real tests around the lowest-covered, highest-risk server logic and a key dashboard action module.

### Acceptance Criteria
- [ ] Add new behavioral tests for advanced email notification flows in `app/app/lib/email.server.ts`.
- [ ] Add new behavioral tests for SMS delivery/reminder flows in `app/app/lib/sms.server.ts`.
- [ ] Add real action tests for date-related branches in `app/app/routes/dashboard.polls.tsx`.
- [ ] Verification passes for targeted tests and the full coverage run.
- [ ] Record the new coverage baseline and notable improvements.

### Active Tasks
- [x] Inspect target modules and current test patterns.
- [x] Add tests for `email.server.ts`.
- [x] Add tests for `sms.server.ts`.
- [x] Add tests for `dashboard.polls.tsx`.
- [x] Run verification and summarize coverage changes.

### Working Notes
- This pass targets the highest-value subset of Priority 0 work rather than the entire roadmap.
- `email.server.ts` already has baseline tests for invite/comment sends, so advanced invite-update-cancellation flows are the easiest missing slice to cover next.
- `sms.server.ts` has very limited coverage today and can gain quickly from send/reminder/signature tests without UI setup.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.notifications.test.ts` with coverage for RSVP override emails, event invites, calendar updates, event updates, and event cancellations.
- Expanded `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.test.ts` to cover reminder message formatting, Twilio send behavior, signature verification, XML responses, scheduled reminders, and adhoc reminder scopes.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.date-actions.test.ts` with real action tests for date suggestion, voting, deletion, and active-poll validation.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.test.ts` with action coverage for event creation and RSVP override notification flows.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/email.server.notifications.test.ts app/lib/sms.server.test.ts app/routes/dashboard.polls.date-actions.test.ts` passed (`34` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.admin.events.test.ts` passed (`6` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`20` files, `229` tests).
- Coverage improvements from the prior `2026-03-06` baseline:
  - Overall statements: `15.09%` -> `26.59%`
  - Overall branches: `10.38%` -> `16.63%`
  - Overall functions: `6.64%` -> `14.13%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/email.server.ts`: `29.38%` -> `90.62%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/sms.server.ts`: `20.69%` -> `88.27%`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`: `10.81%` -> `24.32%`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`: `0%` -> `22.64%`

## Coverage Follow-On (2026-03-06)

### Goal
Extend the coverage plan into poll/date UI behavior and the poll API route, then record the updated baseline.

### Acceptance Criteria
- [x] Add behavioral tests for the date-calendar and doodle components.
- [x] Add real action tests for `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.dates.tsx`.
- [x] Add real loader/action tests for `/Users/jspahr/repo/meatup-club/app/app/routes/api.polls.tsx`.
- [x] Verify targeted suites, typecheck, and a fresh coverage run.
- [x] Record the latest coverage movement and remaining gaps.

### Working Notes
- `DateCalendar` needs both a fixed system clock and explicit `dateUtils` control in tests because render month comes from `new Date()` while disabled states are applied after hydration.
- `DoodleView` is a good high-yield target because it is pure client-side transformation once mounted.
- `api.polls.tsx` had only a security check before this pass, despite owning poll creation and closure.

## Production Photo Investigation (2026-03-07)

### Goal
Identify why restaurant photos are still broken on production after the URL-normalization fix and successful deploy.

### Acceptance Criteria
- [ ] Capture at least one live `/api/places/photo` production request from an authenticated page load.
- [ ] Identify whether the failure is auth/session, route validation, upstream Google photo fetch, or stale reference refresh.
- [ ] Apply the smallest safe fix with regression coverage if code changes are needed.
- [ ] Verify the fix through targeted tests and a production deploy observation.

### Active Tasks
- [x] Confirm the normalization fix is merged and deployed on `main`.
- [x] Inspect production restaurant `photo_url` data in remote D1.
- [x] Confirm Cloudflare worker tailing is functional.
- [ ] Capture failing production photo requests from a live `/dashboard/polls` refresh.
- [ ] Implement the minimal fix or instrumentation based on the captured failure.
- [ ] Run targeted verification and summarize the production outcome.

### Working Notes
- Production D1 rows now contain either local `/api/places/photo?...` URLs or legacy absolute `https://meatup.club/api/places/photo?...` URLs that should normalize to the local path in the loader.
- All sampled production rows with `photo_url` also have `google_place_id`, so stale-photo recovery should be available.
- Worker tailing is confirmed functional from a controlled `HEAD https://meatup.club/` request.
- The remaining highest-probability failure path is the live `/api/places/photo` request itself rather than page-side URL generation.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/app/components/DateCalendar.test.tsx` for current-month clicks, previous-month mapping, disabled past dates, and interactive past-vote states.
- Added `/Users/jspahr/repo/meatup-club/app/app/components/DoodleView.test.tsx` for past-date filtering, current-user labeling, recalculated vote totals, and empty-state rendering.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.dates.actions.test.ts` for suggest, vote, delete, duplicate, and active-poll guard flows.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/api.polls.test.ts` for loader, create, close validation, transactional event creation, rollback, and conflict paths.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/components/DateCalendar.test.tsx app/components/DoodleView.test.tsx app/routes/dashboard.dates.actions.test.ts` passed (`13` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/api.polls.test.ts app/routes/api.polls.security.test.ts` passed (`10` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`26` files, `267` tests).
- Coverage improvements from the prior committed baseline:
  - Overall statements: `30.21%` -> `37.77%`
  - Overall branches: `18.69%` -> `26.74%`
  - Overall functions: `14.56%` -> `19.70%`
  - `/Users/jspahr/repo/meatup-club/app/app/components/DateCalendar.tsx`: `0%` -> `82.41%`

## Ad Hoc Events (2026-03-07)

### Goal
Implement a member-facing ad hoc event flow so any active member can create an event without poll voting. The creator chooses the restaurant and date, can edit the event later, and admins can edit any event.

### Acceptance Criteria
- [x] Add event ownership so creator-based edit permissions are enforceable.
- [x] Let active members create and edit ad hoc events from `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx`.
- [x] Use Google Places search for the ad hoc event restaurant selection without adding the place to the canonical poll restaurant list.
- [x] Preserve admin edit/control surfaces and keep poll-created events compatible with the new ownership model.
- [x] Add regression coverage and verify with typecheck, tests, and build.

### Active Tasks
- [x] Add `events.created_by` to schema/migration and backfill existing poll-created events where possible.
- [x] Extract shared event validation, create/update, and permission helpers.
- [x] Add shared event notification helpers for invite/update fan-out.
- [x] Rework `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx` loader/action/UI for member create/edit plus existing RSVP behavior.
- [x] Update admin and poll-created event paths to set `created_by`.
- [x] Add route tests for member create/edit permissions and legacy admin edits.
- [x] Run verification and record outcomes.

### Working Notes
- Ad hoc event restaurants now come from Google Places search on the event form; they are stored directly on `events` and are not inserted into the canonical `restaurants` table.
- Creator edit permission is `event.created_by === user.id`; admins continue to edit any event.
- Legacy events with `created_by = NULL` remain admin-editable but are not editable by non-admin members.
- Member-facing scope stayed intentionally narrow: create/edit plus optional invite/update sends. Delete, cancellation, SMS reminders, and RSVP overrides remain on the admin page.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/migrations/20260307_add_event_created_by.sql` and updated `/Users/jspahr/repo/meatup-club/schema.sql` so `events` now stores nullable ownership with a poll-based backfill.
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/events.server.ts` for shared event parsing, permission checks, inserts, and updates.
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/event-notifications.server.ts` to centralize invite/update/cancellation fan-out to active members.
- Added `/Users/jspahr/repo/meatup-club/app/app/components/EventRestaurantFields.tsx` and updated `/Users/jspahr/repo/meatup-club/app/app/components/RestaurantAutocomplete.tsx` so the member ad hoc event form uses Google Places-backed selection.
- Reworked `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.tsx` to support member create/edit actions, creator/admin edit permissions, and the existing RSVP flow.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.events.tsx`, `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.admin.polls.tsx`, and `/Users/jspahr/repo/meatup-club/app/app/routes/api.polls.tsx` to use shared event creation/update behavior and persist `created_by`.
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.events.test.ts` and updated existing event/poll route tests for the new ownership-aware insert shape.

### Verification
- [x] `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck`
- [x] `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.events.test.ts app/routes/dashboard.admin.events.test.ts app/routes/api.polls.test.ts`
- [x] `cd /Users/jspahr/repo/meatup-club/app && npm run test:run`
- [x] `cd /Users/jspahr/repo/meatup-club/app && npm run build`
- Final verification status:
  - `npm run typecheck` passed.
  - `npm run test:run` passed (`32` files, `305` tests).
  - `npm run build` passed for client, SSR, and worker bundles.

## Restaurant Photo Bugfix (2026-03-06)

### Goal
Fix broken restaurant images on the active poll page when stored `photo_url` values still use legacy Google Places media URLs.

### Acceptance Criteria
- [x] Restaurant cards on `/dashboard/polls` render working proxied image URLs for legacy Google Places media links.
- [x] `/dashboard/restaurants` continues to normalize the same legacy URLs via the shared normalizer.
- [x] Regression coverage proves the polls loader rewrites legacy Google Places photo URLs through `/api/places/photo`.
- [x] Verification passes for the targeted route tests and `npm run typecheck`.

### Active Tasks
- [x] Restate goal + acceptance criteria
- [x] Locate existing implementation / patterns
- [x] Design: minimal approach + key decisions
- [x] Implement smallest safe slice
- [x] Add/adjust tests
- [x] Run verification (lint/tests/build/manual repro)
- [x] Summarize changes + verification story
- [x] Record lessons (if any)

### Working Notes
- The restaurants page already rewrites `https://places.googleapis.com/v1/.../media?...` URLs to `/api/places/photo?...`.
- The polls page currently rendered `photo_url` values directly, so older saved rows could still point at stale or inaccessible Google media URLs.
- A prior normalization script also stored absolute `https://meatup.club/api/places/photo?...` URLs, which break in local or preview environments unless they are collapsed back to the current app origin.

### Results
- Added a shared normalizer at `/Users/jspahr/repo/meatup-club/app/app/lib/restaurant-photo-url.ts` so both dashboard routes rewrite legacy Google media URLs and absolute app photo-proxy URLs to the local `/api/places/photo?...` path.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx` and `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.restaurants.tsx` to use the shared normalizer in their loaders.
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/restaurant-photo-url.test.ts` and expanded `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.route.test.ts` with regression coverage for both legacy URL shapes.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/lib/restaurant-photo-url.test.ts app/routes/dashboard.polls.route.test.ts` passed (`17` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run` passed (`31` files, `300` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run build` passed (existing Vite dynamic-import warnings unchanged).

## Testing Ideal State Refresh (2026-03-06)

### Goal
Document the ideal long-term testing state for the repo, convert that target into a concrete multi-PR roadmap, and record the standards in the testing guide.

### Acceptance Criteria
- [x] `app/TESTING.md` reflects the current merged coverage baseline rather than the earlier pre-PR baseline.
- [x] `app/TESTING.md` defines the ideal suite state and concrete long-term coverage goals.
- [x] `app/TESTING.md` includes a multi-PR roadmap for the remaining route, helper, component, and workflow gaps.
- [x] The testing standards in `app/TESTING.md` align with the coverage work already landed.

### Active Tasks
- [x] Review the current testing guide and the latest merged coverage report.
- [x] Define the ideal-state standards and long-term coverage targets.
- [x] Replace the older priority plan with a concrete multi-PR roadmap.
- [x] Verify the guide reflects the current merged suite baseline.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/TESTING.md` to reflect the merged post-PR baseline (`267` tests in `26` files; `37.77%` statements, `26.74%` branches, `19.70%` functions).
- Added explicit ideal-state standards covering mutation routes, domain helpers, shared interactive components, workflow tests, and the requirement that no important product file remain at `0%`.
- Added long-term target metrics (`70%+` statements, `60%+` branches globally; `85-95%+` on critical mutation modules).
- Replaced the loose priority list with a concrete multi-PR roadmap spanning poll core logic, member-facing dashboard routes, shared components and places APIs, remaining admin surfaces, workflow tests, and suite governance.

## Roadmap Execution - PR 1 (2026-03-06)

### Goal
Execute the first roadmap tranche by expanding test coverage around poll core route behavior and the helper modules that own restaurant, comment, and poll leader logic.

### Acceptance Criteria
- [x] Add route-level tests for the remaining `dashboard.polls.tsx` restaurant/comment action branches.
- [x] Add direct helper tests for `/Users/jspahr/repo/meatup-club/app/app/lib/restaurants.server.ts`.
- [x] Add direct helper tests for `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.ts`.
- [x] Add direct helper tests for `/Users/jspahr/repo/meatup-club/app/app/lib/polls.server.ts`.
- [x] Verify targeted tests, `npm run typecheck`, and a fresh coverage run.

### Working Notes
- `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx` and `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.ts` already have unrelated local modifications in the worktree, so this slice should stay test-only unless a source change is strictly required to make the behavior testable.
- Existing poll route tests already cover date actions and some security guards, so the biggest missing branches are restaurant actions, comment actions, and the domain helpers behind them.

### Results
- Added `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.route.test.ts` to cover loader enrichment plus restaurant and comment action branches, including reply-notification behavior.
- Added `/Users/jspahr/repo/meatup-club/app/app/lib/restaurants.server.test.ts`, `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.test.ts`, and `/Users/jspahr/repo/meatup-club/app/app/lib/polls.server.test.ts`.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/routes/dashboard.polls.route.test.ts app/lib/restaurants.server.test.ts app/lib/comments.server.test.ts app/lib/polls.server.test.ts` passed (`28` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:coverage` passed (`30` files, `295` tests).
- Coverage improvements from the prior merged baseline:
  - Overall statements: `37.77%` -> `42.55%`
  - Overall branches: `26.74%` -> `31.93%`
  - Overall functions: `19.70%` -> `23.55%`
  - `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx`: `24.32%` -> `63.24%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/comments.server.ts`: `0%` -> `100%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/restaurants.server.ts`: `0%` -> `100%`
  - `/Users/jspahr/repo/meatup-club/app/app/lib/polls.server.ts`: `0%` -> `100%`

## PR Follow-Up - DoodleView Coverage (2026-03-06)

### Goal
Merge PR #72 (`feature/popular-dates-grid`) and open a follow-up PR that adds regression coverage for the collapsed `DoodleView` grid behavior.

### Acceptance Criteria
- [x] PR #72 is merged into `main`.
- [x] A new branch from updated `main` adds component coverage for the default top-date filter, the expand/collapse toggle, and preserved per-user totals when hidden dates exist.
- [x] Verification passes for the new test, `npm run typecheck`, and `npm run test:run`.
- [x] A follow-up PR is opened with the test-only change.

### Active Tasks
- [x] Merge PR #72 on GitHub.
- [x] Create a clean worktree from updated `main`.
- [x] Add `DoodleView` regression tests.
- [x] Run verification.
- [x] Commit with signoff, push, and open the follow-up PR.

### Working Notes
- The root worktree has extensive unrelated local changes, so all git operations for this task should stay in an isolated worktree.
- The follow-up should remain test-only unless the merged `main` branch reveals an additional defect during implementation.

### Results
- Merged PR #72 into `main` on GitHub at `6880aa3b980dcabd1f06f83b32dc27159d860678`.
- Created follow-up branch `codex/doodleview-coverage-pr72` and opened PR #79: https://github.com/jeffspahr/meatup-club/pull/79
- Added regression coverage in `/Users/jspahr/repo/meatup-club/app/app/components/DoodleView.test.tsx` for:
  - default top-two-vote-tier filtering
  - expand/collapse toggle behavior
  - preserved per-user totals when votes exist only on hidden dates
  - no-toggle behavior when all dates already fall within the top two vote tiers
- Verification performed in isolated worktree `/tmp/meatup-doodleview-coverage`:
  - `cd /tmp/meatup-doodleview-coverage/app && npm run test:run -- app/components/DoodleView.test.tsx` passed (`4` tests).
  - `cd /tmp/meatup-doodleview-coverage/app && npm run typecheck` passed.
  - `cd /tmp/meatup-doodleview-coverage/app && npm run test:run` passed (`46` files, `357` tests).

## Feature - Doodle Grid Cell Voting (2026-03-06)

### Goal
Let users toggle their own availability directly from the `DoodleView` grid by clicking cells in their row, including currently empty cells.

### Acceptance Criteria
- [x] Clicking an empty cell in the current user’s row submits a date vote for that suggestion.
- [x] Clicking a checked cell in the current user’s row removes that vote.
- [x] Cells outside the current user’s row remain read-only.
- [x] Automated coverage proves the grid interaction and the route wiring.
- [x] Verification includes the focused test suite and `npm run typecheck`.

### Active Tasks
- [x] Review the current `DoodleView` and `dashboard.polls.tsx` interaction flow.
- [x] Implement current-user cell toggling with the existing date vote action.
- [x] Add regression tests for clickable own-row cells and read-only other rows.
- [x] Run focused verification and record results.

### Working Notes
- The existing `vote_date` action already supports add/remove semantics, so the client change should stay local to the grid and route submit handler.
- Grid interaction should stay vote-only; it should not delete the underlying date suggestion when the current user owns the date.

### Results
- Updated `/Users/jspahr/repo/meatup-club/app/app/components/DoodleView.tsx` so only the current user’s row renders clickable cell buttons; empty cells add a vote and checked cells remove it.
- Updated `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.tsx` to submit grid toggles through the existing `vote_date` action via a shared `buildDateVoteFormData` helper.
- Expanded `/Users/jspahr/repo/meatup-club/app/app/components/DoodleView.test.tsx` with regression coverage for own-row cell toggling and read-only other-user rows.
- Expanded `/Users/jspahr/repo/meatup-club/app/app/routes/dashboard.polls.route.test.ts` with coverage for the grid vote submission payload.
- Verification performed:
  - `cd /Users/jspahr/repo/meatup-club/app && npm run test:run -- app/components/DoodleView.test.tsx app/routes/dashboard.polls.route.test.ts` passed (`17` tests).
  - `cd /Users/jspahr/repo/meatup-club/app && npm run typecheck` passed.

## PR Conflict Resolution - PR #82 (2026-03-06)

### Goal
Resolve merge conflicts on `codex/root-worktree-wip` so PR #82 can merge cleanly into `main`.

### Acceptance Criteria
- [ ] Confirm the current conflict set for PR #82 against `main`.
- [ ] Resolve conflicts in an isolated worktree without disturbing unrelated local changes in the root worktree.
- [ ] Preserve the intended behavior from the branch, including the availability-grid vote toggle.
- [ ] Verification passes on the merged branch state.
- [ ] Push the updated branch and confirm PR #82 is mergeable.

### Active Tasks
- [ ] Inspect PR mergeability and conflicting files.
- [ ] Create an isolated worktree for `codex/root-worktree-wip` and merge `origin/main`.
- [ ] Resolve conflicts with the smallest safe diff.
- [ ] Run verification on the resolved branch.
- [ ] Push and confirm updated PR status.

### Working Notes
- The root worktree is already dirty with unrelated changes, so conflict resolution should happen in a temporary worktree.
- Prefer a merge from `origin/main` into the PR branch over rebasing in the shared root worktree to reduce risk to local state.
