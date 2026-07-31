# Plan 024: Turn the Windows agent setup into a beginner launch path

> **Executor instructions**: Improve the existing Windows bootstrap without
> introducing secrets or pretending that a signed MSI exists. Keep the
> foreground agent process visible/controlable when launched by a user.

## Status

- **Status**: DONE
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: dx | docs | direction
- **Planned at**: commit `679a5c1`, 2026-07-31

## Why this matters

The current setup page tells ordinary users to run PowerShell, create a Python
virtual environment, install pip dependencies, and arrange FFmpeg. The repo
has a bootstrap script but no obvious double-click entry point or clear
success/failure handoff to the web app.

## Current state

- `apps/web/src/app/agent/page.tsx:153` describes setup with developer paths.
- `infra/windows/install-agent.ps1:8` requires Python to already be on PATH.
- `infra/windows/install-agent.ps1:16` can install FFmpeg through winget but
  leaves the user to restart/retry when PATH has not refreshed.
- `infra/windows/package-agent.ps1:1` describes a developer bundle; it is not
  a signed installer.
- `README.md:34` starts with npm and Python development commands.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Script syntax | `powershell.exe -NoProfile -Command "Get-Command .\infra\windows\install-agent.ps1"` | script resolves |
| Web typecheck | `npm.cmd run lint` | exit 0 |
| Agent tests | `npm.cmd run test:agent` | all pass |
| Full gate | `npm.cmd run verify` | exit 0 |

## Scope

**In scope**:

- `infra/windows/install-agent.ps1`
- `infra/windows/install-agent.cmd` (create)
- `apps/web/src/app/agent/page.tsx`
- `README.md`
- focused installer/static checks if needed

**Out of scope**:

- Code signing certificates, MSI packaging, auto-update, or release hosting.
- Changing CI's direct Python process startup.
- Hiding an agent process that users need to stop or diagnose.

## Steps

### Step 1: Add a double-click launcher

Create `install-agent.cmd` that invokes the PowerShell installer with
`-NoProfile -ExecutionPolicy Bypass`, preserves the exit code, and prints a
plain-language completion/error message. The script must run from any current
directory by resolving its own directory.

**Verify**: invoke it from a different working directory in a dry/static
check; it resolves the repo-relative installer and never uses a hard-coded
developer machine path.

### Step 2: Harden the bootstrap handoff

Make the PowerShell script emit named stages, check/install Python through the
available Windows package manager when absent, re-resolve executables after
installation, retain the existing FFmpeg/model checksum checks, and explain
exactly how to recover. Add an opt-in launch mode that starts the agent in a
visible console, waits for `/health`, and opens the web setup page only after
health succeeds. Closing the console must stop the owned process.

**Verify**: existing installation logic still reaches the model checksum gate;
static tests assert the command paths and no credentials are embedded. Do not
run the installer in CI or on the developer machine during tests.

### Step 3: Rewrite the setup page and README entry point

Put the double-click path first, explain what the helper app does, and keep
manual Python commands under an advanced details section. The page must make
the next action explicit after health is ready: pair this browser, then choose
a video.

**Verify**: browser snapshot contains the beginner path, manual commands are
secondary, and the existing offline/missing-model/pairing states remain
actionable.

## Done criteria

- [ ] A Windows user has one obvious launcher before manual commands.
- [ ] Missing prerequisites produce recovery instructions, not raw stack text.
- [ ] Agent startup is health-checked before the browser CTA is opened.
- [ ] No signing/release claims are added without actual artifacts.
- [ ] Existing CI and full verification remain green.

## STOP conditions

- Installing a prerequisite requires unapproved system-wide changes beyond the
  existing winget behavior; stop and report.
- The launcher cannot prove which process it owns; do not add blind process
  termination.
- The repository has no safe way to open the web app; keep the CTA opt-in.

## Maintenance notes

When a real signed installer is introduced, make this bootstrap a development
fallback and update the page to prefer the signed artifact. Keep model
checksum verification mandatory.
