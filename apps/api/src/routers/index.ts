import { router } from "../trpc.js";
import { adminRouter } from "./admin.js";
import { authRouter } from "./auth.js";
import { drawRouter } from "./draw.js";
import { entriesRouter } from "./entries.js";
import { feesRouter } from "./fees.js";
import { inviteRouter } from "./invite.js";
import { eventsRouter, orgRouter } from "./org.js";
import { profileRouter } from "./profile.js";
import { rosterRouter } from "./roster.js";
import { liveRouter } from "./live.js";
import { scoringRouter } from "./scoring.js";

export const appRouter = router({
  auth: authRouter,
  profile: profileRouter,
  org: orgRouter,
  events: eventsRouter,
  roster: rosterRouter,
  entries: entriesRouter,
  draw: drawRouter,
  scoring: scoringRouter,
  live: liveRouter,
  fees: feesRouter,
  invite: inviteRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
