-- Enforce that control-plane child rows reference parents owned by the same tenant.
-- The existing owner_id policies remain the request-level authorization boundary;
-- these composite keys add database-level relationship integrity underneath them.

alter table public.athletes
  add constraint athletes_owner_id_id_key unique (owner_id, id);

alter table public.sessions
  add constraint sessions_owner_id_id_key unique (owner_id, id);

alter table public.captures
  add constraint captures_owner_id_id_key unique (owner_id, id);

alter table public.worker_devices
  add constraint worker_devices_owner_id_id_key unique (owner_id, id);

alter table public.analysis_jobs
  add constraint analysis_jobs_owner_id_id_key unique (owner_id, id);

alter table public.analysis_runs
  add constraint analysis_runs_owner_id_id_key unique (owner_id, id);

alter table public.sessions
  add constraint sessions_owner_athlete_fk
  foreign key (owner_id, athlete_id)
  references public.athletes (owner_id, id)
  on delete cascade;

alter table public.captures
  add constraint captures_owner_session_fk
  foreign key (owner_id, session_id)
  references public.sessions (owner_id, id)
  on delete cascade;

alter table public.analysis_jobs
  add constraint analysis_jobs_owner_capture_fk
  foreign key (owner_id, capture_id)
  references public.captures (owner_id, id)
  on delete cascade;

alter table public.analysis_jobs
  add constraint analysis_jobs_owner_device_fk
  foreign key (owner_id, device_id)
  references public.worker_devices (owner_id, id)
  on delete no action;

alter table public.analysis_runs
  add constraint analysis_runs_owner_job_fk
  foreign key (owner_id, job_id)
  references public.analysis_jobs (owner_id, id)
  on delete cascade;

alter table public.analysis_runs
  add constraint analysis_runs_owner_capture_fk
  foreign key (owner_id, capture_id)
  references public.captures (owner_id, id)
  on delete cascade;

alter table public.metric_summaries
  add constraint metric_summaries_owner_run_fk
  foreign key (owner_id, analysis_run_id)
  references public.analysis_runs (owner_id, id)
  on delete cascade;

alter table public.metric_summaries
  add constraint metric_summaries_owner_session_fk
  foreign key (owner_id, session_id)
  references public.sessions (owner_id, id)
  on delete cascade;
