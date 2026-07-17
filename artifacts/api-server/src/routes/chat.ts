import { Router, type Request, type Response } from "express";
import OpenAI from "openai";

const router = Router();

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ?? "You are a helpful assistant.";

router.post("/chat", async (req: Request, res: Response) => {
  const { messages } = req.body as { messages?: unknown };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL ?? "openai/gpt-4o-mini";

  if (!apiKey) {
    req.log.warn("AI_API_KEY not configured");
    res.status(503).json({
      error:
        "AI API key not configured on the server. Please set the AI_API_KEY environment secret.",
    });
    return;
  }

  try {
    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(messages as Array<{ role: "user" | "assistant"; content: string }>),
      ],
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      res.status(500).json({ error: "No response received from AI model" });
      return;
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
