import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loader as searchLoader } from "./api.places.search";
import { loader as detailsLoader } from "./api.places.details";
import { loader as photoLoader } from "./api.places.photo";
import { getUser } from "../lib/auth.server";
import { enforceRateLimit } from "../lib/rate-limit.server";

vi.mock("../lib/auth.server", () => ({
  getUser: vi.fn(),
}));

vi.mock("../lib/rate-limit.server", () => ({
  enforceRateLimit: vi.fn(),
}));

vi.mock("../lib/cache.server", () => ({
  withCache: async (
    _request: Request,
    _context: unknown,
    fetcher: () => Promise<Response>
  ) => fetcher(),
}));

describe("Places API route guards", () => {
  const mockContext = {
    cloudflare: {
      env: {
        DB: {},
        GOOGLE_PLACES_API_KEY: "test-places-api-key",
      },
      ctx: {
        waitUntil: vi.fn(),
      },
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image-bytes", {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
      },
    })));
    vi.mocked(getUser).mockResolvedValue({
      id: 1,
      status: "active",
      email: "user@example.com",
    } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when unauthenticated on places search", async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const response = await searchLoader({
      request: new Request("http://localhost/api/places/search?input=steak"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("returns 429 when details endpoint rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });

    const response = await detailsLoader({
      request: new Request("http://localhost/api/places/details?placeId=ChIJ12345"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 400 for invalid photo resource names", async () => {
    const response = await photoLoader({
      request: new Request("http://localhost/api/places/photo?name=bad-value"),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(400);
  });

  it("accepts long Google photo resource names that exceed 255 characters", async () => {
    const longPhotoName = `places/${"A".repeat(320)}/photos/${"B".repeat(140)}`;
    const requestUrl = new URL("http://localhost/api/places/photo");
    requestUrl.search = new URLSearchParams({
      name: longPhotoName,
      maxHeightPx: "400",
      maxWidthPx: "400",
    }).toString();

    const response = await photoLoader({
      request: new Request(requestUrl),
      context: mockContext,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });
});
