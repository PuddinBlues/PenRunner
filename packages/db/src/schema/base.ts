import { timestamp, uuid } from "drizzle-orm/pg-core";

// Convenzione del data model: ogni entità ha id UUID + created_at/updated_at.
export const baseColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
