import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { DoodleView } from "./DoodleView";

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    isDateInPastLocal: vi.fn((dateString: string) => dateString < "2026-04-15"),
  };
});

describe("DoodleView", () => {
  it("filters past votes, shows the current user, and recalculates vote totals from visible votes", async () => {
    render(
      <DoodleView
        currentUserId={2}
        dateSuggestions={[
          { id: 1, suggested_date: "2026-04-10", vote_count: 99 },
          { id: 2, suggested_date: "2026-04-20", vote_count: 99 },
          { id: 3, suggested_date: "2026-04-22", vote_count: 1 },
        ]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 3,
            suggested_date: "2026-04-10",
            user_name: "Past Only",
            user_email: "past@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 1,
            suggested_date: "2026-04-20",
            user_name: "Alice",
            user_email: "alice@example.com",
          },
          {
            date_suggestion_id: 2,
            user_id: 2,
            suggested_date: "2026-04-20",
            user_name: null,
            user_email: "current@example.com",
          },
        ]}
      />
    );

    await screen.findByText("Availability Grid");

    expect(screen.getByText("Apr 20")).toBeInTheDocument();
    expect(screen.queryByText("Apr 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Past Only")).not.toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();

    const currentUserRow = screen.getByText("current@example.com").closest("tr");
    expect(currentUserRow).not.toBeNull();
    expect(within(currentUserRow as HTMLTableRowElement).getByText("1")).toBeInTheDocument();

    const totalsRow = screen.getByText("Total Votes").closest("tr");
    expect(totalsRow).not.toBeNull();
    expect(within(totalsRow as HTMLTableRowElement).getByText("2")).toBeInTheDocument();
  });

  it("renders nothing when there are no future voted dates", async () => {
    const { container } = render(
      <DoodleView
        currentUserId={2}
        dateSuggestions={[{ id: 1, suggested_date: "2026-04-10", vote_count: 3 }]}
        dateVotes={[
          {
            date_suggestion_id: 1,
            user_id: 2,
            suggested_date: "2026-04-10",
            user_name: "Current User",
            user_email: "current@example.com",
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("Availability Grid")).not.toBeInTheDocument();
    });

    expect(container).toBeEmptyDOMElement();
  });
});
