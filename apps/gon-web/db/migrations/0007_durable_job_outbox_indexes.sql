-- GON P05-R1.3 migration 0007: indexes for durable job leases and outbox
-- publishing leases. Forward-only expand migration; no table or column is
-- removed or repurposed.

create index async_jobs_running_lease_idx
  on async_jobs (lease_expires_at, created_at, id)
  where status = 'running';

create index outbox_events_publishing_lease_idx
  on outbox_events (available_at, occurred_at, event_id)
  where publish_state = 'publishing';

comment on index async_jobs_running_lease_idx is
  'Supports bounded reconciliation of expired durable-job leases.';

comment on index outbox_events_publishing_lease_idx is
  'Supports reclaiming stale transactional-outbox publishing leases.';
