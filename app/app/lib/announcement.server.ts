import type { D1Database } from "./db.server";

export interface ActiveAnnouncementMember {
  id: number;
  name: string | null;
  email: string;
}

export interface AnnouncementAdminSender {
  id: number;
  name: string | null;
  email: string;
}

export async function listActiveAnnouncementMembers(
  db: D1Database
): Promise<ActiveAnnouncementMember[]> {
  const membersResult = await db
    .prepare(
      `
        SELECT id, name, email
        FROM users
        WHERE status = 'active'
        ORDER BY
          CASE
            WHEN name IS NULL OR TRIM(name) = '' THEN email
            ELSE name
          END COLLATE NOCASE ASC
      `
    )
    .all();

  return (membersResult.results || []) as unknown as ActiveAnnouncementMember[];
}

export function selectAnnouncementRecipientsByUserIds(
  members: ActiveAnnouncementMember[],
  userIds: number[]
): ActiveAnnouncementMember[] {
  const selectedUserIds = new Set(userIds);
  return members.filter((member) => selectedUserIds.has(member.id));
}

export function selectAnnouncementRecipientsByEmails(
  members: ActiveAnnouncementMember[],
  emails: string[]
): {
  recipients: ActiveAnnouncementMember[];
  missingEmails: string[];
} {
  const membersByEmail = new Map(
    members.map((member) => [member.email.trim().toLowerCase(), member] as const)
  );
  const uniqueEmails = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );

  const recipients: ActiveAnnouncementMember[] = [];
  const missingEmails: string[] = [];

  for (const email of uniqueEmails) {
    const member = membersByEmail.get(email);
    if (member) {
      recipients.push(member);
    } else {
      missingEmails.push(email);
    }
  }

  return { recipients, missingEmails };
}

export async function getActiveAnnouncementAdminByEmail(
  db: D1Database,
  email: string
): Promise<AnnouncementAdminSender | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const row = await db
    .prepare(
      `
        SELECT id, name, email
        FROM users
        WHERE lower(email) = ?
          AND status = 'active'
          AND is_admin = 1
        LIMIT 1
      `
    )
    .bind(normalizedEmail)
    .first();

  return (row as AnnouncementAdminSender | null) ?? null;
}
