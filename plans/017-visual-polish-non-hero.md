# Plan 017: Polish non-hero UI to match the home-hero design language

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b3be545..HEAD -- apps/web/src/app apps/web/src/components apps/web/tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (one branch, six atomic commits)
- **Risk**: MED
- **Depends on**: 010–016 DONE (visual shell already at `5768334`)
- **Category**: direction | tech-debt | dx
- **Planned at**: commit `b3be545`, 2026-07-27

## Why this matters

The home hero (`.home-hero`) is the product’s visual language: sparse composition,
display serif headline, muted tag, primary + ghost pill CTAs, and a full-bleed
court backdrop. Every other surface — Labs below the fold, Analyze, Compare,
Local Agent, Capture Guide — still reads as a ruled document or glass-card
catalogue. Locked status badges have no CSS. Tool copy often fails contrast on
the photographic shell. This plan brings non-hero surfaces into the same
language **without changing `.home-hero` content or layout**.

## Current state

Design reference (DO NOT modify structure/copy of this block):

```tsx
// apps/web/src/app/page.tsx — .home-hero only
<header className="hero home-hero">
  <h1 className="brand">Read your game in motion.</h1>
  <p className="tag">…</p>
  <div className="row hero-actions">
    <Link className="d-btn d-btn-primary" href="/analyze">Start an analysis</Link>
    <Link className="d-btn d-btn-ghost" href="/capture-guide">View capture guide</Link>
  </div>
</header>
```

Gaps:

- `apps/web/src/app/globals.css:519-522` — only `.status-badge.on`; no `.locked`.
- `apps/web/src/app/analyze/page.tsx:193`, `compare/page.tsx:103`, `agent/page.tsx:117` apply `locked`.
- Labs: `page.tsx:64-96` + `.module` cards `globals.css:574-610`.
- Tool heroes lack primary+ghost CTA pair; Capture Guide CTAs buried in last panel (`capture-guide/page.tsx:38-46`).
- Agent Install dumps full CLI in `<pre>` (`agent/page.tsx:145-162`).
- Notices stack between hero and Labs (`page.tsx:38-62`).
- Brand lockup `tabIndex={-1}` (`VisualShell.tsx:113`); home keyboard test expects first Tab → nav (`ui.spec.ts:90-94`).
- `.panel` hairline stack (`globals.css:559-572`); muted/tag contrast weak on photo backdrop.
- Working tree may already have nav label `Capture Guide` + matching test assert — keep that; also title-case Capture Guide page `h1`.

Repo conventions:

- DaisyUI prefix `d-` (`d-btn`, `d-badge`, `d-input`).
- Shell tokens: `--token-ink`, `--shell-accent`, `--shell-surface`, `--radius-pill`.
- Commit style (from `git log`): `feat:` / `fix:` / `test:` / `docs:` short why-focused subjects.
- Verification: `npm run lint -w @bml/web`, `npm run test:web -w @bml/web`, root `npm run typecheck` when feasible.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (from repo root; worktree needs this) | exit 0 |
| Lint web | `npm run lint -w @bml/web` | exit 0 |
| Browser UI tests | `npm run test:web -w @bml/web` | all Playwright tests pass |
| Root typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope** (only these):

- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx` — **except** the `.home-hero` header block (lines with `className="hero home-hero"` through its closing `</header>`). Notices, Technique Lab, Footwork Lab are in scope.
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/src/app/compare/page.tsx`
- `apps/web/src/app/agent/page.tsx`
- `apps/web/src/app/capture-guide/page.tsx`
- `apps/web/src/components/VisualShell.tsx`
- `apps/web/src/components/AppNav.tsx` — only if nav label still needs `Capture Guide`
- `apps/web/tests/ui.spec.ts`
- `plans/README.md` (status only — skip if reviewer maintains index)

**Out of scope**:

- `.home-hero` markup, copy, CTAs, or home-hero-specific CSS rules that change the first-viewport poster.
- Backend / Local Agent Python, contracts package API shapes.
- Analyze side-by-side “workspace” layout (deferred).
- New icon libraries, dark-mode redesign, i18n.
- CI workflow YAML.

## Git workflow

- Branch: `advisor/017-visual-polish-non-hero` from current `main` (`b3be545` or newer main).
- **Six atomic commits** (one per step below). Do not squash.
- Do NOT push or open a PR unless the operator instructed it (operator in this run: yes — push after reviewer’s approve path; if you are the executor alone, commit locally and report branch name).
- Message examples to match: `feat: polish visual shell and design tokens`, `fix: resolve UI review findings`.

## Steps

### Step 1: Locked badge styles + brand keyboard access

1. In `globals.css`, after `.status-badge.on`, add `.status-badge.locked` with muted border/ink (distinct from `.on`, readable on light and dark themes). Optionally style bare DaisyUI fallback so locked Lab tiles (`status` from seed = `"locked"`) look intentional.
2. In `VisualShell.tsx`, remove `tabIndex={-1}` from the brand `Link` (keep `aria-label`).
3. Update `apps/web/tests/ui.spec.ts` home Tab assertion: first Tab should focus the brand home link (`getByRole('link', { name: 'Badminton Motion Lab home' })`), not the first nav item. Keep the `:focus-visible` check on that focused control.

**Commit**: `fix: style locked badges and restore brand keyboard focus`

**Verify**: `npm run lint -w @bml/web` → exit 0. Grep: `status-badge.locked` exists in CSS. Grep: `tabIndex={-1}` absent from brand lockup.

### Step 2: Contrast tokens for tool content on photographic shell

1. Strengthen readable text on the shell: increase effective contrast for `.tag`, `.muted`, `label`, and ensure `.notice` / form fields sit on enough surface (glass) that body copy does not disappear into the court photo.
2. Prefer token tweaks / utility classes over per-page one-offs. Do not flatten the backdrop or remove VisualShell imagery.
3. Add a shared class if useful, e.g. `.page-tool` on tool `<main>` elements, with slightly stronger local surfaces — keep home using `.page-home`.

**Commit**: `fix: raise tool-page contrast on photographic shell`

**Verify**: `npm run lint -w @bml/web` → exit 0. No change to `.home-hero` rules that shrink or restyle the poster headline.

### Step 3: Tool-page headers — utility scale + primary/ghost CTAs

Match the home CTA language without using home-hero poster scale for single-word titles.

1. CSS: for `.hero:not(.home-hero)`, reduce brand size to a utility page-title scale (still display font, clearly smaller than home poster). Keep `.home-hero .brand` untouched.
2. **Analyze** hero actions: keep readiness badge + Refresh; ensure Job section primary remains `Run analysis` + ghost `Review capture requirements` (already present). Optionally move a ghost “Open Local Agent” into hero when not ready — do not duplicate three primaries.
3. **Compare** hero: badge + Refresh; add ghost link to Analyze when empty/unpaired messaging shows.
4. **Agent** hero: add `hero-actions` with primary Pair (scroll/focus pair section via `href="#pair"` or button that focuses pair panel) + ghost Refresh health. Give Pair section `id="pair"` if using hash.
5. **Capture Guide**: title-case `Capture Guide`; add `hero-actions` with primary `Pair Local Agent` → `/agent` and ghost `Go to Analyze` → `/analyze` using `Link` from `next/link` (replace raw `<a>`). Remove duplicate CTA-only “Next step” panel or reduce it to a short sentence without repeating the same two buttons.

**Commit**: `feat: align tool headers with primary and ghost CTAs`

**Verify**: `npm run lint -w @bml/web` → exit 0. Capture guide hero contains both CTAs. Page `h1` text is `Capture Guide`.

### Step 4: Agent Install disclosure + Capture Guide section trim

1. Agent Install: keep a short checklist (3 steps in plain language). Wrap the full CLI `pre` block in `<details>` / `<summary>Show install commands</summary>` so default view stays sparse.
2. Capture Guide panels: merge related bullets into at most two content sections + optional short next-step note (CTAs already in hero from Step 3). Soften visual density — fewer hairline panels.

**Commit**: `feat: collapse agent install dump and trim capture guide`

**Verify**: `npm run lint -w @bml/web` → exit 0. Agent page still contains install commands inside `details`. Existing agent pairing Playwright test still finds Pair button.

### Step 5: Home below-fold — notices + Labs restyle

**Do not edit `.home-hero`.**

1. Notices: prefer a single readiness/completeness strip when possible. Blocking offline / not_ready may remain; fold non-blocking “Private assembly mode” into the Labs section header as muted text instead of a full notice card when agent is ready/checking.
2. Labs: restyle away from dense glass card mosaic. Prefer list/row or sparse groups: serif title, one muted line, status chip — reduce border/shadow/hover-lift chrome on `.module` or replace grid cards with a simpler list layout. Keep module labels and status badges working.
3. Update Playwright only if selectors break (home offline notice text must remain assertable).

**Commit**: `feat: restyle labs and calm home notice stack`

**Verify**: `npm run lint -w @bml/web` → exit 0. Offline home test still passes conceptually (status text about module catalogue).

### Step 6: Panel rhythm + Playwright suite green

1. Soften `.panel` stacking: more spacing, weaker or fewer consecutive hairline borders so Analyze/Compare/Agent don’t look like a ruled document. Keep semantic `<section>` landmarks.
2. Ensure Analyze result sections remain scannable (do not delete Findings/Metrics/Events content).
3. Run full web browser suite; fix any selector/copy drift from Steps 1–5.

**Commit**: `fix: soften panel rhythm and update UI browser tests`

**Verify**: `npm run test:web -w @bml/web` → all pass. `npm run lint -w @bml/web` → exit 0.

## Test plan

- Update `apps/web/tests/ui.spec.ts`:
  - Brand focus on first Tab from `/`.
  - Capture Guide nav + page title expectations if copy changes.
  - Agent: Pair button still reachable; install commands still in DOM (inside `details` ok).
  - Home offline status copy preserved.
- Pattern: existing tests in `ui.spec.ts` (role-based selectors).
- Verification: `npm run test:web -w @bml/web` → all pass.

## Done criteria

- [ ] Six atomic commits on `advisor/017-visual-polish-non-hero` (or equivalent name)
- [ ] `.home-hero` block unchanged in intent (same headline, tag, two CTAs)
- [ ] `.status-badge.locked` defined in CSS
- [ ] Brand lockup focusable (no `tabIndex={-1}`)
- [ ] Capture Guide hero has primary + ghost CTAs; `h1` is `Capture Guide`
- [ ] Agent install CLI behind `<details>`
- [ ] Labs no longer default to heavy glass card mosaic
- [ ] `npm run lint -w @bml/web` exits 0
- [ ] `npm run test:web -w @bml/web` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] No files outside the in-scope list modified

## STOP conditions

- `.home-hero` content or first-viewport layout would need to change to “make Labs fit” — stop and report.
- Playwright failures require backend/agent API changes — stop.
- Drift: in-scope files differ materially from excerpts and the intended edit location is unclear — stop.
- A step’s verification fails twice after a reasonable fix attempt — stop.

## Maintenance notes

- New tool pages should use the same hero CTA pair pattern and `.page-tool` (if introduced) surfaces.
- Reviewers: confirm `.home-hero` diff is empty or whitespace-only; reject poster regressions.
- Deferred: Analyze video + evidence side-by-side workspace (direction option from audit).
