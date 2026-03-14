import type { D1Database } from "@cloudflare/workers-types";

export interface ProviderWebhookConfig {
  provider: string;
  purpose: string;
  webhookId: string;
  endpoint: string;
  signingSecret: string;
  events: string[];
}

interface ProviderWebhookRow {
  provider: string;
  purpose: string;
  webhook_id: string;
  endpoint: string;
  signing_secret: string;
  events_json: string;
}

function isMissingTable(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("no such table") && message.includes(tableName.toLowerCase());
}

export async function getProviderWebhookConfig(
  db: D1Database,
  provider: string,
  purpose: string
): Promise<ProviderWebhookConfig | null> {
  try {
    const row = await db
      .prepare(
        `
          SELECT provider, purpose, webhook_id, endpoint, signing_secret, events_json
          FROM provider_webhooks
          WHERE provider = ? AND purpose = ?
        `
      )
      .bind(provider, purpose)
      .first() as ProviderWebhookRow | null;

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      purpose: row.purpose,
      webhookId: row.webhook_id,
      endpoint: row.endpoint,
      signingSecret: row.signing_secret,
      events: JSON.parse(row.events_json) as string[],
    };
  } catch (error) {
    if (isMissingTable(error, "provider_webhooks")) {
      return null;
    }
    throw error;
  }
}

export async function upsertProviderWebhookConfig(
  db: D1Database,
  config: ProviderWebhookConfig
): Promise<void> {
  await db
    .prepare(
      `
        INSERT INTO provider_webhooks (
          provider,
          purpose,
          webhook_id,
          endpoint,
          signing_secret,
          events_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, purpose) DO UPDATE SET
          webhook_id = excluded.webhook_id,
          endpoint = excluded.endpoint,
          signing_secret = excluded.signing_secret,
          events_json = excluded.events_json,
          updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      config.provider,
      config.purpose,
      config.webhookId,
      config.endpoint,
      config.signingSecret,
      JSON.stringify(config.events)
    )
    .run();
}
