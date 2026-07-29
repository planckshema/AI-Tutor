import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id")
    .notNull()
    .references(() => coursesTable.id),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true });
export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true });

export type Course = typeof coursesTable.$inferSelect;
export type Unit = typeof unitsTable.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type InsertUnit = z.infer<typeof insertUnitSchema>;
