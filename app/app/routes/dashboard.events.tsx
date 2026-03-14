import { Form } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/dashboard.events";
import { requireActiveUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { upsertRsvp } from "../lib/rsvps.server";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getAppTimeZone,
  isEventInPastInTimeZone,
} from "../lib/dateUtils";
import type { Event, RsvpWithUser } from "../lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  UserAvatar,
} from "../components/ui";
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  MapPinIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface MemberRow {
  id: number;
  name: string | null;
  email: string;
  picture: string | null;
}

interface UpcomingEvent extends Event {
  userRsvp?: { status: string; comments: string | null } | null;
  allRsvps: RsvpWithUser[];
  notResponded?: MemberRow[];
}

interface PastEvent extends Event {
  displayStatus: "completed" | "cancelled";
}

function getEventDateTimeKey(event: Pick<Event, "event_date" | "event_time">): string {
  return `${event.event_date}T${event.event_time || "18:00"}`;
}

function sortEventsBySchedule<T extends Pick<Event, "event_date" | "event_time">>(
  events: T[],
  direction: "asc" | "desc"
): T[] {
  return [...events].sort((left, right) => {
    const comparison = getEventDateTimeKey(left).localeCompare(getEventDateTimeKey(right));
    return direction === "asc" ? comparison : -comparison;
  });
}

function getEventResponseCounts(event: Pick<UpcomingEvent, "allRsvps" | "notResponded">) {
  return {
    yes: event.allRsvps.filter((rsvp) => rsvp.status === "yes").length,
    maybe: event.allRsvps.filter((rsvp) => rsvp.status === "maybe").length,
    no: event.allRsvps.filter((rsvp) => rsvp.status === "no").length,
    pending: event.notResponded?.length || 0,
  };
}

function getUserRsvpBadge(status: string | null | undefined) {
  if (status === "yes") {
    return { label: "You're in", variant: "success" as const };
  }

  if (status === "maybe") {
    return { label: "You're maybe", variant: "warning" as const };
  }

  if (status === "no") {
    return { label: "You're out", variant: "danger" as const };
  }

  return { label: "RSVP needed", variant: "muted" as const };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const [eventsResult, allMembersResult] = await Promise.all([
    db.prepare("SELECT * FROM events ORDER BY event_date DESC").all(),
    db
      .prepare("SELECT id, name, email, picture FROM users WHERE status = ? ORDER BY name ASC")
      .bind("active")
      .all(),
  ]);

  const events = (eventsResult.results || []) as unknown as Event[];
  const allMembers = (allMembersResult.results || []) as unknown as MemberRow[];

  const appTimeZone = getAppTimeZone(context.cloudflare.env.APP_TIMEZONE);
  const upcomingEventsRaw = sortEventsBySchedule(
    events.filter(
      (event) =>
        event.status !== "cancelled" &&
        !isEventInPastInTimeZone(event.event_date, event.event_time || "18:00", appTimeZone)
    ),
    "asc"
  );
  const pastEvents = sortEventsBySchedule(
    events.filter(
      (event) =>
        event.status === "cancelled" ||
        isEventInPastInTimeZone(event.event_date, event.event_time || "18:00", appTimeZone)
    ),
    "desc"
  ).map((event) => ({
    ...event,
    displayStatus: event.status === "cancelled" ? "cancelled" : "completed",
  })) as PastEvent[];

  const upcomingEvents = (await Promise.all(
    upcomingEventsRaw.map(async (event) => {
      const [userRsvp, allRsvpsResult] = await Promise.all([
        db
          .prepare("SELECT * FROM rsvps WHERE event_id = ? AND user_id = ?")
          .bind(event.id, user.id)
          .first(),
        db
          .prepare(`
            SELECT r.*, u.name, u.email, u.picture
            FROM rsvps r
            JOIN users u ON r.user_id = u.id
            WHERE r.event_id = ?
            ORDER BY r.created_at ASC
          `)
          .bind(event.id)
          .all(),
      ]);

      const allRsvps = (allRsvpsResult.results || []) as unknown as RsvpWithUser[];
      const rsvpdUserIds = new Set(allRsvps.map((rsvp) => rsvp.user_id));
      const notResponded = allMembers.filter((member) => !rsvpdUserIds.has(member.id));

      return {
        ...event,
        userRsvp: userRsvp as UpcomingEvent["userRsvp"],
        allRsvps,
        notResponded,
      };
    })
  )) as UpcomingEvent[];

  return { upcomingEvents, pastEvents };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();

  const eventId = formData.get("event_id");
  const status = formData.get("status");
  const comments = formData.get("comments");

  if (!eventId || !status) {
    return { error: "Missing required fields" };
  }

  const result = await upsertRsvp({
    db,
    eventId: Number(eventId),
    userId: user.id,
    status: String(status),
    comments: (comments as string) || null,
  });

  await logActivity({
    db,
    userId: user.id,
    actionType: result === "created" ? "rsvp" : "update_rsvp",
    actionDetails: { event_id: eventId, status, comments },
    route: "/dashboard/events",
    request,
  });

  return { ok: true as const };
}

export default function EventsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = loaderData;
  const [expandedEventId, setExpandedEventId] = useState<number | null>(
    upcomingEvents.length === 1 ? upcomingEvents[0].id : null
  );
  const nextUpcomingEvent = upcomingEvents[0] || null;

  useEffect(() => {
    setExpandedEventId((current) => {
      if (current && upcomingEvents.some((event) => event.id === current)) {
        return current;
      }

      return upcomingEvents.length === 1 ? upcomingEvents[0].id : null;
    });
  }, [upcomingEvents]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="Events"
        description="Upcoming and past Meatup.Club events"
      />

      {actionData?.error ? (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      ) : null}

      <div className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Upcoming Events</h2>
        {upcomingEvents.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description="No upcoming events at the moment. Check back soon!"
          />
        ) : (
          <div className="space-y-6">
            <Card className="border-accent/20 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Upcoming schedule
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    {upcomingEvents.length} upcoming event{upcomingEvents.length === 1 ? "" : "s"}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Each tile shows the date, your RSVP status, and response counts so multiple meetups are easy to scan.
                  </p>
                </div>
                {nextUpcomingEvent ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Next up
                    </p>
                    <p className="mt-1 font-semibold">{nextUpcomingEvent.restaurant_name}</p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDateForDisplay(nextUpcomingEvent.event_date, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {formatTimeForDisplay(nextUpcomingEvent.event_time || "18:00")}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              {upcomingEvents.map((event) => {
                const counts = getEventResponseCounts(event);
                const userRsvpBadge = getUserRsvpBadge(event.userRsvp?.status);
                const goingRsvps = event.allRsvps.filter((rsvp) => rsvp.status === "yes");
                const maybeRsvps = event.allRsvps.filter((rsvp) => rsvp.status === "maybe");
                const declinedRsvps = event.allRsvps.filter((rsvp) => rsvp.status === "no");
                const isExpanded = expandedEventId === event.id;
                const detailsId = `event-details-${event.id}`;
                const titleId = `event-title-${event.id}`;

                return (
                  <Card
                    key={event.id}
                    hover
                    role="article"
                    aria-labelledby={titleId}
                    className="overflow-hidden p-0"
                  >
                    <div className="bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-24 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-center shadow-sm">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                              {formatDateForDisplay(event.event_date, { month: "short" })}
                            </p>
                            <p className="mt-1 text-3xl font-semibold leading-none text-foreground">
                              {formatDateForDisplay(event.event_date, { day: "numeric" })}
                            </p>
                            <p className="mt-1 text-xs font-medium text-muted-foreground">
                              {formatDateForDisplay(event.event_date, { weekday: "short" })}
                            </p>
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="success">Upcoming</Badge>
                              <Badge variant={userRsvpBadge.variant}>{userRsvpBadge.label}</Badge>
                            </div>

                            <div>
                              <h3 id={titleId} className="text-2xl font-semibold text-foreground">
                                {event.restaurant_name}
                              </h3>
                              {event.restaurant_address ? (
                                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <MapPinIcon className="h-4 w-4" />
                                  {event.restaurant_address}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDaysIcon className="h-4 w-4" />
                                {formatDateForDisplay(event.event_date, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <ClockIcon className="h-4 w-4" />
                                {formatTimeForDisplay(event.event_time || "18:00")}
                              </span>
                            </div>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-controls={detailsId}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Hide" : "Open"} details for ${event.restaurant_name}`}
                          onClick={() =>
                            setExpandedEventId((current) => (current === event.id ? null : event.id))
                          }
                        >
                          {isExpanded ? "Hide details" : "Open details"}
                          <ChevronDownIcon
                            className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </Button>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Going
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.yes}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Maybe
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.maybe}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Out
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.no}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Pending
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{counts.pending}</p>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div id={detailsId} className="border-t border-border/60 bg-card/80 p-5 sm:p-6">
                        <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h4 className="font-semibold text-foreground">Your RSVP</h4>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Update your response here without losing your place on the page.
                                </p>
                              </div>
                              <Badge variant={userRsvpBadge.variant}>{userRsvpBadge.label}</Badge>
                            </div>

                            <Form method="post" preventScrollReset className="mt-5 space-y-4">
                              <input type="hidden" name="event_id" value={event.id} />

                              <div>
                                <label className="mb-2 block text-sm font-medium text-foreground">
                                  Will you attend?
                                </label>
                                <div className="flex flex-wrap gap-3">
                                  {["yes", "no", "maybe"].map((option) => (
                                    <label
                                      key={option}
                                      className={`cursor-pointer select-none rounded-md px-4 py-2 font-medium transition-all ${
                                        event.userRsvp?.status === option
                                          ? "bg-accent text-white shadow-sm"
                                          : "border border-border bg-card text-foreground hover:border-accent/50 hover:bg-muted active:scale-95 active:shadow-inner"
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="status"
                                        value={option}
                                        defaultChecked={event.userRsvp?.status === option}
                                        className="sr-only"
                                        onChange={(currentEvent) => {
                                          if (currentEvent.target.checked) {
                                            currentEvent.target.form?.requestSubmit();
                                          }
                                        }}
                                      />
                                      {option.charAt(0).toUpperCase() + option.slice(1)}
                                    </label>
                                  ))}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Click a response to save it immediately.
                                </p>
                              </div>

                              <div>
                                <label
                                  htmlFor={`comments-${event.id}`}
                                  className="mb-2 block text-sm font-medium text-foreground"
                                >
                                  Comments (Optional)
                                </label>
                                <div className="space-y-2">
                                  <textarea
                                    id={`comments-${event.id}`}
                                    name="comments"
                                    defaultValue={event.userRsvp?.comments || ""}
                                    placeholder="Any comments or notes about your attendance"
                                    rows={3}
                                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                                  />
                                  <Button type="submit" size="sm">
                                    Update Comments
                                  </Button>
                                </div>
                              </div>
                            </Form>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold text-foreground">Member responses</h4>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {counts.yes} going, {counts.maybe} maybe, {counts.no} out, {counts.pending} pending.
                              </p>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                              {goingRsvps.length > 0 ? (
                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <Badge variant="success" className="inline-flex items-center gap-1">
                                      <CheckIcon className="h-4 w-4" />
                                      Going
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">{goingRsvps.length}</span>
                                  </div>
                                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                    {goingRsvps.map((rsvp) => (
                                      <div
                                        key={rsvp.id}
                                        className="flex items-center gap-3 rounded-md border border-border/80 bg-muted/40 p-3"
                                      >
                                        <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                        <div className="flex-1">
                                          <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                          {rsvp.comments ? (
                                            <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {maybeRsvps.length > 0 ? (
                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <Badge variant="warning" className="inline-flex items-center gap-1">
                                      ? Maybe
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">{maybeRsvps.length}</span>
                                  </div>
                                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                    {maybeRsvps.map((rsvp) => (
                                      <div
                                        key={rsvp.id}
                                        className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/30 p-3"
                                      >
                                        <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                        <div className="flex-1">
                                          <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                          {rsvp.comments ? (
                                            <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {declinedRsvps.length > 0 ? (
                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <Badge variant="danger" className="inline-flex items-center gap-1">
                                      <XMarkIcon className="h-4 w-4" />
                                      Not Going
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">{declinedRsvps.length}</span>
                                  </div>
                                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                    {declinedRsvps.map((rsvp) => (
                                      <div
                                        key={rsvp.id}
                                        className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 opacity-80"
                                      >
                                        <UserAvatar src={rsvp.picture} name={rsvp.name} email={rsvp.email} />
                                        <div className="flex-1">
                                          <p className="font-medium text-foreground">{rsvp.name || rsvp.email}</p>
                                          {rsvp.comments ? (
                                            <p className="text-sm text-muted-foreground">{rsvp.comments}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {event.notResponded && event.notResponded.length > 0 ? (
                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                                      <ClockIcon className="h-4 w-4" />
                                      No Response Yet
                                    </div>
                                    <span className="text-sm text-muted-foreground">{event.notResponded.length}</span>
                                  </div>
                                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                    {event.notResponded.map((member) => (
                                      <div
                                        key={member.id}
                                        className="flex items-center gap-3 rounded-md border border-border bg-muted/50 p-3 opacity-60"
                                      >
                                        <UserAvatar
                                          src={member.picture}
                                          name={member.name}
                                          email={member.email}
                                          className="grayscale"
                                        />
                                        <p className="font-medium text-muted-foreground">
                                          {member.name || member.email}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Past Events</h2>
        {pastEvents.length === 0 ? (
          <EmptyState title="No past events yet" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pastEvents.map((event) => (
              <Card
                key={event.id}
                role="article"
                aria-labelledby={`past-event-title-${event.id}`}
                className="p-5 opacity-80 transition-opacity hover:opacity-100"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h3 id={`past-event-title-${event.id}`} className="text-xl font-semibold text-foreground">
                        {event.restaurant_name}
                      </h3>
                      <Badge variant={event.displayStatus === "completed" ? "muted" : "danger"}>
                        {event.displayStatus}
                      </Badge>
                    </div>
                    {event.restaurant_address ? (
                      <p className="mb-2 text-sm text-muted-foreground">
                        <MapPinIcon className="inline h-4 w-4" /> {event.restaurant_address}
                      </p>
                    ) : null}
                    <p className="text-base text-foreground">
                      <CalendarDaysIcon className="mr-1 inline h-4 w-4" />
                      {formatDateForDisplay(event.event_date, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      at {formatTimeForDisplay(event.event_time || "18:00")}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
