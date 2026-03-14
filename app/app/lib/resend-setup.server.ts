import type { D1Database } from "@cloudflare/workers-types";
import {
  getProviderWebhookConfig,
  upsertProviderWebhookConfig,
} from "./provider-webhooks.server";

interface ResendDomain {
  id: string;
  name: string;
}

interface ResendWebhook {
  id: string;
  endpoint?: string;
  url?: string;
  events?: string[];
  signing_secret?: string;
}

interface ResendListResponse<T> {
  data?: T[];
}

interface CreatedWebhookResponse {
  id?: string;
  endpoint?: string;
  url?: string;
  events?: string[];
  signing_secret?: string;
}

const RESEND_API_BASE_URL = "https://api.resend.com";
const DELIVERY_WEBHOOK_URL = "https://meatup.club/api/webhooks/email-delivery";
const DELIVERY_WEBHOOK_PURPOSE = "delivery_status";
const RESEND_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
export const DELIVERY_WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.complained",
] as const;

export interface ResendEmailSetupDetails {
  deliveryWebhookUrl: string;
  deliveryWebhookEvents: string[];
  domain: string;
}

export type MaybeEnsureResendEmailSetupResult =
  | {
      configured: false;
      reason: "missing_api_key" | "already_configured";
    }
  | {
      configured: true;
      details: ResendEmailSetupDetails;
    };

function getResendHeaders(resendApiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.max(DEFAULT_RETRY_DELAY_MS, retryAfterSeconds * 1_000);
    }
  }

  return DEFAULT_RETRY_DELAY_MS * attempt;
}

async function fetchResend(
  url: string,
  init: RequestInit,
  attempt = 1
): Promise<Response> {
  const response = await fetch(url, init);

  if (response.status !== 429 || attempt >= RESEND_RATE_LIMIT_RETRIES) {
    return response;
  }

  await sleep(getRetryDelayMs(response, attempt));
  return fetchResend(url, init, attempt + 1);
}

function getWebhookEndpoint(webhook: Pick<ResendWebhook, "endpoint" | "url">): string | null {
  return webhook.endpoint || webhook.url || null;
}

function hasRequiredDeliveryEvents(events: string[] | undefined): boolean {
  if (!events || events.length === 0) {
    return false;
  }

  return DELIVERY_WEBHOOK_EVENTS.every((eventType) => events.includes(eventType));
}

function needsDeliveryWebhookSetup(config: {
  webhookId: string;
  endpoint: string;
  signingSecret: string;
  events: string[];
} | null): boolean {
  if (!config) {
    return true;
  }

  return !config.webhookId || !config.endpoint || !config.signingSecret || !hasRequiredDeliveryEvents(config.events);
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function ensureDeliveryWebhook(params: {
  db: D1Database;
  resendApiKey: string;
}): Promise<{
  webhookId: string;
  endpoint: string;
  events: string[];
  signingSecret: string;
}> {
  const existingConfig = await getProviderWebhookConfig(
    params.db,
    "resend",
    DELIVERY_WEBHOOK_PURPOSE
  );

  const webhooksResponse = await fetchResend(`${RESEND_API_BASE_URL}/webhooks`, {
    method: "GET",
    headers: getResendHeaders(params.resendApiKey),
  });

  if (!webhooksResponse.ok) {
    throw new Error(
      `Failed to load webhooks: ${await getResponseError(webhooksResponse)}`
    );
  }

  const webhooksData = (await webhooksResponse.json()) as ResendListResponse<ResendWebhook>;
  const existingWebhooks = webhooksData.data || [];
  const matchingWebhooks = existingWebhooks.filter(
    (webhook) => getWebhookEndpoint(webhook) === DELIVERY_WEBHOOK_URL
  );

  if (matchingWebhooks.length === 1) {
    const [existingWebhook] = matchingWebhooks;
    const existingEndpoint = getWebhookEndpoint(existingWebhook);
    const signingSecret =
      existingWebhook.signing_secret ||
      (existingConfig &&
      existingConfig.webhookId === existingWebhook.id &&
      existingConfig.endpoint === existingEndpoint
        ? existingConfig.signingSecret
        : null);

    if (
      existingEndpoint &&
      signingSecret &&
      hasRequiredDeliveryEvents(existingWebhook.events)
    ) {
      await upsertProviderWebhookConfig(params.db, {
        provider: "resend",
        purpose: DELIVERY_WEBHOOK_PURPOSE,
        webhookId: existingWebhook.id,
        endpoint: existingEndpoint,
        signingSecret,
        events: existingWebhook.events || [...DELIVERY_WEBHOOK_EVENTS],
      });

      return {
        webhookId: existingWebhook.id,
        endpoint: existingEndpoint,
        signingSecret,
        events: existingWebhook.events || [...DELIVERY_WEBHOOK_EVENTS],
      };
    }
  }

  await Promise.all(
    matchingWebhooks.map(async (webhook) => {
      const deleteResponse = await fetchResend(
        `${RESEND_API_BASE_URL}/webhooks/${webhook.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${params.resendApiKey}`,
          },
        }
      );

      if (!deleteResponse.ok) {
        throw new Error(
          `Failed to delete webhook ${webhook.id}: ${await getResponseError(deleteResponse)}`
        );
      }
    })
  );

  const createResponse = await fetchResend(`${RESEND_API_BASE_URL}/webhooks`, {
    method: "POST",
    headers: getResendHeaders(params.resendApiKey),
    body: JSON.stringify({
      endpoint: DELIVERY_WEBHOOK_URL,
      enabled: true,
      events: [...DELIVERY_WEBHOOK_EVENTS],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Failed to create delivery webhook: ${await getResponseError(createResponse)}`
    );
  }

  const createdWebhook = (await createResponse.json()) as CreatedWebhookResponse;
  const endpoint = createdWebhook.endpoint || createdWebhook.url || DELIVERY_WEBHOOK_URL;

  if (!createdWebhook.id || !createdWebhook.signing_secret) {
    throw new Error("Resend created a webhook without returning an id and signing secret");
  }

  const events = createdWebhook.events || [...DELIVERY_WEBHOOK_EVENTS];
  await upsertProviderWebhookConfig(params.db, {
    provider: "resend",
    purpose: DELIVERY_WEBHOOK_PURPOSE,
    webhookId: createdWebhook.id,
    endpoint,
    signingSecret: createdWebhook.signing_secret,
    events,
  });

  return {
    webhookId: createdWebhook.id,
    endpoint,
    signingSecret: createdWebhook.signing_secret,
    events,
  };
}

export async function ensureResendEmailSetup(params: {
  db: D1Database;
  resendApiKey: string;
}): Promise<ResendEmailSetupDetails> {
  const domainsResponse = await fetchResend(`${RESEND_API_BASE_URL}/domains`, {
    method: "GET",
    headers: getResendHeaders(params.resendApiKey),
  });

  if (!domainsResponse.ok) {
    throw new Error(
      `Failed to fetch domains from Resend: ${await getResponseError(domainsResponse)}`
    );
  }

  const domainsData = (await domainsResponse.json()) as ResendListResponse<ResendDomain>;
  const domain = domainsData.data?.find(
    (candidate) =>
      candidate.name === "mail.meatup.club" || candidate.name === "meatup.club"
  );

  if (!domain) {
    const availableDomains =
      domainsData.data?.map((candidate) => candidate.name).join(", ") || "none";
    throw new Error(
      `Domain mail.meatup.club not found in Resend (available: ${availableDomains})`
    );
  }

  const deliveryWebhook = await ensureDeliveryWebhook({
    db: params.db,
    resendApiKey: params.resendApiKey,
  });

  return {
    deliveryWebhookUrl: deliveryWebhook.endpoint,
    deliveryWebhookEvents: deliveryWebhook.events,
    domain: domain.name,
  };
}

export async function maybeEnsureResendEmailSetup(params: {
  db: D1Database;
  resendApiKey?: string;
}): Promise<MaybeEnsureResendEmailSetupResult> {
  if (!params.resendApiKey) {
    return {
      configured: false,
      reason: "missing_api_key",
    };
  }

  const existingConfig = await getProviderWebhookConfig(
    params.db,
    "resend",
    DELIVERY_WEBHOOK_PURPOSE
  );

  if (!needsDeliveryWebhookSetup(existingConfig)) {
    return {
      configured: false,
      reason: "already_configured",
    };
  }

  const details = await ensureResendEmailSetup({
    db: params.db,
    resendApiKey: params.resendApiKey,
  });

  return {
    configured: true,
    details,
  };
}
