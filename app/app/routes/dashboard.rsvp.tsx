import { redirect } from "react-router";
import type { Route } from "./+types/dashboard.rsvp";

/**
 * TEMPORARY BACKWARD COMPATIBILITY REDIRECT (2025-12-29)
 *
 * This route redirects /dashboard/rsvp -> /dashboard/events
 *
 * WHY: The RSVP and Events sections have been merged into a single Events page.
 * Calendar invites sent before this change contain RSVP links pointing to /dashboard/rsvp.
 * This redirect ensures those links continue to work.
 *
 * Keep this redirect in place for backward compatibility with historical calendar links.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return redirect('/dashboard/events');
}

export async function action({ request }: Route.ActionArgs) {
  return redirect('/dashboard/events');
}
