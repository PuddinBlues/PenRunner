import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@penrunner/db";
import type { Actor } from "./policy/policy.js";
import { hashToken } from "./services/crypto.js";
import type { Mailer } from "./services/mailer.js";

export interface AppContext {
  db: Db;
  mailer: Mailer;
  actor: Actor;
  /** id della sessione corrente, se autenticata (serve al logout) */
  sessionId?: string;
  /** IP del client (trustProxy) — chiave del rate-limit auth; assente nei test unitari */
  ip?: string;
}

export async function resolveActor(
  db: Db,
  sessionToken: string | undefined,
): Promise<{ actor: Actor; sessionId?: string }> {
  const anonymous = { actor: { kind: "anonymous" } as const };
  if (!sessionToken) return anonymous;

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.tokenHash, hashToken(sessionToken)));
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return anonymous;
  }

  if (session.userId) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId));
    if (!user) return anonymous;

    const memberships = user.personId
      ? await db
          .select({
            organizationId: schema.organizationMembers.organizationId,
            role: schema.organizationMembers.role,
            vettingStatus: schema.organizations.vettingStatus,
          })
          .from(schema.organizationMembers)
          .innerJoin(
            schema.organizations,
            eq(
              schema.organizations.id,
              schema.organizationMembers.organizationId,
            ),
          )
          .where(eq(schema.organizationMembers.personId, user.personId))
      : [];

    const referentStables = user.personId
      ? await db
          .select({ id: schema.stables.id })
          .from(schema.stables)
          .where(eq(schema.stables.referentId, user.personId))
      : [];

    return {
      sessionId: session.id,
      actor: {
        kind: "user",
        userId: user.id,
        personId: user.personId,
        emailVerified: user.emailVerifiedAt !== null,
        suspended: user.suspendedAt !== null,
        platformAdmin: user.platformAdmin,
        organizations: memberships.map((m) => ({
          organizationId: m.organizationId,
          role: m.role,
          vetted: m.vettingStatus === "verificata",
        })),
        referentOfStableIds: referentStables.map((s) => s.id),
      },
    };
  }

  // Sessione da invito event-scoped (giudice/scribe/segreteria).
  const [row] = await db
    .select({
      invite: schema.eventInvites,
      assignment: schema.eventRoleAssignments,
    })
    .from(schema.eventInvites)
    .innerJoin(
      schema.eventRoleAssignments,
      eq(schema.eventRoleAssignments.id, schema.eventInvites.assignmentId),
    )
    .where(
      and(
        eq(schema.eventInvites.id, session.inviteId!),
        isNull(schema.eventInvites.revokedAt),
        isNull(schema.eventRoleAssignments.deactivatedAt),
      ),
    );
  if (!row) return anonymous;

  return {
    sessionId: session.id,
    actor: {
      kind: "invite",
      personId: row.assignment.personId,
      eventId: row.assignment.eventId,
      role: row.assignment.role,
      classIds: row.assignment.classId ? [row.assignment.classId] : null,
    },
  };
}
