import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@penrunner/db";
import { generateToken, hashToken } from "./crypto.js";

export const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni

export async function createUserSession(db: Db, userId: string) {
  const token = generateToken();
  await db.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + USER_SESSION_TTL_MS),
  });
  return token;
}

export async function createInviteSession(
  db: Db,
  inviteId: string,
  expiresAt: Date,
) {
  const token = generateToken();
  await db.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    inviteId,
    expiresAt,
  });
  return token;
}

export async function revokeSession(db: Db, sessionId: string) {
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

/** Revoca tutte le sessioni attive di uno user (reset password, sospensione). */
export async function revokeAllUserSessions(db: Db, userId: string) {
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
      ),
    );
}
