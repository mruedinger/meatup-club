import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DateCalendar } from "./DateCalendar";

vi.mock("../lib/dateUtils", async () => {
  const actual = await vi.importActual<typeof import("../lib/dateUtils")>("../lib/dateUtils");

  return {
    ...actual,
    getTodayDateStringLocal: vi.fn(() => "2026-04-15"),
    isDateInPastLocal: vi.fn((dateString: string) => dateString < "2026-04-15"),
  };
});

describe("DateCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onDateClick with the selected current-month date", () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "20" }));

    expect(onDateClick).toHaveBeenCalledWith("2026-04-20");
  });

  it("maps previous-month trailing days to the previous month", () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    fireEvent.click(screen.getByTitle("Next month"));

    const previousMonthButton = screen
      .getAllByTitle("Click to add this date (Previous month)")
      .find(button => button.textContent === "30");
    expect(previousMonthButton).toBeDefined();
    fireEvent.click(previousMonthButton!);

    expect(onDateClick).toHaveBeenCalledWith("2026-04-30");
  });

  it("disables past dates with no existing user interaction after hydration", async () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    await act(async () => {});

    expect(screen.getByRole("button", { name: "10" })).toBeDisabled();
  });

  it("keeps a past date interactive when the current user already voted for it", async () => {
    const onDateClick = vi.fn();

    render(
      <DateCalendar
        suggestions={[
          {
            id: 8,
            suggested_date: "2026-04-08",
            vote_count: 2,
            user_has_voted: 1,
            poll_id: 1,
            user_id: 999,
          },
        ]}
        activePollId={1}
        currentUserId={123}
        onDateClick={onDateClick}
      />
    );

    await act(async () => {});

    const button = screen
      .getAllByTitle("Past date")
      .find(currentButton => !currentButton.hasAttribute("disabled"));
    expect(button).toHaveTextContent("8");
    expect(button).toBeEnabled();

    fireEvent.click(button!);

    expect(onDateClick).toHaveBeenCalledWith("2026-04-08");
  });
});
