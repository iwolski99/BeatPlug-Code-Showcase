import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, json, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const producers = pgTable("producers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const beats = pgTable("beats", {
  id: varchar("id").primaryKey(),
  title: text("title").notNull(),
  producerId: varchar("producer_id").references(() => producers.id).notNull(),
  genre: text("genre").notNull(),
  bpm: integer("bpm").notNull(),
  key: text("key").notNull(),
  mood: text("mood").notNull(),
  standardPrice: decimal("standard_price", { precision: 10, scale: 2 }).notNull().default("29.99"),
  premiumPrice: decimal("premium_price", { precision: 10, scale: 2 }).notNull().default("59.99"),
  exclusivePrice: decimal("exclusive_price", { precision: 10, scale: 2 }).notNull().default("99.99"),
  artworkUrl: text("artwork_url"),
  audioFileUrl: text("audio_file_url").notNull(),
  waveformData: json("waveform_data").$type<number[]>(),
  duration: integer("duration"),
  plays: integer("plays").default(0),
  downloads: integer("downloads").default(0),
  hasWav: boolean("has_wav").default(false).notNull(),
  featured: boolean("featured").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  beatId: varchar("beat_id").references(() => beats.id).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  licenseType: text("license_type").notNull().default("standard"),
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  beatId: varchar("beat_id").references(() => beats.id).notNull(),
  licenseType: text("license_type").notNull().default("standard"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sessionBeatUnique: uniqueIndex("cart_session_beat_unique").on(table.sessionId, table.beatId),
}));

export type Beat = typeof beats.$inferSelect;
export type Producer = typeof producers.$inferSelect;
export type BeatWithProducer = Beat & {
  producer: Producer;
};

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));

export const producersRelations = relations(producers, ({ many }) => ({
  beats: many(beats),
}));
