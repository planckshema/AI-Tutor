<script setup lang="ts">
import { ref, nextTick, computed, onMounted, watch } from 'vue';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

// Marked v18: instantiate with options
const md = new Marked({ breaks: true, gfm: true });

/**
 * Render markdown to sanitized HTML.
 * DOMPurify strips all executable payloads (event handlers, <script>, javascript: hrefs)
 * so v-html is safe to use on marked output — including AI-generated and stored chat content.
 */
function renderMarkdown(text: string): string {
  const raw = md.parse(text) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

interface Problem {
  id: number;
  title: string;
  slug: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  examples: ProblemExample[];
  constraints: string[];
  starterCode: string;
  tags: string[];
}

interface ProblemSummary {
  id: number;
  title: string;
  slug: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  tags: string[];
}

interface Unit {
  id: number;
  order: number;
  title: string;
  description: string;
  problems: ProblemSummary[];
}

interface Course {
  id: number;
  name: string;
  slug: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LearnerProblemState {
  problemId: number;
  status: 'unseen' | 'attempted' | 'solved';
  hintsUsed: number;
  attempts: number;
  lastCode: string;
}

interface LearnerProfile {
  id: number;
  sessionId: string;
  displayName: string;
  knownTopics: string[];
  struggledTopics: string[];
  totalSolved: number;
  totalAttempted: number;
}

// ─── Session ID (learner identity without auth) ───────────────────────────────
// Engineering decision: UUID stored in localStorage, sent as X-Session-ID header.
// This lets us track per-learner state without requiring login.

function getOrCreateSessionId(): string {
  const key = 'tip101_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const sessionId = getOrCreateSessionId();
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId,
  };
}

// ─── State ───────────────────────────────────────────────────────────────────

const course = ref<Course | null>(null);
const units = ref<Unit[]>([]);
const expandedUnits = ref<Set<number>>(new Set([1])); // unit order, not id
const selectedProblem = ref<Problem | null>(null);
const learnerProfile = ref<LearnerProfile | null>(null);
const problemStates = ref<Map<number, LearnerProblemState>>(new Map());

const code = ref('');
const chatMessages = ref<ChatMessage[]>([]);
const chatInput = ref('');
const isChatLoading = ref(false);
const chatError = ref('');
const chatEl = ref<HTMLElement | null>(null);

const courseLoading = ref(true);
const problemLoading = ref(false);

const MAX_HINTS = 3;

// ─── Computed ─────────────────────────────────────────────────────────────────

const currentProblemState = computed<LearnerProblemState | undefined>(() =>
  selectedProblem.value ? problemStates.value.get(selectedProblem.value.id) : undefined,
);

const hintsUsed = computed(() => currentProblemState.value?.hintsUsed ?? 0);

const difficultyLabel: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

// ─── Course & Learner Loading ─────────────────────────────────────────────────

async function loadCourse() {
  try {
    const res = await fetch(`${BASE}/api/course`, { headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to load course');
    const data = await res.json() as { course: Course; units: Unit[] };
    course.value = data.course;
    units.value = data.units;

    // Auto-select the first problem
    const firstProblem = data.units[0]?.problems[0];
    if (firstProblem) {
      await loadProblem(firstProblem.id);
    }
  } catch (e) {
    console.error('Course load error:', e);
  } finally {
    courseLoading.value = false;
  }
}

async function loadLearner() {
  try {
    const res = await fetch(`${BASE}/api/learner`, { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json() as { profile: LearnerProfile; problemStates: LearnerProblemState[] };
    learnerProfile.value = data.profile;
    const map = new Map<number, LearnerProblemState>();
    for (const s of data.problemStates) map.set(s.problemId, s);
    problemStates.value = map;
  } catch (e) {
    console.error('Learner load error:', e);
  }
}

async function loadProblem(id: number) {
  if (selectedProblem.value?.id === id) return;
  problemLoading.value = true;
  chatMessages.value = [];
  chatError.value = '';
  try {
    const res = await fetch(`${BASE}/api/problems/${id}`, { headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to load problem');
    const data = await res.json() as { problem: Problem };
    selectedProblem.value = data.problem;

    // Restore or initialize code
    const state = problemStates.value.get(id);
    code.value = state?.lastCode || data.problem.starterCode;

    // Load chat history
    await loadChatHistory(id);
  } catch (e) {
    console.error('Problem load error:', e);
  } finally {
    problemLoading.value = false;
  }
}

async function loadChatHistory(problemId: number) {
  try {
    const res = await fetch(`${BASE}/api/learner/history/${problemId}`, { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json() as { messages: Array<{ role: string; content: string }> };
    chatMessages.value = data.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    await scrollChat();
  } catch {
    // non-fatal
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

async function scrollChat() {
  await nextTick();
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
}

async function sendChat(prefixInstruction?: string) {
  const content = prefixInstruction
    ? `${prefixInstruction}\n\n${chatInput.value}`.trim()
    : chatInput.value.trim();

  if (!content || isChatLoading.value) return;

  chatError.value = '';
  chatMessages.value.push({ role: 'user', content });
  chatInput.value = '';
  isChatLoading.value = true;
  await scrollChat();

  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        messages: chatMessages.value,
        problemId: selectedProblem.value?.id,
        // learnerId is intentionally omitted — the server derives it from X-Session-ID
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { message: ChatMessage };
    chatMessages.value.push(data.message);
  } catch (e: unknown) {
    chatError.value = e instanceof Error ? e.message : 'Something went wrong';
    chatMessages.value.pop();
    chatInput.value = content;
  } finally {
    isChatLoading.value = false;
    await scrollChat();
  }
}

function onChatKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

// ─── Action buttons: Hint / Review / Approach ─────────────────────────────────
// Engineering decision: these inject structured instructions as the user's message
// so the AI sees them in context. No separate endpoints needed.

async function requestHint() {
  if (hintsUsed.value >= MAX_HINTS) return;
  await recordAttempt('attempted', hintsUsed.value + 1);
  chatInput.value = 'Can I get a hint?';
  await sendChat(`[HINT REQUEST — hint ${hintsUsed.value + 1}/${MAX_HINTS}] Give me a targeted hint that unblocks me without revealing the full solution.`);
}

async function requestReview() {
  const currentCode = code.value.trim();
  chatInput.value = 'Please review my code.';
  await sendChat(`[CODE REVIEW REQUEST] Review the following code and give constructive feedback. Point out bugs, edge cases, or improvements. Do not rewrite the solution for me.\n\nMy code:\n\`\`\`python\n${currentCode}\n\`\`\``);
}

async function requestApproach() {
  chatInput.value = 'What approach should I use?';
  await sendChat(`[APPROACH REQUEST] Describe a high-level approach or strategy I should consider. Do not give me the full code — just help me think about the right direction.`);
}

// ─── Problem attempt recording ────────────────────────────────────────────────

async function recordAttempt(status: 'attempted' | 'solved', newHintsUsed?: number) {
  if (!selectedProblem.value || !learnerProfile.value) return;
  try {
    const hintsCount = newHintsUsed ?? hintsUsed.value;
    const res = await fetch(`${BASE}/api/learner/attempt`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        problemId: selectedProblem.value.id,
        status,
        lastCode: code.value,
        hintsUsed: hintsCount,
      }),
    });
    if (!res.ok) return;
    const data = await res.json() as { state: LearnerProblemState };
    problemStates.value.set(selectedProblem.value.id, data.state);
    // Re-fetch profile to update counters
    await loadLearner();
  } catch {
    // non-fatal
  }
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

function toggleUnit(unitOrder: number) {
  if (expandedUnits.value.has(unitOrder)) {
    expandedUnits.value.delete(unitOrder);
  } else {
    expandedUnits.value.add(unitOrder);
  }
}

function problemStatusIcon(problemId: number): string {
  const state = problemStates.value.get(problemId);
  if (!state || state.status === 'unseen') return '';
  if (state.status === 'solved') return '✓';
  return '·';
}

function problemStatusClass(problemId: number): string {
  const state = problemStates.value.get(problemId);
  if (!state || state.status === 'unseen') return '';
  if (state.status === 'solved') return 'solved';
  return 'attempted';
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([loadCourse(), loadLearner()]);
});
</script>

<template>
  <div class="app">
    <!-- ── Top header ───────────────────────────────────────────── -->
    <header class="topbar">
      <div class="topbar-brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span class="brand-name">TIP<span class="brand-accent">101</span></span>
      </div>

      <div class="topbar-center" v-if="selectedProblem">
        <span class="breadcrumb-dim">Unit {{ units.find(u => u.problems.some(p => p.id === selectedProblem?.id))?.order }}</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">{{ selectedProblem.title }}</span>
      </div>

      <div class="topbar-right">
        <span :class="['diff-badge', selectedProblem?.difficulty ?? 'easy']" v-if="selectedProblem">
          {{ difficultyLabel[selectedProblem.difficulty] }}
        </span>
      </div>
    </header>

    <div class="workspace">
      <!-- ── Left sidebar ───────────────────────────────────────── -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-label">UNITS</span>
        </div>

        <div v-if="courseLoading" class="sidebar-loading">
          <div class="skeleton" v-for="i in 4" :key="i"></div>
        </div>

        <nav v-else class="unit-list">
          <div v-for="unit in units" :key="unit.id" class="unit-block">
            <button
              class="unit-header"
              :class="{ expanded: expandedUnits.has(unit.order) }"
              @click="toggleUnit(unit.order)"
            >
              <svg class="chevron" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="unit-num">Unit {{ unit.order }}</span>
              <span class="unit-title">{{ unit.title }}</span>
            </button>

            <div v-if="expandedUnits.has(unit.order)" class="problem-list">
              <button
                v-for="(prob, idx) in unit.problems"
                :key="prob.id"
                class="problem-item"
                :class="{
                  active: selectedProblem?.id === prob.id,
                  [problemStatusClass(prob.id)]: true
                }"
                @click="loadProblem(prob.id)"
              >
                <span class="prob-num">{{ idx + 1 }}.</span>
                <span class="prob-title">{{ prob.title }}</span>
                <span class="prob-status-icon" v-if="problemStatusIcon(prob.id)">{{ problemStatusIcon(prob.id) }}</span>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <!-- ── Center: Problem + Code editor ─────────────────────── -->
      <main class="problem-pane">
        <div v-if="problemLoading" class="problem-loading">
          <div class="skeleton h-6 w-48 mb-4"></div>
          <div class="skeleton h-4 w-full mb-2"></div>
          <div class="skeleton h-4 w-4/5 mb-2"></div>
          <div class="skeleton h-4 w-3/5"></div>
        </div>

        <template v-else-if="selectedProblem">
          <!-- Problem description -->
          <div class="problem-scroll">
            <div class="problem-content">
              <div class="problem-title-row">
                <h1 class="problem-title">{{ selectedProblem.title }}</h1>
                <span class="tag" v-for="tag in selectedProblem.tags" :key="tag">{{ tag }}</span>
              </div>

              <div class="problem-desc" v-html="renderMarkdown(selectedProblem.description)"></div>

              <div class="section-label">EXAMPLES</div>
              <div class="examples">
                <div
                  v-for="(ex, i) in selectedProblem.examples"
                  :key="i"
                  class="example-block"
                >
                  <div class="example-row"><span class="ex-label">Input:</span> <code>{{ ex.input }}</code></div>
                  <div class="example-row"><span class="ex-label">Output:</span> <code>{{ ex.output }}</code></div>
                  <div v-if="ex.explanation" class="example-row ex-explanation">{{ ex.explanation }}</div>
                </div>
              </div>

              <div class="section-label">CONSTRAINTS</div>
              <ul class="constraints">
                <li v-for="(c, i) in selectedProblem.constraints" :key="i">{{ c }}</li>
              </ul>
            </div>
          </div>

          <!-- Code editor -->
          <div class="editor-pane">
            <div class="editor-toolbar">
              <div class="editor-lang">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M0 0h16v16H0z" fill="none"/><path d="M10.5 2.5l3 5-3 5h-1.5l3-5-3-5zm-4.5 0l-3 5 3 5h1.5l-3-5 3-5z"/></svg>
                Python 3.11
              </div>
              <div class="editor-actions">
                <button class="btn-ghost" @click="code = selectedProblem.starterCode">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
                  Reset
                </button>
                <button class="btn-primary" @click="recordAttempt('attempted')">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .764.425l8-5.5a.5.5 0 0 0 0-.85l-8-5.5A.5.5 0 0 0 4.5 2z"/></svg>
                  Run Code
                </button>
              </div>
            </div>
            <textarea
              v-model="code"
              class="code-editor"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              :placeholder="selectedProblem.starterCode"
            />
            <div class="editor-output">
              <span class="output-label">▸ Output</span>
              <span class="output-hint">Press Run Code to execute against test cases.</span>
            </div>
          </div>
        </template>

        <div v-else class="problem-empty">
          <p>Select a problem from the sidebar to get started.</p>
        </div>
      </main>

      <!-- ── Right panel: AI Tutor chat ─────────────────────────── -->
      <aside class="chat-pane">
        <div class="chat-header">
          <div class="chat-header-brand">
            <div class="ai-avatar-pill">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7.5 13A1.5 1.5 0 0 0 6 14.5 1.5 1.5 0 0 0 7.5 16 1.5 1.5 0 0 0 9 14.5 1.5 1.5 0 0 0 7.5 13zm9 0A1.5 1.5 0 0 0 15 14.5 1.5 1.5 0 0 0 16.5 16 1.5 1.5 0 0 0 18 14.5 1.5 1.5 0 0 0 16.5 13z"/>
              </svg>
            </div>
            <div>
              <div class="chat-title">AI Tutor</div>
              <div class="chat-subtitle">Hints used: {{ hintsUsed }}/{{ MAX_HINTS }}</div>
            </div>
          </div>
          <div class="chat-online">
            <span class="online-dot"></span>
            Online
          </div>
        </div>

        <!-- Action buttons -->
        <div class="chat-actions">
          <button
            class="action-btn hint-btn"
            :disabled="hintsUsed >= MAX_HINTS || !selectedProblem"
            @click="requestHint"
            :title="hintsUsed >= MAX_HINTS ? 'No hints remaining' : `Get hint (${MAX_HINTS - hintsUsed} left)`"
          >
            💡 Hint
          </button>
          <button class="action-btn review-btn" :disabled="!selectedProblem" @click="requestReview">
            🔍 Review
          </button>
          <button class="action-btn approach-btn" :disabled="!selectedProblem" @click="requestApproach">
            🗺 Approach
          </button>
        </div>

        <!-- Chat messages -->
        <div class="chat-messages" ref="chatEl">
          <div v-if="chatMessages.length === 0 && !isChatLoading" class="chat-empty">
            <p class="chat-empty-title">I'm here to help!</p>
            <p class="chat-empty-sub">Read through the problem description on the left, then start coding. Ask me for a hint, approach, or code review when you're ready.</p>
          </div>

          <div
            v-for="(msg, i) in chatMessages"
            :key="i"
            :class="['chat-msg', msg.role]"
          >
            <div class="msg-bubble" :class="msg.role">
              <div class="msg-text" v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>

          <div v-if="isChatLoading" class="chat-msg assistant">
            <div class="msg-bubble assistant typing">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="chatError" class="chat-error">
          {{ chatError }}
          <button @click="chatError = ''">✕</button>
        </div>

        <!-- Composer -->
        <div class="chat-composer">
          <textarea
            v-model="chatInput"
            @keydown="onChatKeydown"
            :disabled="isChatLoading"
            placeholder="Ask a question… (Enter to send)"
            rows="1"
            class="chat-input"
          />
          <button
            class="chat-send"
            :disabled="!chatInput.trim() || isChatLoading"
            @click="sendChat()"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <p class="chat-hint">Enter to send · Shift+Enter for new line</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Design tokens ────────────────────────────────────────────────────────── */
/* Dark Swiss aesthetic: deep blue-black ground, electric indigo primary, cyan accent */
:root {
  --bg: #08080f;
  --surface: #0d0f1a;
  --surface2: #131628;
  --border: #1c2040;
  --border2: #252a4a;
  --text: #dde1f5;
  --text-dim: #6b7499;
  --text-muted: #373d5e;
  --indigo: #6366f1;
  --indigo-dim: #4338ca;
  --cyan: #06b6d4;
  --green: #10b981;
  --yellow: #f59e0b;
  --red: #ef4444;
  --easy: #10b981;
  --medium: #f59e0b;
  --hard: #ef4444;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13px;
  overflow: hidden;
}

/* ── Topbar ───────────────────────────────────────────────────────────────── */
.topbar {
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  flex-shrink: 0;
  z-index: 10;
}

.topbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-icon {
  width: 20px;
  height: 20px;
  color: var(--indigo);
}

.brand-name {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
  letter-spacing: -0.02em;
}

.brand-accent {
  color: var(--indigo);
}

.topbar-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.breadcrumb-dim {
  color: var(--text-dim);
}

.breadcrumb-sep {
  color: var(--text-muted);
}

.breadcrumb-current {
  color: var(--text);
  font-weight: 500;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Difficulty badges */
.diff-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 10px;
  border-radius: 4px;
}
.diff-badge.easy   { background: rgba(16,185,129,0.12); color: var(--easy); border: 1px solid rgba(16,185,129,0.25); }
.diff-badge.medium { background: rgba(245,158,11,0.12); color: var(--medium); border: 1px solid rgba(245,158,11,0.25); }
.diff-badge.hard   { background: rgba(239,68,68,0.12); color: var(--hard); border: 1px solid rgba(239,68,68,0.25); }

/* ── Workspace (3-column) ────────────────────────────────────────────────── */
.workspace {
  display: grid;
  grid-template-columns: 260px 1fr 340px;
  flex: 1;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.sidebar-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.1em;
}

.sidebar-loading {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.unit-list {
  overflow-y: auto;
  flex: 1;
  padding-bottom: 16px;
}

.unit-list::-webkit-scrollbar { width: 4px; }
.unit-list::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

.unit-block {
  margin-bottom: 2px;
}

.unit-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px 7px 10px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 12px;
  font-family: var(--font-sans);
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.unit-header:hover { background: var(--surface2); color: var(--text); }

.chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  transition: transform 0.15s;
  color: var(--text-muted);
}
.unit-header.expanded .chevron { transform: rotate(90deg); }

.unit-num {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.unit-title {
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.problem-list {
  padding-left: 28px;
}

.problem-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 8px;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 12px;
  font-family: var(--font-sans);
  text-align: left;
  transition: all 0.1s;
}
.problem-item:hover { background: var(--surface2); color: var(--text); }
.problem-item.active {
  color: var(--indigo);
  border-left-color: var(--indigo);
  background: rgba(99,102,241,0.08);
}
.problem-item.solved .prob-title { color: var(--green); }
.problem-item.attempted .prob-title { color: var(--yellow); }

.prob-num {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.prob-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prob-status-icon {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--green);
  flex-shrink: 0;
}
.problem-item.attempted .prob-status-icon { color: var(--yellow); }

/* ── Problem pane ─────────────────────────────────────────────────────────── */
.problem-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border);
}

.problem-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.problem-scroll::-webkit-scrollbar { width: 4px; }
.problem-scroll::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

.problem-content {
  padding: 24px 28px;
}

.problem-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.problem-title {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  flex: 1;
  min-width: 200px;
}

.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(99,102,241,0.1);
  color: var(--indigo);
  border: 1px solid rgba(99,102,241,0.2);
  flex-shrink: 0;
}

.problem-desc {
  color: var(--text-dim);
  line-height: 1.7;
  margin-bottom: 24px;
  white-space: pre-wrap;
}

.section-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--cyan);
  margin-bottom: 10px;
}

.examples {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.example-block {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
}

.example-row {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

.ex-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  margin-right: 6px;
}

.example-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--cyan);
}

.ex-explanation {
  color: var(--text-muted);
  font-style: italic;
  font-size: 11px;
  margin-top: 4px;
}

.constraints {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}

.constraints li {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 10px;
  background: var(--surface2);
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* ── Code editor ─────────────────────────────────────────────────────────── */
.editor-pane {
  flex-shrink: 0;
  height: 320px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: #010108;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}

.editor-lang {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.btn-ghost {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--border2);
  border-radius: 5px;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.1s;
  font-family: var(--font-sans);
}
.btn-ghost:hover { background: var(--surface2); color: var(--text); }

.btn-primary {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: var(--indigo);
  border: none;
  border-radius: 5px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.1s;
  font-family: var(--font-sans);
}
.btn-primary:hover { opacity: 0.88; }

.code-editor {
  flex: 1;
  background: #010108;
  color: #c9d1e8;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  padding: 14px 16px;
  border: none;
  outline: none;
  resize: none;
  overflow-y: auto;
  white-space: pre;
  tab-size: 4;
}

.code-editor::-webkit-scrollbar { width: 4px; }
.code-editor::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

.editor-output {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}

.output-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--cyan);
}

.output-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* ── AI chat pane ─────────────────────────────────────────────────────────── */
.chat-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-avatar-pill {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--indigo);
  flex-shrink: 0;
}

.chat-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.chat-subtitle {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 1px;
}

.chat-online {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

.online-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Action buttons */
.chat-actions {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.action-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.1s;
  font-family: var(--font-sans);
}
.action-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.hint-btn {
  background: rgba(245,158,11,0.1);
  color: var(--yellow);
  border-color: rgba(245,158,11,0.25);
}
.hint-btn:not(:disabled):hover { background: rgba(245,158,11,0.18); }

.review-btn {
  background: rgba(6,182,212,0.1);
  color: var(--cyan);
  border-color: rgba(6,182,212,0.25);
}
.review-btn:not(:disabled):hover { background: rgba(6,182,212,0.18); }

.approach-btn {
  background: rgba(99,102,241,0.1);
  color: var(--indigo);
  border-color: rgba(99,102,241,0.25);
}
.approach-btn:not(:disabled):hover { background: rgba(99,102,241,0.18); }

/* Chat messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.chat-messages::-webkit-scrollbar { width: 4px; }
.chat-messages::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

.chat-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
}

.chat-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
}

.chat-empty-sub {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.chat-msg {
  display: flex;
}
.chat-msg.user { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }

.msg-bubble {
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.65;
}
.msg-bubble.user {
  background: var(--indigo);
  color: #fff;
  border-radius: 10px 10px 2px 10px;
}
.msg-bubble.assistant {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 10px 10px 10px 2px;
}

.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: inherit;
}

/* Typing indicator */
.typing {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 10px 14px !important;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--indigo);
  animation: blink 1.3s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 60%, 100% { opacity: 0.25; transform: scale(0.8); }
  30% { opacity: 1; transform: scale(1); }
}

/* Chat error */
.chat-error {
  padding: 8px 14px;
  background: rgba(239,68,68,0.08);
  border-top: 1px solid rgba(239,68,68,0.2);
  color: var(--red);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.chat-error button {
  background: none;
  border: none;
  color: var(--red);
  cursor: pointer;
  padding: 2px 6px;
}

/* Chat composer */
.chat-composer {
  display: flex;
  gap: 8px;
  padding: 10px 14px 8px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text);
  font-size: 12px;
  font-family: var(--font-sans);
  line-height: 1.5;
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 100px;
  overflow-y: auto;
  transition: border-color 0.15s;
}
.chat-input:focus { border-color: var(--indigo); }
.chat-input::placeholder { color: var(--text-muted); }
.chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

.chat-send {
  width: 36px;
  height: 36px;
  border-radius: 7px;
  background: var(--indigo);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.1s;
}
.chat-send:hover:not(:disabled) { opacity: 0.88; }
.chat-send:disabled { opacity: 0.3; cursor: not-allowed; }

.chat-hint {
  padding: 0 14px 10px;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

/* ── Skeleton loader ─────────────────────────────────────────────────────── */
.skeleton {
  background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  height: 14px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.problem-loading, .problem-empty {
  padding: 32px 28px;
  color: var(--text-muted);
}
</style>
