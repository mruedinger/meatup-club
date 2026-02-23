import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./api.webhooks.sms";
import { reserveWebhookDelivery } from "../lib/webhook-idempotency.server";
import { verifyTwilioSignature } from "../lib/sms.server";

vi.mock("../lib/webhook-idempotency.server", () => ({
  reserveWebhookDelivery: vi.fn(),
}));

vi.mock("../lib/sms.server", () => ({
  buildSmsResponse: (message?: string) =>
    new Response(`<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>${message ? `<Message>${message}</Message>` : ""}</Response>`, {
      headers: { "Content-Type": "text/xml" },
    }),
  normalizePhoneNumber: vi.fn(() => "+15551234567"),
  parseSmsReply: vi.fn(() => "yes"),
  verifyTwilioSignature: vi.fn(() => true),
}));

describe("api.webhooks.sms idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores duplicate Twilio MessageSid deliveries", async () => {
    vi.mocked(verifyTwilioSignature).mockReturnValue(true);
    vi.mocked(reserveWebhookDelivery).mockResolvedValue(false);

    const formData = new FormData();
    formData.set("MessageSid", "SM_DUPLICATE_123");
    formData.set("From", "+15551234567");
    formData.set("Body", "YES");

    const request = new Request("http://localhost/api/webhooks/sms", {
      method: "POST",
      headers: {
        "X-Twilio-Signature": "valid",
      },
      body: formData,
    });

    const db = { prepare: vi.fn() };

    const response = await action({
      request,
      context: {
        cloudflare: {
          env: {
            DB: db,
            TWILIO_AUTH_TOKEN: "token",
          },
        },
      } as any,
    } as any);

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("already received that response");
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
