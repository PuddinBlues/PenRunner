import { router } from "../trpc.js";
import { adminRouter } from "./admin.js";
import { auditRouter } from "./audit.js";
import { authRouter } from "./auth.js";
import { catalogRouter } from "./catalog.js";
import { classesRouter } from "./classes.js";
import { drawRouter } from "./draw.js";
import { entriesRouter } from "./entries.js";
import { feesRouter } from "./fees.js";
import { inviteRouter } from "./invite.js";
import { eventsRouter, orgRouter } from "./org.js";
import { profileRouter } from "./profile.js";
import { rosterRouter } from "./roster.js";
import { liveRouter } from "./live.js";
import { payoutRouter } from "./payout.js";
import { scoringRouter } from "./scoring.js";

export const appRouter = router({
  auth: authRouter,
  profile: profileRouter,
  org: orgRouter,
  events: eventsRouter,
  catalog: catalogRouter,
  classes: classesRouter,
  audit: auditRouter,
  roster: rosterRouter,
  entries: entriesRouter,
  draw: drawRouter,
  scoring: scoringRouter,
  live: liveRouter,
  payout: payoutRouter,
  fees: feesRouter,
  invite: inviteRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
