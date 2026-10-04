# UI/UX Findings Remediation Spec

**Scope:** Resolve every finding from the 2026-10-04 bounded design-system audit of `apps/web`.

**Behavioral constraints:** Preserve the existing DaisyUI `d-` prefix, light/dark themes, local-first workflow, and existing motion language. Do not add a dependency. Keep motion compositor-friendly and reduced-motion safe. Keep existing unrelated dirty/untracked files out of commits. Direct website verification must use the Codex in-app browser, not Playwright.

## Acceptance checklist

- [ ] Loading/readiness states never present an unresolved check as a failure.
- [ ] `/contribute` and `/label` use the shared page hierarchy.
- [ ] Keyboard users get skip-to-content and consistent disclosure focus rings.
- [ ] Theme/background menus have coherent semantics and interruptible close behavior.
- [ ] Touch hover, tap highlight, text inflation, safe-area, dynamic viewport, and anchor offsets are covered.
- [ ] Reduced-motion users do not receive positional result reveals.
- [ ] Error surfaces, warning colors, tables, charts, and disclosures use consistent semantic/accessibility contracts.
- [ ] Evidence-frame actions either seek the local video or use an honest action label.
- [ ] Translucent surfaces have reduced-transparency/high-contrast fallbacks.
- [ ] Background asset loading is deferred/optimized within the current asset constraints.
- [ ] In-app browser smoke covers desktop and narrow/mobile-sized layouts, menus, loading, error, analysis, compare, and label flows.
- [ ] Full repository verification, PR checks, review comments, merged-main CI, and scoped cleanup are recorded separately.

## Findings mapping

| Audit IDs | Area | Primary files |
| --- | --- | --- |
| F01–F05 | Loading, layout, skip link, focus, menu semantics | `VisualShell.tsx`, `OnboardingSteps.tsx`, `page.tsx`, `agent/page.tsx`, `label/page.tsx`, `layout.tsx`, `globals.css` |
| F06–F15 | Menu close, touch, mobile viewport, motion, reduced motion | `VisualShell.tsx`, `globals.css`, `layout.tsx` |
| F16–F21 | Feedback, evidence frame, chart/table/disclosure accessibility | `analyze/page.tsx`, `compare/page.tsx`, `agent/page.tsx`, `globals.css` |
| F22–F26 | Semantic tokens, materials, contrast, assets, preference hydration | `globals.css`, `backgrounds.ts`, `VisualShell.tsx`, `public/backgrounds/*` |

## Verification requirements

1. Each behavior change gets a failing regression test before implementation.
2. Run the focused test after each batch, then the full repository gate serially.
3. Use the in-app browser for direct website smoke; record any browser/device behavior that cannot be proven on this host as `NOT_RUN`.
4. Review the final diff against this spec and the audit IDs before commit, PR creation, merge, and cleanup.
