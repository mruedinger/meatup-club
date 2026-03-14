import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import EventsPage from "./dashboard.events";

function buildUpcomingEvent(
  id: number,
  restaurantName: string,
  eventDate: string,
  overrides: Partial<Record<string, unknown>> = {}
) {
  return {
    id,
    restaurant_name: restaurantName,
    restaurant_address: `${id} Main Street`,
    event_date: eventDate,
    event_time: "18:30",
    status: "upcoming",
    created_at: "2026-03-01 12:00:00",
    calendar_sequence: 0,
    created_by: 123,
    creator_name: "Member",
    creator_email: "member@example.com",
    canEdit: true,
    creatorLabel: "Created by you",
    userRsvp: null,
    allRsvps: [],
    notResponded: [
      {
        id: 321,
        name: "Another Member",
        email: "another@example.com",
        picture: null,
      },
    ],
    ...overrides,
  };
}

function renderEventsPage(upcomingEvents: unknown[]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <EventsPage
            loaderData={
              {
                currentUser: { id: 123, isAdmin: false },
                upcomingEvents,
                pastEvents: [],
              } as never
            }
            actionData={undefined as never}
            matches={[] as never}
            params={{} as never}
          />
        ),
      },
    ],
    {
      initialEntries: ["/"],
    }
  );

  return render(<RouterProvider router={router} />);
}

describe("dashboard.events page UI", () => {
  it("shows multiple upcoming events as separate collapsed tiles", () => {
    renderEventsPage([
      buildUpcomingEvent(1, "North Prime", "2099-04-20"),
      buildUpcomingEvent(2, "South Smokehouse", "2099-05-18"),
    ]);

    expect(screen.getByText("2 upcoming events")).toBeInTheDocument();

    const northTile = screen.getByRole("article", { name: "North Prime" });
    const southTile = screen.getByRole("article", { name: "South Smokehouse" });

    expect(
      within(northTile).getByRole("button", { name: "Open details for North Prime" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(southTile).getByRole("button", { name: "Open details for South Smokehouse" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Your RSVP")).not.toBeInTheDocument();
  });

  it("expands a selected event tile in place to reveal RSVP controls", () => {
    renderEventsPage([
      buildUpcomingEvent(1, "North Prime", "2099-04-20"),
      buildUpcomingEvent(2, "South Smokehouse", "2099-05-18"),
    ]);

    const southTile = screen.getByRole("article", { name: "South Smokehouse" });

    fireEvent.click(within(southTile).getByRole("button", { name: "Open details for South Smokehouse" }));

    expect(
      within(southTile).getByRole("button", { name: "Hide details for South Smokehouse" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(within(southTile).getByText("Your RSVP")).toBeInTheDocument();
    expect(within(southTile).getByLabelText("Comments (Optional)")).toBeInTheDocument();
  });
});
