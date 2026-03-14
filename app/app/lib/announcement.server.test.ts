import { describe, expect, it } from "vitest";
import {
  getActiveAnnouncementAdminByEmail,
  listActiveAnnouncementMembers,
  selectAnnouncementRecipientsByEmails,
  selectAnnouncementRecipientsByUserIds,
  type ActiveAnnouncementMember,
} from "./announcement.server";

function createMockDb() {
  const members = [
    { id: 1, name: "Jeff", email: "spahrj@gmail.com", status: "active", is_admin: 1 },
    { id: 2, name: "Megan", email: "mruedinger@gmail.com", status: "active", is_admin: 1 },
    { id: 3, name: "Wes", email: "wes@example.com", status: "active", is_admin: 0 },
    { id: 4, name: "Paused", email: "paused@example.com", status: "inactive", is_admin: 0 },
  ];

  return {
    prepare(sql: string) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();

      return {
        all: async () => {
          if (
            normalizedSql.includes("SELECT id, name, email") &&
            normalizedSql.includes("WHERE status = 'active'")
          ) {
            return {
              results: members
                .filter((member) => member.status === "active")
                .map(({ id, name, email }) => ({ id, name, email })),
            };
          }

          throw new Error(`Unexpected all() query: ${normalizedSql}`);
        },
        bind: (...bindArgs: unknown[]) => ({
          first: async () => {
            if (
              normalizedSql.includes("WHERE lower(email) = ?") &&
              normalizedSql.includes("status = 'active'") &&
              normalizedSql.includes("is_admin = 1")
            ) {
              const email = String(bindArgs[0] || "").toLowerCase();
              const match = members.find(
                (member) =>
                  member.email.toLowerCase() === email &&
                  member.status === "active" &&
                  member.is_admin === 1
              );

              if (!match) {
                return null;
              }

              return {
                id: match.id,
                name: match.name,
                email: match.email,
              };
            }

            throw new Error(`Unexpected first() query: ${normalizedSql}`);
          },
        }),
      };
    },
  };
}

describe("announcement.server", () => {
  it("lists only active members", async () => {
    const members = await listActiveAnnouncementMembers(createMockDb() as never);

    expect(members).toEqual([
      { id: 1, name: "Jeff", email: "spahrj@gmail.com" },
      { id: 2, name: "Megan", email: "mruedinger@gmail.com" },
      { id: 3, name: "Wes", email: "wes@example.com" },
    ]);
  });

  it("selects recipients by user ids", () => {
    const members: ActiveAnnouncementMember[] = [
      { id: 1, name: "Jeff", email: "spahrj@gmail.com" },
      { id: 2, name: "Megan", email: "mruedinger@gmail.com" },
      { id: 3, name: "Wes", email: "wes@example.com" },
    ];

    expect(selectAnnouncementRecipientsByUserIds(members, [3, 1, 999])).toEqual([
      { id: 1, name: "Jeff", email: "spahrj@gmail.com" },
      { id: 3, name: "Wes", email: "wes@example.com" },
    ]);
  });

  it("selects recipients by email case-insensitively and reports unknown emails", () => {
    const members: ActiveAnnouncementMember[] = [
      { id: 1, name: "Jeff", email: "spahrj@gmail.com" },
      { id: 2, name: "Wes", email: "wes@example.com" },
    ];

    expect(
      selectAnnouncementRecipientsByEmails(members, [
        "SPAHRJ@gmail.com",
        "wes@example.com",
        "wes@example.com",
        "missing@example.com",
      ])
    ).toEqual({
      recipients: [
        { id: 1, name: "Jeff", email: "spahrj@gmail.com" },
        { id: 2, name: "Wes", email: "wes@example.com" },
      ],
      missingEmails: ["missing@example.com"],
    });
  });

  it("finds an active admin sender by email", async () => {
    await expect(
      getActiveAnnouncementAdminByEmail(createMockDb() as never, "SPAHRJ@gmail.com")
    ).resolves.toEqual({
      id: 1,
      name: "Jeff",
      email: "spahrj@gmail.com",
    });

    await expect(
      getActiveAnnouncementAdminByEmail(createMockDb() as never, "wes@example.com")
    ).resolves.toBeNull();
  });
});
