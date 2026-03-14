export interface AnnouncementDraft {
  id: string;
  title: string;
  description: string;
  subject: string;
  messageText: string;
}

export const announcementDrafts: AnnouncementDraft[] = [
  {
    id: "calendar-invite-postmortem-2026-03-13",
    title: "Calendar Invite Postmortem",
    description:
      "The member-facing write-up for the March 7, 2026 calendar invite delivery incident.",
    subject: "Postmortem: March 7 calendar invite delivery issue",
    messageText: `# Postmortem: Calendar invite delivery issue for March 7, 2026 event creation

On March 7, 2026, MeatUp created two new events:
- \`Angus Barn\` for March 18, 2026 at 7:00 PM EDT
- \`TBD - Soo's Cafe?\` for April 17, 2026 at 7:00 PM EDT

The initial calendar invite emails for those events did not reach all active members. Instead, the first sends only reached the two admin accounts, while nine non-admin active members were missed for each event.

We are very sorry this happened. Members should be able to trust that when an event is created, the invite will reliably reach them. In particular, we owe a sincere apology to **Wes Luttrell**, who was especially affected by this issue and by the follow-up recovery work. This was our mistake, not yours.

## What was impacted?

The impact was limited to the initial calendar invite email delivery for the two events above.

What was not impacted:
- Event records were created correctly
- RSVP data was not lost
- Member data was not lost
- The issue was with invite delivery, not with the events themselves

In plain English: the steak was on the menu, but the reservation system only called the head table.

## What happened

The original event-invite flow sent one email request per recipient inside a background task after the event was created. That background task was not durable, and in this case it stopped before it finished sending to all active members.

In production, the active-user query returned the two admin accounts first. Because the background send stopped early, those were the only two recipients who received the initial invites. The system did not intentionally target admins; it simply stopped after the first two rows.

While fixing that, we uncovered a second issue during resend testing. The new resend path initially sent multiple outbound email API requests in parallel, which hit Resend's rate limits and caused some resend attempts to show as \`Retrying\`. That was a separate issue from the original incident, but it affected recovery and needed to be fixed as well.

## Root cause

There were two root causes:

1. The original invite system relied on request-time background execution rather than durable delivery tracking.
2. The resend pipeline initially sent email too aggressively for the provider's rate limits.

More specifically:
- The old implementation could partially complete without leaving a durable record of which members were supposed to receive the invite.
- The resend implementation initially burst too many requests at once, which Resend rejected with \`429 Too Many Requests\`.

This was a system design failure, not a one-person mistake. We had a workflow that was good enough for a small table, but not reliable enough for the whole steakhouse.

## Timeline

- **March 7, 2026 6:55 PM EST**: \`Angus Barn\` event created
- **March 7, 2026 6:57 PM EST**: \`TBD - Soo's Cafe?\` event created
- **March 7, 2026**: Initial invites only reached the two admin recipients
- **March 12, 2026**: Investigation confirmed production had 11 active users, but only 2 invite deliveries per affected event
- **March 13, 2026**: Durable event email delivery pipeline deployed
- **March 13, 2026**: Targeted resend tooling deployed
- **March 13, 2026**: Queue pacing and provider-aware retry handling deployed after identifying resend rate limiting
- **March 13, 2026 2:46 AM EDT**: Production verification showed the resend batches for both affected events had fully delivered to the previously missed members

## Resolution

We changed the event email system to make delivery durable and auditable.

We:
- Added a persistent delivery record for each intended recipient before any email is sent
- Moved event invite/update/cancel delivery to a Cloudflare Queue-backed pipeline
- Added delivery status tracking using provider message IDs and webhooks
- Added admin resend tools to send to:
  - only missing recipients
  - a selected subset of recipients
  - all active recipients
- Reduced queue send concurrency to one paced stream
- Added one-request-per-second spacing for event emails
- Honored provider retry guidance such as \`Retry-After\` headers

## What we are doing to prevent this from happening again

Going forward:
- Event email delivery intent is now persisted before send attempts begin
- Partial sends are visible and diagnosable in the database
- Provider acceptance and delivery state are tracked explicitly
- Resends no longer rely on a burst of parallel API calls
- The system can safely retry without losing track of who should have received what

## Current status

This incident is resolved.

As of **March 13, 2026 2:46 AM EDT**, both affected resend batches had fully delivered to the previously missed members:
- \`Angus Barn\`: 9 update deliveries delivered
- \`TBD - Soo's Cafe?\`: 9 update deliveries delivered

## Closing

We should have caught this class of failure sooner, and we should have had better delivery visibility before members had to tell us something was wrong. We appreciate everyone's patience while we tracked it down and fixed it properly.

Again, we are sorry, especially to **Wes Luttrell** and to every member who missed an invite they should have received.`,
  },
];

export function getAnnouncementDraftById(draftId: string): AnnouncementDraft | null {
  return announcementDrafts.find((draft) => draft.id === draftId) || null;
}
