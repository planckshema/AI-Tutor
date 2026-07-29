import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  learnerProfilesTable,
  learnerProblemStatesTable,
  chatMessagesTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

/**
 * Resolve or create a learner profile from the X-Session-ID header.
 * Returns null and sends 400 if the header is missing.
 */
async function resolveOrCreateLearner(req: Request, res: Response) {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
    res.status(400).json({ error: "X-Session-ID header is required" });
    return null;
  }

  // Upsert: find existing or create new profile
  let profile = await db.query.learnerProfilesTable.findFirst({
    where: eq(learnerProfilesTable.sessionId, sessionId),
  });

  if (!profile) {
    const [created] = await db
      .insert(learnerProfilesTable)
      .values({ sessionId, lastActiveAt: new Date() })
      .returning();
    profile = created;
  } else {
    // Touch lastActiveAt
    await db
      .update(learnerProfilesTable)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(learnerProfilesTable.id, profile.id));
  }

  return profile;
}

// GET /api/learner — fetch or create learner profile + all problem states
router.get("/learner", async (req: Request, res: Response) => {
  const profile = await resolveOrCreateLearner(req, res);
  if (!profile) return;

  const problemStates = await db
    .select()
    .from(learnerProblemStatesTable)
    .where(eq(learnerProblemStatesTable.learnerId, profile.id));

  res.json({ profile, problemStates });
});

// PATCH /api/learner — update display name or knowledge state
router.patch("/learner", async (req: Request, res: Response) => {
  const profile = await resolveOrCreateLearner(req, res);
  if (!profile) return;

  const { displayName, knownTopics, struggledTopics } = req.body as {
    displayName?: string;
    knownTopics?: string[];
    struggledTopics?: string[];
  };

  // Pass arrays directly — Drizzle serialises them to JSONB correctly.
  // Manually JSON.stringify-ing here would double-encode and produce a string in the JSONB column.
  const [updated] = await db
    .update(learnerProfilesTable)
    .set({
      ...(displayName !== undefined ? { displayName } : {}),
      ...(knownTopics !== undefined ? { knownTopics } : {}),
      ...(struggledTopics !== undefined ? { struggledTopics } : {}),
      updatedAt: new Date(),
    })
    .where(eq(learnerProfilesTable.id, profile.id))
    .returning();

  res.json({ profile: updated });
});

// POST /api/learner/attempt — record or update a problem attempt
router.post("/learner/attempt", async (req: Request, res: Response) => {
  const profile = await resolveOrCreateLearner(req, res);
  if (!profile) return;

  const { problemId, status, lastCode, hintsUsed, confidenceScore } = req.body as {
    problemId: number;
    status?: "attempted" | "solved";
    lastCode?: string;
    hintsUsed?: number;
    confidenceScore?: number;
  };

  if (!problemId || typeof problemId !== "number") {
    res.status(400).json({ error: "problemId is required" });
    return;
  }

  // Find existing state
  const existing = await db.query.learnerProblemStatesTable.findFirst({
    where: and(
      eq(learnerProblemStatesTable.learnerId, profile.id),
      eq(learnerProblemStatesTable.problemId, problemId),
    ),
  });

  if (existing) {
    const wasSolved = existing.status === "solved";
    const nowSolved = status === "solved" && !wasSolved;

    const [updated] = await db
      .update(learnerProblemStatesTable)
      .set({
        status: status ?? existing.status,
        lastCode: lastCode ?? existing.lastCode,
        hintsUsed: hintsUsed ?? existing.hintsUsed,
        attempts: existing.attempts + 1,
        ...(confidenceScore !== undefined ? { confidenceScore } : {}),
        updatedAt: new Date(),
      })
      .where(eq(learnerProblemStatesTable.id, existing.id))
      .returning();

    // Update aggregate counters on the profile
    if (nowSolved) {
      await db
        .update(learnerProfilesTable)
        .set({
          totalSolved: profile.totalSolved + 1,
          totalAttempted: profile.totalAttempted,
          updatedAt: new Date(),
        })
        .where(eq(learnerProfilesTable.id, profile.id));
    }

    res.json({ state: updated });
  } else {
    const [created] = await db
      .insert(learnerProblemStatesTable)
      .values({
        learnerId: profile.id,
        problemId,
        status: status ?? "attempted",
        lastCode: lastCode ?? "",
        hintsUsed: hintsUsed ?? 0,
        attempts: 1,
        ...(confidenceScore !== undefined ? { confidenceScore } : {}),
        updatedAt: new Date(),
      })
      .returning();

    await db
      .update(learnerProfilesTable)
      .set({
        totalAttempted: profile.totalAttempted + 1,
        ...(status === "solved" ? { totalSolved: profile.totalSolved + 1 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(learnerProfilesTable.id, profile.id));

    res.json({ state: created });
  }
});

// GET /api/learner/history/:problemId — fetch chat history for a problem
router.get("/learner/history/:problemId", async (req: Request, res: Response) => {
  const profile = await resolveOrCreateLearner(req, res);
  if (!profile) return;

  const problemId = Number(req.params.problemId);
  if (isNaN(problemId)) {
    res.status(400).json({ error: "Invalid problemId" });
    return;
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.learnerId, profile.id),
        eq(chatMessagesTable.problemId, problemId),
      ),
    )
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(40);

  res.json({ messages: messages.reverse() });
});

export default router;
