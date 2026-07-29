import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import {
  learnerProfilesTable,
  learnerProblemStatesTable,
  chatMessagesTable,
  problemsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Resolve the learner profile from X-Session-ID.
 * Returns null (without sending a response) if the header is absent.
 * This is the authoritative identity source — never trust learnerId from the body.
 */
async function resolveLearnerFromSession(sessionId: string | undefined) {
  if (!sessionId) return null;
  return db.query.learnerProfilesTable.findFirst({
    where: eq(learnerProfilesTable.sessionId, sessionId),
  });
}

const router = Router();

/**
 * Build the AI system prompt dynamically, injecting:
 * - Course context (TIP101 Technical Interview Prep)
 * - Current problem details
 * - Learner model (known topics, struggled topics, problem history)
 *
 * Engineering decision: the system prompt is rebuilt per-request so the AI
 * always has fresh context about the learner without requiring the client to
 * send the full state on every message.
 */
async function buildSystemPrompt(
  learnerId: number | null,
  problemId: number | null,
): Promise<string> {
  const lines: string[] = [
    `You are an expert AI tutor for TIP101 — a Technical Interview Prep course covering data structures and algorithms.`,
    ``,
    `Your role: Guide students to solve problems themselves through Socratic questioning. Never give away the full solution directly.`,
    `Teaching philosophy:`,
    `- Ask clarifying questions to understand the student's thinking`,
    `- Give targeted hints that unblock without revealing the answer`,
    `- When asked to Review code, identify bugs and suggest improvements without rewriting it for them`,
    `- When asked for an Approach, describe a high-level strategy (e.g. "Consider using a hash map to track…") but stop short of full code`,
    `- Celebrate small wins and encourage when they struggle`,
    `- Be concise — no long lectures unless the student asks`,
    ``,
  ];

  // Inject current problem context
  if (problemId) {
    try {
      const problem = await db.query.problemsTable.findFirst({
        where: eq(problemsTable.id, problemId),
      });
      if (problem) {
        lines.push(`## Current Problem`);
        lines.push(`Title: ${problem.title}`);
        lines.push(`Difficulty: ${problem.difficulty}`);
        lines.push(`Tags: ${(problem.tags as string[]).join(", ")}`);
        lines.push(`Description: ${problem.description}`);
        lines.push(``);
      }
    } catch {
      // non-fatal — continue without problem context
    }
  }

  // Inject learner model context
  if (learnerId) {
    try {
      const profile = await db.query.learnerProfilesTable.findFirst({
        where: eq(learnerProfilesTable.id, learnerId),
      });
      if (profile) {
        const known = profile.knownTopics as string[];
        const struggled = profile.struggledTopics as string[];

        lines.push(`## Learner Profile for ${profile.displayName}`);
        lines.push(`Problems solved: ${profile.totalSolved} / ${profile.totalAttempted} attempted`);
        if (known.length > 0) lines.push(`Topics they're fluent in: ${known.join(", ")}`);
        if (struggled.length > 0) lines.push(`Topics they've struggled with: ${struggled.join(", ")} — be extra supportive on these`);
        lines.push(``);

        // Include problem-specific state if we know the current problem
        if (problemId) {
          const state = await db.query.learnerProblemStatesTable.findFirst({
            where: and(
              eq(learnerProblemStatesTable.learnerId, learnerId),
              eq(learnerProblemStatesTable.problemId, problemId),
            ),
          });
          if (state) {
            lines.push(`## Student's progress on this problem`);
            lines.push(`Status: ${state.status}, Attempts: ${state.attempts}, Hints used: ${state.hintsUsed}`);
            if (state.lastCode) {
              lines.push(`Their last submitted code:`);
              lines.push("```");
              lines.push(state.lastCode);
              lines.push("```");
            }
            lines.push(``);
          }
        }
      }
    } catch {
      // non-fatal — continue without learner context
    }
  }

  lines.push(`Respond in plain text. Use markdown code blocks for code. Be encouraging but rigorous.`);

  return lines.join("\n");
}

router.post("/chat", async (req: Request, res: Response) => {
  const { messages, problemId } = req.body as {
    messages?: unknown;
    problemId?: number;
  };

  // Derive learner identity server-side from X-Session-ID — never trust learnerId from the body.
  const sessionId = req.headers["x-session-id"] as string | undefined;
  const learnerRecord = await resolveLearnerFromSession(sessionId);
  const learnerId = learnerRecord?.id ?? null;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    req.log.warn("AI_API_KEY not configured");
    res.status(503).json({
      error: "AI API key not configured on the server. Please set the AI_API_KEY environment secret.",
    });
    return;
  }

  try {
    const systemPrompt = await buildSystemPrompt(learnerId ?? null, problemId ?? null);

    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...(messages as Array<{ role: "user" | "assistant"; content: string }>),
      ],
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      res.status(500).json({ error: "No response received from AI model" });
      return;
    }

    // Persist the exchange to chat history if we have learner + problem context.
    // learnerId is resolved server-side from X-Session-ID, so no spoofing is possible.
    if (learnerId && problemId) {
      try {
        const lastUserMessage = [...(messages as Array<{ role: string; content: string }>)]
          .reverse()
          .find((m) => m.role === "user");

        if (lastUserMessage) {
          await db.insert(chatMessagesTable).values([
            { learnerId, problemId, role: "user", content: lastUserMessage.content },
            { learnerId, problemId, role: "assistant", content: message.content ?? "" },
          ]);
        }
      } catch {
        // non-fatal — message still returned to client
      }
    }

    res.json({
      message: { role: message.role, content: message.content ?? "" },
    });
  } catch (err: unknown) {
    req.log.error({ err }, "AI API error");
    const msg = err instanceof Error ? err.message : "AI request failed";
    res.status(502).json({ error: msg });
  }
});

export default router;
