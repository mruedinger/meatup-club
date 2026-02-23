# Meatup.Club

Private web app for organizing quarterly steakhouse meetups.

## Current Stack

- React Router 7 (SSR)
- Cloudflare Workers + D1
- TypeScript + Tailwind CSS
- Google OAuth (custom session auth)
- Resend (email + inbound RSVP webhook)
- Twilio (SMS reminders + reply RSVP)

## Repository Layout

- `app/` - Runtime application, tests, migrations, Worker entrypoint
- `terraform/` - Cloudflare infrastructure as code
- `schema.sql` - Canonical fresh-install D1 schema
- `migrations/` - Historical root-level schema migrations

## Start Here

1. Read `/Users/jspahr/repo/meatup-club/app/README.md` for setup and deployment.
2. From `/Users/jspahr/repo/meatup-club/app`, run:
   - `npm run dev`
   - `npm run typecheck`
   - `npm run test:run`

## Database Guidance

- Fresh install: apply `/Users/jspahr/repo/meatup-club/schema.sql`.
- Existing older environments: apply historical migrations deliberately (`/Users/jspahr/repo/meatup-club/migrations` and `/Users/jspahr/repo/meatup-club/app/migrations`) based on current state.

## Notes

- Production deploys run from GitHub Actions on pushes to `main`.
- Route manifest is defined in `/Users/jspahr/repo/meatup-club/app/app/routes.ts`.
