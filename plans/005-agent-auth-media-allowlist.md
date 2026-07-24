# Plan 005: Agent pairing auth + media allowlist

## Why
`/pair` mints tokens but APIs ignore them; register accepts any path; BYOK plaintext readable via media.

## Steps
1. Require `Authorization: Bearer <token>` on all routes except `/health`.
2. Web stores token after pair; `agent.ts` attaches header.
3. Allowlist media roots (env `BML_MEDIA_ROOTS`, default user Videos + project fixtures); reject secrets dir; video extensions only.
4. Restrict CORS to localhost:3000 and :3001.

## Verify
Unauthed `/analyze` → 401; authed flow works; path outside allowlist rejected.
