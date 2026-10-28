import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Security metadata only: no company/project content or generated briefs.
export const planningGuards = mysqlTable("planning_guards", {
  keyHash: varchar("keyHash", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["token", "idempotency"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export const planningRates = mysqlTable("planning_rates", {
  keyHash: varchar("keyHash", { length: 64 }).primaryKey(),
  count: int("count").notNull().default(0),
  expiresAt: timestamp("expiresAt").notNull(),
});
