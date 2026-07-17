import { initTRPC, TRPCError } from "@trpc/server";
import type { AppContext } from "./context.js";

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Utente autenticato con account (non sospeso). */
export const userProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.actor.kind !== "user") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.actor.suspended) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account sospeso" });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } });
});

/** Utente con email verificata: richiesto da claim, profilo e organizzazioni. */
export const verifiedProcedure = userProcedure.use(({ ctx, next }) => {
  if (!ctx.actor.emailVerified) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Email non verificata",
    });
  }
  return next();
});

/** Platform Admin (BR-70). Le azioni chiamate da qui vanno sempre in audit. */
export const adminProcedure = userProcedure.use(({ ctx, next }) => {
  if (!ctx.actor.platformAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
