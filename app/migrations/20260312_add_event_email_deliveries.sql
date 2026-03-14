CREATE TABLE IF NOT EXISTS event_email_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  batch_id TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('invite', 'update', 'cancel')),
  recipient_email TEXT NOT NULL,
  rsvp_status TEXT,
  restaurant_name TEXT NOT NULL,
  restaurant_address TEXT,
  event_date DATE NOT NULL,
  event_time TEXT NOT NULL,
  calendar_sequence INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'sending',
      'provider_accepted',
      'delivered',
      'delivery_delayed',
      'retry',
      'failed',
      'bounced',
      'complained'
    )),
  provider_message_id TEXT UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_provider_event TEXT,
  last_queued_at DATETIME,
  next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sending_started_at DATETIME,
  provider_accepted_at DATETIME,
  delivered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_batch
  ON event_email_deliveries(batch_id);

CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_event
  ON event_email_deliveries(event_id, delivery_type, calendar_sequence);

CREATE INDEX IF NOT EXISTS idx_event_email_deliveries_backlog
  ON event_email_deliveries(status, next_attempt_at, last_queued_at);

CREATE TABLE IF NOT EXISTS provider_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  purpose TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, purpose),
  UNIQUE(provider, webhook_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhooks_provider
  ON provider_webhooks(provider, purpose);
