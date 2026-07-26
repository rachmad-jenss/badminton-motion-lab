-- Seed module readiness conservatively. Smoke footage must not unlock
-- badminton technique modules; apply benchmark output after domain fixtures pass.

insert into public.module_readiness (module_id, status, unlocked_at)
values
  ('technique:serve', 'locked', null),
  ('technique:forehand', 'locked', null),
  ('technique:backhand', 'locked', null),
  ('technique:smash', 'locked', null),
  ('technique:clear', 'locked', null),
  ('technique:drop', 'locked', null),
  ('technique:drive', 'locked', null),
  ('technique:net_shot', 'locked', null),
  ('technique:lift', 'locked', null),
  ('technique:block', 'locked', null),
  ('technique:defensive_return', 'locked', null),
  ('technique:jump_smash', 'locked', null),
  ('footwork:pure', 'locked', null),
  ('footwork:layer:serve', 'locked', null),
  ('footwork:layer:forehand', 'locked', null),
  ('footwork:layer:backhand', 'locked', null),
  ('footwork:layer:smash', 'locked', null),
  ('footwork:layer:clear', 'locked', null),
  ('footwork:layer:drop', 'locked', null),
  ('footwork:layer:drive', 'locked', null),
  ('footwork:layer:net_shot', 'locked', null),
  ('footwork:layer:lift', 'locked', null),
  ('footwork:layer:block', 'locked', null),
  ('footwork:layer:defensive_return', 'locked', null),
  ('footwork:layer:jump_smash', 'locked', null)
on conflict (module_id) do update
set status = excluded.status,
    unlocked_at = excluded.unlocked_at,
    updated_at = now();
