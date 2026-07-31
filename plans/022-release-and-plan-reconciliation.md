# Plan 022: Release closeout and plan reconciliation

## Status

- **Priority**: P1
- **Risk**: LOW
- **Depends on**: Plans 018-021

## Objective

Close the work with evidence, keep the plan index truthful, and deliver through
the user's configured GitHub identity without adding agent/tool branding.

## Steps

1. Run web lint/typecheck/build, contracts tests, agent pytest/smoke/lifecycle,
   no-synthetic checks, readiness integrity, and the full Playwright/Chromium
   suite in the hosted CI verification job.
2. Start the website locally and exercise the critical browser flow directly
   against the running site: load `/`, `/analyze`, `/capture-guide`, `/agent`,
   and `/compare`, verify their primary headings/CTAs, and record console
   errors. Preserve unrelated working-tree artifacts.
3. Review the diff, then create atomic commits on a `jenss/` feature branch.
   Verify every commit author is the configured user before push.
4. Push a human-titled PR, monitor CI and review comments, resolve every
   actionable comment with a code/test change, and rerun affected gates.
5. Merge with repository policy, poll the resulting `main` workflow to green,
   mark completed plans, and delete only the merged feature branch created for
   this delivery. Never delete `main` or unrelated user branches.

## Completion evidence

- PR URL, commit list, review/comment state, hosted CI run, post-merge `main`
  run, exact local browser result, and branch cleanup result.
- `readiness:check` remains a separate product-data gate if real domain-valid
  fixtures are not available; do not fabricate fixtures to make it pass.
