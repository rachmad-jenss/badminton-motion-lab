# Plan 009: Close all audited findings and move trusted CI to a Windows self-hosted runner

> **Executor instructions**: Execute the slices in order. Keep each slice in a
> separate atomic commit and run its verification before starting the next one.
> Never put runner registration tokens, API keys, or other credentials in the
> repository. The repository is public, so the persistent runner may execute
> only trusted same-repository branches and `main`; fork pull requests must not
> execute arbitrary checkout code on it.

## Status

- **Priority**: P1
- **Effort**: L (multi-slice delivery)
- **Risk**: HIGH (security, CI infrastructure, and CV pipeline changes)
- **Depends on**: existing plans 001-008 are marked DONE; re-verify their seams rather than reimplementing them
- **Category**: security | validation | correctness | performance | tests | dx | migration
- **Planned at**: commit `db75954`, 2026-07-26

## Why this matters

The current repository can report successful GitHub Actions while its public
readiness gate still has 12 locked modules. The benchmark fixture is a walking
person without badminton stroke truth, `/pair` mints tokens without proving a
pairing secret, BYOK encryption stores its key beside its ciphertext, and full
video analysis retains every decoded frame in memory. This plan closes those
trust, security, reliability, and release gaps while moving trusted CI work to
the requested Windows self-hosted runner.

## Current state and constraints

- `.github/workflows/ci.yml:40-62` runs on `windows-latest`, but the repository
  currently has zero registered self-hosted runners.
- `scripts/run-fixture-benchmarks.mjs:158-199` analyzes only three module IDs,
  hardcodes `fixturePassRate: 1`, and treats missing contact truth as zero
  error. `validation/fixtures/person_1280x720_30fps.truth.json` explicitly says
  the fixture is a walking-person capture, not badminton stroke truth.
- `scripts/check-public-readiness.mjs:17-26` correctly fails with locked
  modules, but the benchmark script exits zero at lines 277-280 and CI never
  invokes the readiness check.
- `apps/agent/main.py:144-155` accepts any pairing code and returns a bearer
  token. `apps/agent/storage/db.py:17-22` stores the token directly, and
  `apps/web/src/lib/agent.ts:17-23` places it in media query strings.
- `apps/agent/adapters/byok.py:22-39` stores a Fernet key in the same secrets
  directory as the encrypted BYOK payload. Windows file mode changes are not an
  account-isolation boundary.
- `apps/agent/adapters/media.py:146-153` returns all decoded frames as a list;
  `apps/agent/main.py:204-223` uses that list for the full analysis by default.
- `apps/agent/adapters/events.py:90-111` appends manual corrections after
  model events, while `apps/agent/adapters/metrics_engine.py:43-48` selects the
  first matching event. Manual contact corrections therefore do not drive
  metrics.
- `apps/agent/adapters/racket.py:12-17` and
  `apps/agent/adapters/metrics_engine.py:58-60` prefer the right arm even for
  left-handed athletes. The Supabase schema has `dominant_hand`, but the local
  analysis request does not carry it.
- `infra/windows/package-agent.cmd` is a placeholder and
  `infra/windows/install-agent.ps1` does not install FFmpeg or the pose model;
  `apps/agent/adapters/pose.py:37-42` fails when the model is absent.
- Agent tests cover only security/path behavior and a smoke path; the web app
  has no behavioral test runner. Existing repository conventions are small
  Python functions, FastAPI `TestClient`, TypeScript compilation, and explicit
  JSON benchmark reports. Preserve the local-first ADRs: original video stays
  local and cloud stores metadata/summaries only.

## Required verification commands

| Purpose | Command | Expected result |
|---|---|---|
| Web typecheck | `npm.cmd run lint -w @bml/web` | exit 0 |
| Contracts typecheck | `npm.cmd run test -w @bml/contracts` | exit 0 |
| Full local verification | `npm.cmd run verify` | exit 0 after agent dependencies/model are available |
| Agent tests | `python -m pytest apps/agent -q` | all tests pass |
| Readiness | `npm.cmd run readiness:check` | exit 0 only when every module has a valid passing report |
| No synthetic reports | `node scripts/check-no-synthetic-reports.mjs` | exit 0 |
| Browser smoke | Playwright CLI against `http://localhost:3001` | all named navigation and offline/online states render without application errors |
| Git diff hygiene | `git diff --check` | no whitespace errors |
| Remote CI | `gh run view <run-id> --json status,conclusion,jobs,url` | terminal `success` for every required check |

## Scope

### In scope

- `.github/workflows/ci.yml` and a runner setup/runbook under `docs/`.
- `plans/README.md` and this plan.
- `scripts/check-public-readiness.mjs` and
  `scripts/run-fixture-benchmarks.mjs`.
- `validation/benchmark-configs/`, `validation/fixtures/`, and
  `validation/reports/` only as required to make benchmark provenance honest.
- `apps/agent/main.py`, `apps/agent/storage/db.py`, and agent adapters/tests.
- `apps/web/src/lib/agent.ts`, relevant pages, and web behavior tests.
- `infra/windows/` installer/packaging scripts.
- `packages/contracts/` and `supabase/seed.sql` where version/readiness
  contracts are currently inconsistent.

### Out of scope

- Match Intelligence, multi-camera/3D, or coach workspace; the README
  explicitly excludes these from launch scope.
- Uploading original video or storing dense pose/racket/shuttle time series in
  Supabase.
- Publishing secrets, runner tokens, or machine-specific credentials.
- Running fork PR code on the persistent self-hosted runner.

## Implementation slices and atomic commits

### Slice 1: Add the trusted self-hosted runner contract and enforce readiness

1. Add a dedicated runner label such as `bml-windows` to the workflow and use
   `runs-on: [self-hosted, Windows, X64, bml-windows]` only for pushes to
   `main` and trusted same-repository pull requests. Add an explicit condition
   that skips fork pull requests rather than checking out and executing their
   code on the persistent runner.
2. Keep the workflow's dependency setup deterministic: Node 20, Python 3.12,
   FFmpeg, npm install, agent dependencies, pose model presence, full verify,
   benchmark, then `npm.cmd run readiness:check`.
3. Make incomplete benchmark output fail the release workflow while retaining
   a useful non-release benchmark mode for local investigation. Ensure the
   report and seed status are derived from the same module inventory.
4. Add a short Windows runner runbook covering the repository runner label,
   service/interactive startup, update policy, cleanup, and the public-repo
   trust boundary. Do not document or store a live registration token.

**Verify**: static YAML review; `node scripts/check-public-readiness.mjs` fails
on the current locked seed; after a real runner is registered, the workflow
must execute on the `bml-windows` label and fail if readiness remains locked.

**Commit**: `ci: use trusted Windows runner and enforce readiness`

### Slice 2: Establish behavioral test coverage before risky fixes

1. Add focused agent tests for manual event precedence, invalid/degenerate
   court corners, dominant-hand selection, bounded request parameters, and
   credential lifecycle behavior. Use in-memory pose/track fixtures for logic;
   do not use them to manufacture readiness reports.
2. Add web tests or a deterministic browser smoke script for navigation,
   offline agent state, readiness display, pairing error states, and successful
   analyze response rendering using a controlled local stub only where the
   browser flow cannot use the real agent.
3. Keep `npm.cmd run lint -w @bml/web` as the typecheck gate until an actual
   ESLint toolchain is deliberately introduced; do not claim it is lint.

**Verify**: `python -m pytest apps/agent -q`, the web test command selected by
the existing package tooling, and the Playwright CLI smoke path all pass.

**Commit**: `test: cover agent invariants and web critical paths`

### Slice 3: Make readiness evidence domain-valid

1. Replace the walking-person fixture for technique readiness with labeled,
   stroke-specific badminton fixtures, each with contact/rep truth and the
   required artifact expectations. Keep the existing walking fixture as a
   smoke/quality fixture only.
2. Remove unconditional `fixturePassRate: 1`; calculate it from fixture cases.
   Missing truth must fail or remain locked, never become a zero-error pass.
3. Run each module against its own fixture set. Do not copy one clear-stroke
   measurement into all technique strokes or layers.
4. Make `readiness.seed.json`, reports, and Supabase readiness seed follow one
   source of truth. Remove the all-on seed behavior that contradicts ADR-014.

**Verify**: every passing report references a real module-specific fixture and
non-null required truth; incomplete fixtures remain locked; `npm.cmd run
readiness:check` fails honestly until all launch modules truly pass.

**Commit**: `validation: require domain-specific module evidence`

### Slice 4: Harden pairing, tokens, and BYOK

1. Add a one-time, expiring pairing secret generated through a trusted local or
   control-plane path. Hash pairing secrets and bearer tokens at rest; consume
   the pairing secret exactly once; add rate limiting and explicit revocation.
2. Add expiry/revocation checks to every protected agent route. Replace
   long-lived raw query bearer tokens with a scoped short-lived media capability
   or another browser-compatible mechanism that does not expose the primary
   token in the URL.
3. Replace the co-located Fernet key with Windows DPAPI/Credential Manager or
   another OS-bound secret store. Migrate legacy files safely and invalidate
   plaintext legacy material after successful migration.
4. Return only non-sensitive pairing/health details and add tests for empty,
   invalid, expired, reused, revoked, and cross-device credentials.

**Verify**: unauthenticated protected routes return 401; arbitrary pairing
codes do not mint tokens; valid pairing works once; expired/revoked tokens fail;
BYOK remains unreadable outside the Windows user protection boundary; no token
appears in returned media URLs.

**Commit**: `security: harden agent pairing and local secrets`

### Slice 5: Correct event and athlete semantics

1. Normalize events by repetition and type, giving manual/corrected events
   precedence over model proposals. Ensure metrics, findings, and evidence
   frame indices all use the selected event.
2. Carry `dominant_hand` from athlete/session/capture configuration into the
   local analysis request and consistently select the corresponding wrist and
   elbow. Define and test the explicit unknown-hand fallback.
3. Validate manual event frame/time bounds and court corner shape before the CV
   pipeline starts. Reject non-finite, out-of-frame, duplicate, collinear, or
   self-intersecting corner sets instead of marking them valid.

**Verify**: corrected contact frame drives metric evidence; left- and
right-handed fixtures select the expected arm; invalid input returns a clear
4xx response; valid court calibration still produces a usable homography.

**Commit**: `fix: honor corrected events and athlete handedness`

### Slice 6: Bound analysis work and history growth

1. Add a bounded analysis policy: frame/duration limits, validated stride,
   request concurrency control, explicit job status, and cancellation/error
   persistence. Preserve the existing `asyncio.to_thread` behavior while
   preventing unbounded simultaneous full-video work.
2. Replace whole-video frame retention with bounded windows or a streaming
   iterator where each detector can consume frames without retaining the full
   capture. Keep package artifacts deterministic and hashable.
3. Add pagination or a bounded range to runs and metric history, a single
   multi-metric history endpoint for Compare, and explicit local package/capture
   retention or deletion behavior.

**Verify**: invalid limits return 4xx; concurrent analyses are bounded; a long
capture does not allocate one full decoded-frame list; Compare makes one
bounded request and history remains responsive with seeded run records.

**Commit**: `perf: bound analysis resources and local history`

### Slice 7: Make Windows onboarding runnable

1. Update the installer to check/install or clearly require FFmpeg, create the
   model directory, obtain the pinned pose model through a checksum-verified
   download, and fail with actionable diagnostics.
2. Replace the packaging placeholder with a reproducible package path or
   explicitly make the installer the supported distributable and test it from a
   clean Windows environment.
3. Add a health/readiness diagnostic that distinguishes liveness, FFmpeg,
   pose-model, writable-data, and dependency failures without exposing secrets.

**Verify**: a clean-machine installation reaches healthy agent state and the
   real fixture smoke path; missing prerequisites produce actionable failures;
   no packaging checklist passes merely because a placeholder file exists.

**Commit**: `release: make Windows agent installation actionable`

### Slice 8: Align contracts and close out the release gate

1. Centralize agent/package/benchmark pipeline versioning and make reports,
   manifests, and TypeScript contracts agree.
2. Strengthen runtime manifest validation so required timestamps, source media,
   steps, and artifact hashes cannot silently drift from the shared contract.
3. Add a final release command that runs typechecks, agent tests, web/browser
   smoke, benchmark/readiness, diff checks, and emits a concise evidence report.

**Verify**: one command exits non-zero on any missing gate; generated manifests
validate against the shared schema; `git diff --check` passes; no stale
all-on/locked state can be reported as release-ready.

**Commit**: `chore: align contracts and release verification`

## Self-hosted runner setup

This repository is public. GitHub documents that persistent self-hosted runners
can be compromised by untrusted fork pull requests, so the runner must be
repository-scoped, label-restricted, kept free of unrelated credentials, and
used only by the trusted workflow condition in Slice 1.

Register the runner only after the workflow slice exists:

1. Generate a short-lived repository registration token with the authenticated
   GitHub CLI/API. Never write it to a tracked file or shell history.
2. Install the official Windows x64 runner in a dedicated machine directory
   outside the repository, for example `%USERPROFILE%\\actions-runner\\bml`.
3. Configure the runner with repository URL, a unique name, labels
   `self-hosted,Windows,X64,bml-windows`, and an isolated work directory.
4. Run it as a Windows service only if the machine policy permits; otherwise
   use an explicit hidden process and document the startup/stop command.
5. Confirm GitHub reports the runner `online` and run a harmless workflow probe
   before sending the full CI job to it.
6. After merge, verify `main` executes on the runner and that no fork PR can
   select it. Remove the runner registration and local work directory when the
   user asks to retire it.

## Browser verification

Use the Playwright CLI against the local app on port 3001 after the web server
starts. Visit `/`, `/capture-guide`, `/agent`, `/analyze`, and `/compare`; take
a fresh snapshot after every navigation. Confirm the module readiness badge,
offline agent notices, navigation links, form labels, and empty/error states.
When the real agent is available, pair and exercise the real analyze/review
flow with the fixture; never put a real API key into browser automation.

## Git and PR workflow

- Keep the branch `jenss-improve-all-findings-self-hosted-runner` until merge.
- Create one atomic commit per slice above; stage explicit paths only.
- Push the branch and open a PR targeting `main`.
- Resolve every actionable review thread. Reply only when the change or a
  clear explanation addresses the comment, then verify the thread is resolved.
- Poll all PR checks with `gh pr checks` and inspect failed Actions logs with
  `gh run view --log-failed`; do not stop at local green.
- Merge only after required checks and review threads are green/resolved.
- Poll the resulting `main` run to terminal success.
- Delete the merged remote branch and local branch only after confirming the
  merge commit and that no unmerged work remains.

## STOP conditions

- GitHub refuses runner registration, the runner is not `online`, or the
  workflow would execute untrusted fork code on the persistent machine.
- A change requires storing a secret in the repository or exposing one in logs.
- The actual code has drifted from the current-state evidence enough that a
  slice would need a different design; update this plan before improvising.
- Any security or data-integrity test remains failing after two focused repair
  attempts.
- Required GitHub permissions, review resolution, or merge protection blocks
  the requested operation; report the exact blocker rather than bypassing it.

## Done criteria

- [ ] All eight slices have separate atomic commits and focused verification.
- [ ] The trusted Windows runner is registered, online, labeled, and executes
      the workflow without running fork PR code.
- [ ] Local typecheck, agent tests, full verification, browser smoke, and
      readiness checks pass.
- [ ] The PR has no unresolved actionable review comments.
- [ ] All required PR checks and the post-merge `main` run are green.
- [ ] The merged branch and obsolete remote/local branches are cleaned up.
- [ ] `plans/README.md` records final statuses and any deferred risk.

## Maintenance notes

- Keep the self-hosted runner isolated and patched; GitHub may stop queueing
  jobs when the runner software is stale.
- Any future workflow that checks out fork code must remain off this runner.
- Any new metric must define its evidence, fail-safe behavior, fixture truth,
  unit, and version before being eligible for readiness.
- Resource limits and local retention are part of the product contract, not
  optional operational cleanup.
