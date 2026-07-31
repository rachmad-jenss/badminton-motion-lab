begin;

select plan(29);

-- The composite keys are the enforcement primitive for every tenant-owned
-- relationship in the control plane.
select col_is_unique(
  'public', 'athletes', array['owner_id', 'id'],
  'athletes exposes an owner-scoped key'
);
select col_is_unique(
  'public', 'sessions', array['owner_id', 'id'],
  'sessions exposes an owner-scoped key'
);
select col_is_unique(
  'public', 'captures', array['owner_id', 'id'],
  'captures exposes an owner-scoped key'
);
select col_is_unique(
  'public', 'worker_devices', array['owner_id', 'id'],
  'worker_devices exposes an owner-scoped key'
);
select col_is_unique(
  'public', 'analysis_jobs', array['owner_id', 'id'],
  'analysis_jobs exposes an owner-scoped key'
);
select col_is_unique(
  'public', 'analysis_runs', array['owner_id', 'id'],
  'analysis_runs exposes an owner-scoped key'
);

select fk_ok(
  'public', 'sessions', array['owner_id', 'athlete_id'],
  'public', 'athletes', array['owner_id', 'id'],
  'sessions references an athlete owned by the same tenant'
);
select fk_ok(
  'public', 'captures', array['owner_id', 'session_id'],
  'public', 'sessions', array['owner_id', 'id'],
  'captures references a session owned by the same tenant'
);
select fk_ok(
  'public', 'analysis_jobs', array['owner_id', 'capture_id'],
  'public', 'captures', array['owner_id', 'id'],
  'jobs reference captures owned by the same tenant'
);
select fk_ok(
  'public', 'analysis_jobs', array['owner_id', 'device_id'],
  'public', 'worker_devices', array['owner_id', 'id'],
  'jobs reference devices owned by the same tenant'
);
select fk_ok(
  'public', 'analysis_runs', array['owner_id', 'job_id'],
  'public', 'analysis_jobs', array['owner_id', 'id'],
  'runs reference jobs owned by the same tenant'
);
select fk_ok(
  'public', 'analysis_runs', array['owner_id', 'capture_id'],
  'public', 'captures', array['owner_id', 'id'],
  'runs reference captures owned by the same tenant'
);
select fk_ok(
  'public', 'metric_summaries', array['owner_id', 'analysis_run_id'],
  'public', 'analysis_runs', array['owner_id', 'id'],
  'metrics reference runs owned by the same tenant'
);
select fk_ok(
  'public', 'metric_summaries', array['owner_id', 'session_id'],
  'public', 'sessions', array['owner_id', 'id'],
  'metrics reference sessions owned by the same tenant'
);

-- Use a transaction-local fixture. Replication-role mode is limited to setup so
-- the synthetic owners do not need to be inserted into auth.users; all tested
-- child writes run with normal foreign-key enforcement restored.
create temp table tenant_integrity_fixture (
  owner_a uuid not null,
  owner_b uuid not null,
  athlete_a uuid not null,
  device_a uuid not null,
  session_a uuid not null,
  capture_a uuid not null,
  job_a uuid not null,
  run_a uuid not null
);

insert into tenant_integrity_fixture
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid();

set local session_replication_role = replica;

insert into public.athletes (id, owner_id, display_name)
select athlete_a, owner_a, 'Tenant integrity athlete'
from tenant_integrity_fixture;

insert into public.worker_devices (id, owner_id, device_name, device_fingerprint)
select device_a, owner_a, 'Tenant integrity device', encode(gen_random_bytes(16), 'hex')
from tenant_integrity_fixture;

set local session_replication_role = origin;

select lives_ok(
  $$
    insert into public.sessions (id, owner_id, athlete_id, title, session_type)
    select session_a, owner_a, athlete_a, 'Tenant integrity session', 'mixed'
    from tenant_integrity_fixture
  $$,
  'same-owner sessions can reference their athlete'
);

select lives_ok(
  $$
    insert into public.captures (
      id, owner_id, session_id, media_fingerprint, storage_locator
    )
    select capture_a, owner_a, session_a, 'tenant-integrity-fingerprint',
      'tenant-integrity-storage'
    from tenant_integrity_fixture
  $$,
  'same-owner captures can reference their session'
);

select lives_ok(
  $$
    insert into public.analysis_jobs (
      id, owner_id, capture_id, device_id
    )
    select job_a, owner_a, capture_a, device_a
    from tenant_integrity_fixture
  $$,
  'same-owner jobs can reference their capture and device'
);

select lives_ok(
  $$
    insert into public.analysis_runs (
      id, owner_id, job_id, capture_id, pipeline_version
    )
    select run_a, owner_a, job_a, capture_a, 'tenant-integrity-test'
    from tenant_integrity_fixture
  $$,
  'same-owner runs can reference their job and capture'
);

select lives_ok(
  $$
    insert into public.metric_summaries (
      owner_id, analysis_run_id, session_id, module_id, metric_id
    )
    select owner_a, run_a, session_a, 'test', 'tenant_integrity'
    from tenant_integrity_fixture
  $$,
  'same-owner metrics can reference their run and session'
);

select throws_ok(
  $$
    insert into public.sessions (owner_id, athlete_id, title, session_type)
    select owner_b, athlete_a, 'Cross-owner session', 'mixed'
    from tenant_integrity_fixture
  $$,
  '23503', null,
  'cross-owner sessions cannot reference an athlete'
);

select throws_ok(
  $$
    insert into public.captures (
      owner_id, session_id, media_fingerprint, storage_locator
    )
    select owner_b, session_a, 'cross-owner-fingerprint', 'cross-owner-storage'
    from tenant_integrity_fixture
  $$,
  '23503', null,
  'cross-owner captures cannot reference a session'
);

select throws_ok(
  $$
    insert into public.analysis_jobs (owner_id, capture_id, device_id)
    select owner_b, capture_a, device_a
    from tenant_integrity_fixture
  $$,
  '23503', null,
  'cross-owner jobs cannot reference a capture or device'
);

select throws_ok(
  $$
    insert into public.analysis_runs (
      owner_id, job_id, capture_id, pipeline_version
    )
    select owner_b, job_a, capture_a, 'cross-owner-test'
    from tenant_integrity_fixture
  $$,
  '23503', null,
  'cross-owner runs cannot reference a job or capture'
);

select throws_ok(
  $$
    insert into public.metric_summaries (
      owner_id, analysis_run_id, session_id, module_id, metric_id
    )
    select owner_b, run_a, session_a, 'test', 'cross_owner'
    from tenant_integrity_fixture
  $$,
  '23503', null,
  'cross-owner metrics cannot reference a run or session'
);

select throws_ok(
  $$
    update public.sessions
    set owner_id = (select owner_b from tenant_integrity_fixture)
    where id = (select session_a from tenant_integrity_fixture)
  $$,
  '23503', null,
  'sessions cannot be reassigned across tenants'
);

select throws_ok(
  $$
    update public.captures
    set owner_id = (select owner_b from tenant_integrity_fixture)
    where id = (select capture_a from tenant_integrity_fixture)
  $$,
  '23503', null,
  'captures cannot be reassigned across tenants'
);

select throws_ok(
  $$
    update public.analysis_jobs
    set owner_id = (select owner_b from tenant_integrity_fixture)
    where id = (select job_a from tenant_integrity_fixture)
  $$,
  '23503', null,
  'jobs cannot be reassigned across tenants'
);

select throws_ok(
  $$
    update public.analysis_runs
    set owner_id = (select owner_b from tenant_integrity_fixture)
    where id = (select run_a from tenant_integrity_fixture)
  $$,
  '23503', null,
  'runs cannot be reassigned across tenants'
);

select throws_ok(
  $$
    update public.metric_summaries
    set owner_id = (select owner_b from tenant_integrity_fixture)
    where analysis_run_id = (select run_a from tenant_integrity_fixture)
  $$,
  '23503', null,
  'metrics cannot be reassigned across tenants'
);

select * from finish();

rollback;
