# Post-Baseline D1 Migrations

Baseline policy (effective 2026-02-23):

- Use `/Users/jspahr/repo/meatup-club/schema.sql` to bootstrap new databases.
- Legacy pre-baseline migrations were removed from the active tree.
- Add only forward, additive migrations here for changes after the baseline snapshot.

Operational rules:

- Existing environments: apply new files in this folder with `wrangler d1 migrations apply`.
- Fresh environments: run `wrangler d1 execute ... --file=../schema.sql` first, then apply any newer migrations from this folder.
- Do not modify or rewrite applied migration files; add a new migration instead.
