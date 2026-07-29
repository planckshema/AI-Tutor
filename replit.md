# TIP101 — Technical Interview Prep AI Tutor

An AI-powered tutoring platform for a Technical Interview Prep course. Students work through structured LeetCode-style problems organized in units, with a live AI tutor that knows their progress and adapts its coaching to their learning state.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from env, default 8080)
- `pnpm --filter @workspace/chat-ui run dev` — run the Vue frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `npx tsx artifacts/api-server/src/seed.ts` — seed TIP101 course + problems (idempotent)

## Required Environment Variables

- `DATABASE_URL` — Postgres connection string (auto-provided by Replit DB)
- `AI_API_KEY` — OpenAI-compatible API key
- `AI_MODEL` — Model name (default: `gpt-4o-mini`)
- `AI_BASE_URL` — Optional: custom base URL (for OpenRouter, Anthropic proxy, etc.)
- `SESSION_SECRET` — Server session secret

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`)
- Frontend: Vue 3 + Vite + Tailwind CSS (`artifacts/chat-ui`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (v4), drizzle-zod
- AI: OpenAI-compatible SDK (configurable model/base URL)
- Build: esbuild (CJS bundle)

## Where Things Live

- `lib/db/src/schema/` — DB schema (courses, units, problems, learner_profiles, learner_problem_states, chat_messages)
- `artifacts/api-server/src/routes/` — API routes (chat, course, learner, health)
- `artifacts/api-server/src/seed.ts` — Course seed data (TIP101, 10 units, 8 problems)
- `artifacts/chat-ui/src/App.vue` — Full Vue SPA (3-panel layout: sidebar + problem + AI chat)

## Architecture Decisions

- **Learner identity without auth**: UUID stored in `localStorage`, sent as `X-Session-ID` header. Resolved to a `learner_profiles` row on every request (upsert on first seen).
- **Dynamic AI system prompt**: built per-request from course context + current problem + learner model (known topics, struggled topics, problem history). The AI always knows who it's coaching.
- **Action buttons (Hint / Review / Approach)**: inject structured instruction prefixes into the user's chat message rather than separate endpoints. Keeps the API simple; the AI sees the context in-message.
- **Hint limit**: 3 hints per problem, tracked in `learner_problem_states.hints_used` and surfaced in the UI.
- **Chat history persistence**: every user↔assistant exchange is stored in `chat_messages` and re-loaded when a student returns to a problem.

## Product

Students browse 10 units (Arrays & Hashing → Greedy) from a collapsible sidebar. Selecting a problem loads a description + examples + constraints in the center panel, alongside a code editor. The right panel is a live AI tutor chat with Hint / Review / Approach quick-actions. The AI knows the current problem, the student's code, and their learning history.

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

- For every build, explain what was done, how it was done, and the engineering decisions made.

## Gotchas

- Re-running `seed.ts` is idempotent — it checks for the course by slug before inserting.
- The `drizzle-kit push` command requires `DATABASE_URL` to be set. Replit auto-sets this.
- The frontend sends `X-Session-ID` on every request. Learner routes return 400 without it.
- The chat route accepts optional `problemId` and `learnerId` body fields; without them the AI falls back to a generic tutor persona.
