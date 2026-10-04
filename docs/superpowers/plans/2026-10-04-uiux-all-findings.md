# UI/UX All Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remediate all 26 findings from the bounded UI/UX audit while preserving the existing design system and proving behavior through focused tests, the full repository suite, and direct in-app browser smoke.

**Architecture:** Keep `globals.css` as the design-system source of truth. Add only small shared helpers/attributes where a behavior cannot be expressed safely in CSS. Keep route-specific changes close to the route, and use existing local-agent mocks/test utilities. Asset work must remain bounded and must not load training/media data.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, DaisyUI 5, CSS media queries, native `<details>`, existing Playwright repository tests for local regression coverage, Codex in-app browser for direct website verification.

**Spec:** `docs/superpowers/specs/2026-10-04-uiux-findings.md`

## Global Constraints

- Do not add dependencies.
- Do not stage or modify unrelated `apps/web/tsconfig.json`, screenshots, attachments, generated output, training data, videos, or checkpoints.
- Use the existing `d-` DaisyUI prefix and existing token names where possible.
- Direct website smoke uses the Codex in-app browser, not Playwright.
- Keep verification serial and bounded; use one worker and capped Node heaps where commands support it.
- Preserve local-first behavior and do not create production data or external agent records.
- Every behavior change follows RED → GREEN → full relevant suite.

## Review Focus

- A user with a slow/offline Local Agent must see checking/offline/not-ready distinctly, not a false failure.
- A keyboard user must reach content, operate disclosures, and close menus predictably.
- A 390px viewport with safe-area insets must not hide content behind the fixed header or browser chrome.
- Reduced-motion users must receive comprehension feedback without positional motion.
- Evidence-frame controls must either perform the promised action or use honest wording.

---

### Task 1: Readiness, shared page hierarchy, and keyboard access

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/agent/page.tsx`
- Modify: `apps/web/src/app/label/page.tsx`
- Modify: `apps/web/src/app/contribute/page.tsx`
- Modify: `apps/web/src/components/OnboardingSteps.tsx`
- Modify: `apps/web/src/components/VisualShell.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/ui.spec.ts`
- Test: `apps/web/tests/beta.spec.ts`
- Test: `apps/web/tests/labeling.spec.ts`

**Interfaces:**
- Consumes existing `AgentReadiness` and `agentToken()` state.
- Produces a `#main-content` target, a skip link, explicit checking rendering, and shared page heading structure.

- [ ] **Step 1: Write failing tests** for checking-state neutrality, skip link focus/target, and shared `/contribute`/`/label` heading structure.
- [ ] **Step 2: Run the focused UI tests and confirm they fail for the missing contracts.**
- [ ] **Step 3: Implement explicit checking states, shared page hero structure, skip link, and summary focus styling without changing route behavior.**
- [ ] **Step 4: Run the focused UI tests and confirm they pass.**
- [ ] **Step 5: Commit** `fix: establish shared readiness and keyboard UI contracts`.

### Task 2: Mobile-native shell and material accessibility

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/VisualShell.tsx`
- Modify: `apps/web/src/lib/backgrounds.ts`
- Test: `apps/web/tests/ui.spec.ts`

**Interfaces:**
- Consumes the existing `--header-height`, safe-area, background preset, and theme tokens.
- Produces touch/viewport/text-size/transparency/high-contrast contracts and a stable responsive header offset.

- [ ] **Step 1: Write failing tests** for tap-highlight absence, text-size-adjust, mobile safe-area offsets, `dvh` shell fallback, and reduced-transparency/high-contrast rules.
- [ ] **Step 2: Run focused contract tests and confirm they fail.**
- [ ] **Step 3: Add the mobile contracts, preserve `svh` only where intentional, separate warning token usage, and add opaque material fallbacks.**
- [ ] **Step 4: Add bounded lazy/deferred background preview loading and verify only active/visible previews are requested in the browser.**
- [ ] **Step 5: Run focused tests and inspect the diff for unrelated asset/generated changes.**
- [ ] **Step 6: Commit** `fix: harden mobile shell and material accessibility`.

### Task 3: Menu interaction and motion correctness

**Files:**
- Modify: `apps/web/src/components/VisualShell.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/ui.spec.ts`

**Interfaces:**
- Consumes native `<details>` menus and the existing `suppressTransitions()` helper.
- Produces one cancelable close path, complete menu labeling/focus behavior, gated hover, smooth press feedback, tokenized easing, and reduced-motion-safe result reveals.

- [ ] **Step 1: Write failing tests** for summary close, Escape/outside close, rapid reopen, menu accessible name, hover gating, and reduced-motion result reveal.
- [ ] **Step 2: Run focused tests and confirm the current close timer/summary path fails.**
- [ ] **Step 3: Implement a cancelable menu close controller whose JS timer matches the CSS transition, preserve instant reduced-motion close, and keep focus return deterministic.**
- [ ] **Step 4: Split selected styles from fine-pointer hover styles; add transform transitions for menu press states; use `var(--ease-out)` for enter motion; gate result movement behind `no-preference`.**
- [ ] **Step 5: Run focused tests and confirm they pass.**
- [ ] **Step 6: Commit** `fix: make menus and motion interruptible`.

### Task 4: Feedback, evidence navigation, and data accessibility

**Files:**
- Modify: `apps/web/src/app/analyze/page.tsx`
- Modify: `apps/web/src/app/compare/page.tsx`
- Modify: `apps/web/src/app/agent/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/ui.spec.ts`

**Interfaces:**
- Consumes the existing `AnalyzeResult`, `SessionMetricPoint`, video element, and agent mocks.
- Produces consistent alert styling, actual evidence-frame seeking or honest fallback copy, accessible trend data, responsive tables, captions/scopes, and shared detail styling.

- [ ] **Step 1: Write failing tests** for evidence-frame seeking, alert surface classes, chart accessible data, table captions/scopes, and mobile compare affordance.
- [ ] **Step 2: Run focused tests and confirm they fail against current markup/behavior.**
- [ ] **Step 3: Add a video ref plus evidence timestamp/FPS handling; if the payload cannot supply a timestamp, make the UI label explicit instead of claiming review.**
- [ ] **Step 4: Normalize alert/error surfaces and accessible table/chart markup without animating functional data.**
- [ ] **Step 5: Apply shared styling to technical-name disclosure and responsive compare presentation.**
- [ ] **Step 6: Run focused tests and confirm they pass.**
- [ ] **Step 7: Commit** `fix: clarify feedback and accessible analysis data`.

### Task 5: Preference hydration, asset guardrails, and animation opportunities

**Files:**
- Modify: `apps/web/src/components/VisualShell.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/label/page.tsx`
- Modify: `apps/web/src/components/OnboardingSteps.tsx`
- Test: `apps/web/tests/ui.spec.ts`
- Test: `apps/web/tests/labeling.spec.ts`

**Interfaces:**
- Consumes localStorage theme/background preferences and existing `@starting-style` conventions.
- Produces stable preference hydration plus only the two approved low-frequency animation opportunities: label preview entry and onboarding state indication.

- [ ] **Step 1: Write failing tests** for persisted preference stability after reload and the two new animation classes/entry contracts.
- [ ] **Step 2: Run focused tests and confirm they fail.**
- [ ] **Step 3: Move theme/background preference application into the pre-paint-safe path and prevent a default-background transition during hydration.**
- [ ] **Step 4: Add restrained preview/state indication motion with reduced-motion alternatives; reject route-wide or data-heavy animation.**
- [ ] **Step 5: Run focused tests and confirm they pass.**
- [ ] **Step 6: Commit** `fix: stabilize preference hydration and rare state motion`.

### Task 6: Full verification, in-app browser, and review package

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-uiux-findings.md`
- Modify: `docs/superpowers/plans/2026-10-04-uiux-all-findings.md`
- Create/modify: `.superpowers/sdd/2026-10-04-uiux-all-findings/progress.md`

- [ ] **Step 1: Run the complete repository verification serially with a bounded Node heap.**
- [ ] **Step 2: Start the smallest suitable local web server and inspect the live site with the Codex in-app browser, covering home, setup, analyze, compare, capture guide, contribute, and label; cover desktop, 390px-sized layout, menu open/close, reduced-motion setting where available, loading/error/empty states, and anchor targets.**
- [ ] **Step 3: Record direct-browser evidence and any truly untestable device behavior as PASS/FAIL/NOT_RUN.**
- [ ] **Step 4: Perform final diff/spec audit and create the review package.**
- [ ] **Step 5: Commit** `docs: record UIUX remediation verification` if plan/ledger updates remain.

### Task 7: PR lifecycle and merge

- [ ] **Step 1: Run final verification immediately before commit/push/PR.**
- [ ] **Step 2: Create the PR with detailed issue/cause/fix/test evidence.**
- [ ] **Step 3: Poll CI and review threads; resolve every actionable comment with a RED→GREEN fix and a follow-up commit.**
- [ ] **Step 4: Merge only after required checks and review threads are green/resolved.**
- [ ] **Step 5: Poll `main` CI after merge until complete.**
- [ ] **Step 6: Delete the merged remote/local feature branch only after verifying merged tree and preserving unrelated dirty files.**

## Commit boundaries

1. Plan/spec only if needed before code.
2. Readiness/keyboard/page hierarchy.
3. Mobile/material contracts.
4. Menu/motion.
5. Feedback/data accessibility.
6. Preference hydration/rare motion.
7. Verification ledger/docs.

Each commit stages only files created or modified for that task. Never use `git add -A` because the checkout already contains unrelated user files.
