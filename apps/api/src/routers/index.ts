import { router } from "../trpc.js";
import { adminRouter } from "./admin.js";
import { authRouter } from "./auth.js";
import { inviteRouter } from "./invite.js";
import { eventsRouter, orgRouter } from "./org.js";
import { profileRouter } from "./profile.js";

export const appRouter = router({
  auth: authRouter,
  profile: profileRouter,
  org: orgRouter,
  events: eventsRouter,
  invite: inviteRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
