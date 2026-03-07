import { describe, expect, it, vi } from "vitest";
import { reserveWebhookDelivery } from "./webhook-idempotency.server";

function createMockDb(runImpl: (bindArgs: unknown[]) => Promise<unknown>) {
  const bindSpy = vi.fn((...bindArgs: unknown[]) => ({
    run: () => runImpl(bindArgs),
  }));

  return {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindArgs: unknown[]) => {
        const bound = bindSpy(...bindArgs);
        return {
          run: () => bound.run(),
        };
      },
    })),
    bindSpy,
  };
}

describe("reserveWebhookDelivery", () => {
  it("trims values and returns true when the insert reserves a new delivery", async () => {
    const db = createMockDb(async () => ({ meta: { changes: 1 } }));

    const reserved = await reserveWebhookDelivery(db as never, " resend ", " svix-123 ");

    expect(reserved).toBe(true);
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT OR IGNORE INTO webhook_deliveries (provider, delivery_id) VALUES (?, ?)"
    );
    expect(db.bindSpy).toHaveBeenCalledWith("resend", "svix-123");
  });

  it("fails open when provider or delivery ID normalize to blank strings", async () => {
    const db = { prepare: vi.fn() };

    expect(await reserveWebhookDelivery(db as never, "   ", "svix-123")).toBe(true);
    expect(await reserveWebhookDelivery(db as never, "resend", "   ")).toBe(true);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns false when the delivery has already been reserved", async () => {
    const db = createMockDb(async () => ({ meta: { changes: 0 } }));

    const reserved = await reserveWebhookDelivery(db as never, "resend", "svix-123");

    expect(reserved).toBe(false);
  });

  it("fails open when the webhook delivery table has not been migrated yet", async () => {
    const db = createMockDb(async () => {
      throw new Error("no such table: webhook_deliveries");
    });

    const reserved = await reserveWebhookDelivery(db as never, "resend", "svix-123");

    expect(reserved).toBe(true);
  });

  it("rethrows unexpected database errors", async () => {
    const db = createMockDb(async () => {
      throw new Error("database is locked");
    });

    await expect(reserveWebhookDelivery(db as never, "resend", "svix-123")).rejects.toThrow(
      "database is locked"
    );
  });
});
