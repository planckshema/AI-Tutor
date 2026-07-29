import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./courses";

export type Difficulty = "easy" | "medium" | "hard";

export type ProblemExample = {
  input: string;
  output: string;
  explanation?: string;
};

export const problemsTable = pgTable("problems", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id")
    .notNull()
    .references(() => unitsTable.id),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  difficulty: text("difficulty").notNull().default("medium"), // easy | medium | hard
  description: text("description").notNull(),
  examples: jsonb("examples").notNull().default("[]"), // ProblemExample[]
  constraints: jsonb("constraints").notNull().default("[]"), // string[]
  starterCode: text("starter_code").notNull().default(""),
  solutionCode: text("solution_code").notNull().default(""),
  tags: jsonb("tags").notNull().default("[]"), // string[]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProblemSchema = createInsertSchema(problemsTable).omit({ id: true, createdAt: true });

export type Problem = typeof problemsTable.$inferSelect;
export type InsertProblem = z.infer<typeof insertProblemSchema>;
