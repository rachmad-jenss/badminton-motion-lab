# Plan 011: Make pairing errors recoverable and accessible

> **Executor instructions**: This plan changes only the web pairing UX. Do not
> change token generation, persistence, or the `/pair` backend endpoint.
>
> **Drift check**: `git diff --stat 6730f6e..HEAD -- apps/web/src/app/agent/page.tsx apps/web/src/lib/agent.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plan 010
- **Category**: bug | dx
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

`pair()` currently has no error boundary. `agentPost()` throws the raw response
body, while the UI only displays a success alert. Invalid, expired, or reused
codes therefore leave users without an inline recovery path.

## Current state

- `apps/web/src/app/agent/page.tsx:30-42` calls `/pair`, stores the token, and
  alerts only on success; there is no `try/catch` or busy state.
- `apps/web/src/lib/agent.ts:57-65` throws `await res.text()` for every failed
  POST.
- `apps/web/src/app/agent/page.tsx:95-103` exposes Pair and Refresh buttons but
  does not announce status changes to assistive technology.

## Scope

**In scope**: pairing loading state, structured user-safe error extraction,
inline success/error status, retry/refresh guidance, and `aria-live` behavior.

**Out of scope**: authentication protocol, token lifetime, pairing-code
security, backend response changes, and installer UX.

## Steps

### Step 1: Add safe request-error mapping

Create a small client-side helper that converts JSON or text HTTP failures into
short user-facing messages. Preserve the status code for diagnostics but do not
render arbitrary raw response bodies as the primary message.

**Verify**: add pure tests for JSON detail, plain text, and network failure;
the selected web test command passes.

### Step 2: Guard the pair action

Wrap `pair()` in `try/catch/finally`, disable duplicate submissions while it is
busy, clear stale error text before retry, and provide explicit instructions for
expired/reused codes to refresh health. Keep the successful token storage
behavior unchanged.

**Verify**: invalid code shows inline error and leaves the page usable; valid
pair shows success without an alert; `npm.cmd run lint -w @bml/web` -> exit 0.

### Step 3: Announce state changes

Use a semantic status region (`role="status"` for progress/success and
`role="alert"` for errors) with stable labels. Do not put the full health
payload or bearer token in that region.

**Verify**: browser snapshot contains the accessible status text after failed
and successful pairing; no console error occurs.

## Done criteria

- [ ] Pairing failures never become unhandled UI errors.
- [ ] Pairing button cannot submit twice while pending.
- [ ] Expired/reused-code recovery is visible.
- [ ] Success and failure are announced without relying on `alert()`.
- [ ] No secret value is rendered in the status message.

## STOP conditions

- The backend returns a new error shape that cannot be mapped without changing
  the API contract.
- A test requires a real token or credential.

## Maintenance notes

Keep error mapping shared with Analyze and BYOK actions so future agent errors
do not regress into raw response text or unhandled promises.
