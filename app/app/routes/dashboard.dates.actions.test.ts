import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "./dashboard.dates";
import { requireActiveUser } from "../lib/auth.server";

vi.mock("../lib/auth.server", () => ({
  requireActiveUser: vi.fn(),
}));

type MockDbOptions = {
  activePoll?: { id: number } | null;
  existingDate?: { id: number } | null;
  suggestion?: { id: number; poll_id: number; user_id?: number } | null;
  existingVote?: { id: number } | null;
  insertSuggestionId?: number | null;
};

function createMockDb({
  activePoll = { id: 1 },
  existingDate = null,
  suggestion = { id: 10, poll_id: 1, user_id: 123 },
  existingVote = null,
  insertSuggestionId = 777,
}: MockDbOptions = {}) {
  const runCalls: Array<{ sql: string; bindArgs: unknown[] }> = [];

  const prepare = vi.fn((sql: string) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    const firstForArgs = async (_bindArgs: unknown[]) => {
      if (normalizedSql.includes("SELECT id FROM polls WHERE status = 'active'")) {
        return activePoll;
      }

      if (normalizedSql.includes("SELECT id FROM date_suggestions WHERE suggested_date = ? AND poll_id = ?")) {
        return existingDate;
      }

      if (normalizedSql.includes("SELECT id, poll_id FROM date_suggestions WHERE id = ?")) {
        return suggestion ? { id: suggestion.id, poll_id: suggestion.poll_id } : null;
      }

      if (normalizedSql.includes("SELECT id FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?")) {
        return existingVote;
      }

      if (normalizedSql.includes("SELECT user_id, poll_id FROM date_suggestions WHERE id = ?")) {
        return suggestion ? { user_id: suggestion.user_id, poll_id: suggestion.poll_id } : null;
      }

      throw new Error(`Unexpected first() query: ${normalizedSql}`);
    };

    const runForArgs = async (bindArgs: unknown[]) => {
      runCalls.push({ sql: normalizedSql, bindArgs });

      if (normalizedSql.includes("INSERT INTO date_suggestions")) {
        return { meta: { last_row_id: insertSuggestionId } };
      }

      return { meta: { changes: 1 } };
    };

    return {
      first: () => firstForArgs([]),
      all: async () => ({ results: [] }),
      run: () => runForArgs([]),
      bind: (...bindArgs: unknown[]) => ({
        first: () => firstForArgs(bindArgs),
        all: async () => ({ results: [] }),
        run: () => runForArgs(bindArgs),
      }),
    };
  });

  return { prepare, runCalls };
}

function createRequest(formEntries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(formEntries)) {
    formData.set(key, value);
  }

  return new Request("http://localhost/dashboard/dates", {
    method: "POST",
    body: formData,
  });
}

describe("dashboard.dates action flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireActiveUser).mockResolvedValue({
      id: 123,
      is_admin: 0,
      status: "active",
      email: "user@example.com",
      name: "User",
    } as never);
  });

  it("requires an active poll before suggesting a date", async () => {
    const db = createMockDb({ activePoll: null });
    const request = createRequest({
      _action: "suggest",
      suggested_date: "2026-05-01",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({
      error: "No active poll. Date suggestions require an active poll.",
    });
  });

  it("rejects duplicate date suggestions in the active poll", async () => {
    const db = createMockDb({ existingDate: { id: 999 } });
    const request = createRequest({
      _action: "suggest",
      suggested_date: "2026-05-01",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({
      error: "This date has already been suggested for the current poll",
    });
    expect(db.runCalls).toEqual([]);
  });

  it("creates a suggestion, auto-votes, and redirects", async () => {
    const db = createMockDb({ insertSuggestionId: 888 });
    const request = createRequest({
      _action: "suggest",
      suggested_date: "2026-05-01",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/dates");
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "INSERT INTO date_suggestions (user_id, poll_id, suggested_date) VALUES (?, ?, ?)",
        bindArgs: [123, 1, "2026-05-01"],
      }),
      expect.objectContaining({
        sql: "INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)",
        bindArgs: [1, 888, 123],
      }),
    ]);
  });

  it("adds a vote when the user has not voted for the date yet", async () => {
    const db = createMockDb({ existingVote: null });
    const request = createRequest({
      _action: "vote",
      suggestion_id: "10",
      remove: "false",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "INSERT INTO date_votes (poll_id, date_suggestion_id, user_id) VALUES (?, ?, ?)",
        bindArgs: [1, "10", 123],
      }),
    ]);
  });

  it("removes a vote when remove=true", async () => {
    const db = createMockDb();
    const request = createRequest({
      _action: "vote",
      suggestion_id: "10",
      remove: "true",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "DELETE FROM date_votes WHERE poll_id = ? AND date_suggestion_id = ? AND user_id = ?",
        bindArgs: [1, "10", 123],
      }),
    ]);
  });

  it("rejects deleting someone else's suggestion for non-admin users", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, user_id: 999 },
    });
    const request = createRequest({
      _action: "delete",
      suggestion_id: "10",
    });

    const result = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect(result).toEqual({
      error: "You do not have permission to delete this suggestion",
    });
    expect(db.runCalls).toEqual([]);
  });

  it("allows the owner to delete a suggestion and redirects", async () => {
    const db = createMockDb({
      suggestion: { id: 10, poll_id: 1, user_id: 123 },
    });
    const request = createRequest({
      _action: "delete",
      suggestion_id: "10",
    });

    const response = await action({
      request,
      context: { cloudflare: { env: { DB: db } } } as never,
    } as never);

    expect((response as Response).status).toBe(302);
    expect(db.runCalls).toEqual([
      expect.objectContaining({
        sql: "DELETE FROM date_suggestions WHERE id = ?",
        bindArgs: ["10"],
      }),
    ]);
  });
});
