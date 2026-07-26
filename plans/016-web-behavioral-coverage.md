# Plan 016: Add browser coverage for the critical UI states

> **Executor instructions**: This plan establishes deterministic browser
> coverage after the UI slices land. Use controlled local stubs for agent
> responses; never use real API keys, bearer tokens, or uploaded personal media.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: Plans 010-015
- **Category**: tests | dx
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

`apps/web/package.json` currently defines `lint` and `test` as TypeScript
no-emit checks, and the web package has no behavioral test files. The findings
are primarily state and interaction defects, so typechecking cannot prevent
regressions in offline, pairing, Analyze, evidence, Compare, and accessibility
flows.

## Current state

- `apps/web/package.json:4-9` has no browser test script.
- `apps/web` contains no test/spec files.
- `plans/009-all-findings-self-hosted-runner.md:135-140` already calls for web
  tests or deterministic browser smoke for navigation, offline state, readiness,
  pairing errors, and analysis response rendering.
- The repository's existing verification commands are `npm.cmd run lint -w
  @bml/web`, `npm.cmd run test -w @bml/contracts`, and `npm.cmd run verify`.

## Scope

**In scope**: deterministic browser smoke coverage for all routes, health
states, pairing success/failure, Analyze lifecycle/error/result, Compare
offline/no-runs/partial data, keyboard focus, and narrow viewport checks.

**Out of scope**: real CV benchmark truth, external network, real credentials,
visual pixel snapshots as the only assertion, and backend test coverage already
owned by Plan 009.

## Steps

### Step 1: Choose the repository-compatible browser runner

Use the existing Playwright CLI workflow unless a test runner is already added
by Plan 009. Add the smallest script/config needed to start the Next app and
route controlled agent requests. Do not add a second browser framework.

**Verify**: one command starts the web app and reaches `/`, `/agent`,
`/analyze`, `/compare`, and `/capture-guide`.

### Step 2: Cover state transitions

Assert user-visible outcomes rather than implementation details: offline CTA,
prerequisite failure, pairing error and retry, Analyze phase/error/result,
withheld metric explanation, evidence interaction, Compare partial failure, and
no-runs state.

**Verify**: browser suite passes with the controlled stub and reports no page
console errors.

### Step 3: Cover accessibility and viewport behavior

Use keyboard traversal to assert visible focus and active navigation. Run the
critical pages at a narrow viewport and assert no body-level horizontal overflow
while allowing contained table scrolling.

**Verify**: browser suite passes at desktop and narrow viewport sizes.

### Step 4: Integrate the gate

Add the browser command to the documented local verification path and Plan 009's
CI/browser smoke job without weakening existing typecheck, agent, readiness, or
no-synthetic-report gates.

**Verify**: `npm.cmd run verify` and the browser smoke command both exit 0.

## Done criteria

- [ ] Critical UI state transitions have deterministic browser coverage.
- [ ] No real secret, external API, or personal media is used.
- [ ] Browser tests fail on console errors and failed navigation.
- [ ] Desktop and narrow viewport checks pass.
- [ ] Existing release gates remain enabled.

## STOP conditions

- Running the browser suite requires a missing toolchain that cannot be
  installed without changing the repository's supported setup.
- A stable test requires real agent credentials or real media.
- Plan 009 already adds a conflicting runner or test command; reconcile rather
  than creating duplicate CI jobs.

## Maintenance notes

Keep browser assertions user-observable and update them when the public route
or health contract changes. Do not replace deterministic state tests with
fragile full-page snapshots.
