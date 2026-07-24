# Plan 008: Docs port fix + remove unused Supabase web dep

## Why
README says :3000; app uses :3001. Unused `@supabase/supabase-js`.

## Steps
Fix README; remove dep; refresh lockfile; mention CI verify.

## Verify
No supabase import in web; README only :3001 for web UI.
