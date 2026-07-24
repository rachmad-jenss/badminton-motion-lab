# Improvement plans — Badminton Motion Lab

**Planned at:** pre-git baseline · **2026-07-24**

| Order | Plan | Status |
|------:|------|--------|
| 1 | [001-fix-analyze-jsx-verify](001-fix-analyze-jsx-verify.md) | DONE |
| 2 | [002-guard-wrist-height](002-guard-wrist-height.md) | DONE |
| 3 | [003-frameindex-lookup](003-frameindex-lookup.md) | DONE |
| 4 | [004-remove-fake-footwork-metrics](004-remove-fake-footwork-metrics.md) | DONE |
| 5 | [005-agent-auth-media-allowlist](005-agent-auth-media-allowlist.md) | DONE |
| 6 | [006-real-readiness-benchmarks](006-real-readiness-benchmarks.md) | DONE |
| 7 | [007-single-pass-analyze-offload](007-single-pass-analyze-offload.md) | DONE |
| 8 | [008-docs-supabase-cleanup](008-docs-supabase-cleanup.md) | DONE |

## Verification

```bash
npm run verify
# typecheck + web build + agent pytest/smoke + no-synthetic reports
npm run benchmark:fixtures   # requires live agent
```
