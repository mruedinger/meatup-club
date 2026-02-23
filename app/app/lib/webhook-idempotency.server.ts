import type { D1Database } from "@cloudflare/workers-types";

/**
 * Reserve a webhook delivery ID for idempotent processing.
 * Returns true when this delivery has not been seen before.
 */
export async function reserveWebhookDelivery(
  db: D1Database,
  provider: string,
  deliveryId: string
): Promise<boolean> {
  const normalizedProvider = provider.trim();
  const normalizedDeliveryId = deliveryId.trim();

  if (!normalizedProvider || !normalizedDeliveryId) {
    return true;
  }

  try {
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO webhook_deliveries (provider, delivery_id) VALUES (?, ?)"
      )
      .bind(normalizedProvider, normalizedDeliveryId)
      .run();

    return Number(result.meta?.changes || 0) > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Fail open if the table has not been migrated yet to avoid webhook outages.
    if (message.includes("no such table") && message.includes("webhook_deliveries")) {
      return true;
    }

    throw error;
  }
}
