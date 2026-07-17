import { router } from "../trpc.js";
import { adminRouter } from "./admin.js";
import { authRouter } from "./auth.js";
import { entriesRouter } from "./entries.js";
import { feesRouter } from "./fees.js";
import { inviteRouter } from "./invite.js";
import { eventsRouter, orgRouter } from "./org.js";
import { profileRouter } from "./profile.js";
import { rosterRouter } from "./roster.js";

export const appRouter = router({
  auth: authRouter,
  profile: profileRouter,
  org: orgRouter,
  events: eventsRouter,
  roster: rosterRouter,
  entries: entriesRouter,
  fees: feesRouter,
  invite: inviteRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
