# Plan 063: Make pairing-code transfer and expiry explicit

> **Executor instructions**: Improve only the browser-to-local-agent pairing
> interaction. Reuse the existing health contract; do not log, persist, or
> expose bearer tokens. Pairing code display, clipboard status, and expiry
> feedback must remain local to the setup page.
>
> **Drift check (run first)**: `git diff --stat bd0de95..HEAD -- apps/web/src/app/agent/page.tsx apps/web/src/lib/agent.ts apps/web/tests/ui.spec.ts apps/agent/main.py`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/062-guided-local-connection-funnel.md
- **Category**: dx
- **Planned at**: commit `bd0de95`, 2026-10-04

## Why this matters

The agent already exposes a short-lived pairing challenge and its expiry, but
the setup page treats the challenge as an ordinary editable text field. A
beginner must notice the code, manually select/copy it, guess when it expired,
and know that “Refresh health” is the recovery action. When the code expires,
the current UI only explains the failure after a 401 response.

Make the transfer step explicit: show a read-only code, a keyboard-accessible
copy action, remaining validity, and a clear refresh action. This uses existing
contracts and reduces failed pair attempts without changing authentication.

## Current state

- `apps/agent/main.py:79` sets the default pairing TTL to five minutes.
- `apps/agent/main.py:324-338` returns `pairingCode` and
  `pairingExpiresAt` from the public health endpoint; after expiry the code is
  `null`.
- `apps/agent/main.py:342-350` rejects an empty or expired challenge with a
  safe 401 response that tells the caller to refresh health.
- `apps/web/src/lib/agent.ts:29-40` already types both health fields.
- `apps/web/src/app/agent/page.tsx:32-36` copies the health code into state,
  while `agent/page.tsx:235-249` renders an editable input and a button named
  “Refresh health”; there is no expiry display, `readOnly` state, copy action,
  or code-specific help text.
- `apps/web/tests/ui.spec.ts:90-98,209-220` covers a pairing failure and code
  reset after changing the URL, but not successful code transfer, clipboard
  feedback, or expiry.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck/lint | `npm.cmd run lint` | exit 0, no TypeScript errors |
| Browser behavior | `npm.cmd run test:web` | all Playwright tests pass |
| Repository typecheck | `npm.cmd run typecheck` | contracts and web checks exit 0 |

## Scope

**In scope**:

- `apps/web/src/app/agent/page.tsx`
- `apps/web/src/lib/agent.ts` only if a small pure expiry formatter is useful
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- Changing pairing TTLs, token TTLs, challenge rotation, or backend auth.
- Putting the pairing code in a URL, analytics event, log, or long-term storage.
- Replacing the native input/button with a custom clipboard widget or adding a
  UI library.
- The broader Home/Analyze funnel handled by Plan 062.

## Steps

### Step 1: Present the code as a transfer step

Keep the visible label, but make the challenge field read-only and explain that
it is a one-time code from the Local Agent on this PC. Add a native “Copy code”
button with a status message for success/failure. Use the Clipboard API when
available and provide a safe manual-copy fallback; never put the code in an
error message or URL. Preserve keyboard focus and the existing visible focus
ring.

**Verify**: the code is not editable, the button has a visible accessible name,
keyboard activation works, and clipboard failure leaves a manual-copy path.

### Step 2: Surface expiry and refresh behavior

Use `pairingExpiresAt` to show a short remaining-time message. Update it with a
cleaned-up timer only while the setup page is mounted. When the challenge has
expired, disable pairing, clear or mark the stale code, and show “Get a new
pairing code” as the recovery action. Rename the health refresh control or add
a pairing-specific label so the user does not need to understand “health”.

**Verify**: a mocked future expiry counts down, an expired challenge cannot be
submitted, refreshing health restores the current code, and no timer remains
after unmount.

### Step 3: Keep success and retry paths explicit

After a successful pair, keep the existing URL-scoped token behavior and show
one clear next action to Analyze. After a 401, preserve the setup form and
offer refresh/retry without claiming the agent is offline. Do not display the
bearer token returned by `/pair`.

**Verify**: Playwright covers success, invalid code, expired code, and retry;
the token is only asserted through the existing local-storage behavior and is
never rendered in page text.

## Test plan

- Extend `mockHealth` in `apps/web/tests/ui.spec.ts` with deterministic
  `pairingExpiresAt` values.
- Add success coverage for the copy status and pair-to-analyze CTA.
- Add expiry coverage that asserts the disabled pair action and refresh path.
- Retain the existing invalid-pairing and URL-change tests.
- Run keyboard-focused assertions for the code field and copy/refresh buttons.

## Done criteria

- [ ] Pairing code is read-only, copyable, and accompanied by plain-language
      instructions.
- [ ] Remaining validity and expiry recovery are visible and tested.
- [ ] Successful pairing has a durable next action, not only a transient toast.
- [ ] No token or code is logged, persisted beyond current UI state, or put in
      a URL.
- [ ] `npm.cmd run test:web`, `npm.cmd run lint`, and
      `npm.cmd run typecheck` pass.

## STOP conditions

- The existing health response cannot provide a reliable expiry timestamp;
  stop and report instead of inventing a countdown.
- Clipboard permission behavior would require storing or transmitting the
  challenge; keep the manual-copy fallback and stop before adding telemetry.
- A backend change appears necessary to distinguish expired from invalid code;
  stop and report the contract gap.

## Maintenance notes

If pairing TTL or challenge rotation changes, keep the UI driven by the health
timestamp and update the expiry test fixtures. The setup page must remain
usable when Clipboard API access is unavailable.
