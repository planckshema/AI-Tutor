import { pgTable, serial, text, integer, timestamp, jsonb, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { problemsTable } from "./problems";

// The learner model — tracks who the student is and what they know
export const learnerProfilesTable = pgTable("learner_profiles", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(), // UUID from client localStorage
  displayName: text("display_name").notNull().default("Student"),
  // Knowledge state: arrays of topic tags
  knownTopics: jsonb("known_topics").notNull().default("[]"),       // topics the learner is fluent in
  struggledTopics: jsonb("struggled_topics").notNull().default("[]"), // topics they found difficult
  // Aggregate stats
  totalSolved: integer("total_solved").notNull().default(0),
  totalAttempted: integer("total_attempted").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-problem state for a learner
export const learnerProblemStatesTable = pgTable(
  "learner_problem_states",
  {
    id: serial("id").primaryKey(),
    learnerId: integer("learner_id")
      .notNull()
      .references(() => learnerProfilesTable.id),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problemsTable.id),
    status: text("status").notNull().default("unseen"), // unseen | attempted | solved
    hintsUsed: integer("hints_used").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    lastCode: text("last_code").notNull().default(""),
    confidenceScore: real("confidence_score"), // 0.0–1.0, assessed by AI
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("learner_problem_unique").on(t.learnerId, t.problemId)],
);

// Chat message history per learner + problem session
export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  learnerId: integer("learner_id")
    .notNull()
    .references(() => learnerProfilesTable.id),
  problemId: integer("problem_id")
    .notNull()
    .references(() => problemsTable.id),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLearnerProfileSchema = createInsertSchema(learnerProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLearnerProblemStateSchema = createInsertSchema(learnerProblemStatesTable).omit({ id: true });
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });

export type LearnerProfile = typeof learnerProfilesTable.$inferSelect;
export type LearnerProblemState = typeof learnerProblemStatesTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type InsertLearnerProfile = z.infer<typeof insertLearnerProfileSchema>;
