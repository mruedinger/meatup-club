-- Deduplicate inbound webhook deliveries to make handlers idempotent.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_provider
  ON webhook_deliveries(provider);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received_at
  ON webhook_deliveries(received_at);
