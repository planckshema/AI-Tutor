<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const messages = ref<Message[]>([]);
const inputText = ref('');
const isLoading = ref(false);
const errorMsg = ref('');
const messagesEl = ref<HTMLElement | null>(null);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function scrollToBottom() {
  await nextTick();
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }
}

async function send() {
  const content = inputText.value.trim();
  if (!content || isLoading.value) return;

  errorMsg.value = '';
  messages.value.push({ role: 'user', content });
  inputText.value = '';
  isLoading.value = true;
  await scrollToBottom();

  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.value }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { message: Message };
    messages.value.push(data.message);
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Something went wrong';
    const last = messages.value.pop();
    if (last) inputText.value = last.content;
  } finally {
    isLoading.value = false;
    await scrollToBottom();
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

const canSend = computed(() => inputText.value.trim().length > 0 && !isLoading.value);
</script>

<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>AI Chat</span>
        </div>
        <div class="model-badge" v-if="!errorMsg">
          <span class="status-dot"></span>
          Connected
        </div>
      </div>
    </header>

    <!-- Messages -->
    <main class="messages" ref="messagesEl">
      <!-- Empty state -->
      <div v-if="messages.length === 0 && !isLoading" class="empty">
        <div class="empty-glyph">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </div>
        <p class="empty-title">Start a conversation</p>
        <p class="empty-sub">Type your first message below to begin chatting with the AI.</p>
      </div>

      <!-- Message list -->
      <template v-for="(msg, i) in messages" :key="i">
        <div :class="['msg-row', msg.role]">
          <div class="avatar">
            <span v-if="msg.role === 'user'">You</span>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" class="ai-avatar-icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div class="bubble" :class="msg.role">
            <p class="bubble-text">{{ msg.content }}</p>
          </div>
        </div>
      </template>

      <!-- Typing indicator -->
      <div v-if="isLoading" class="msg-row assistant">
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="currentColor" class="ai-avatar-icon">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <div class="bubble assistant typing">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </main>

    <!-- Error bar -->
    <div v-if="errorMsg" class="error-bar">
      <span class="error-text">{{ errorMsg }}</span>
      <button class="error-dismiss" @click="errorMsg = ''">✕</button>
    </div>

    <!-- Composer -->
    <footer class="composer">
      <div class="composer-inner">
        <textarea
          v-model="inputText"
          @keydown="onKeydown"
          :disabled="isLoading"
          placeholder="Message AI... (Enter to send · Shift+Enter for new line)"
          rows="1"
          class="composer-input"
        />
        <button
          @click="send"
          :disabled="!canSend"
          class="send-btn"
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
      <p class="hint">AI responses are generated — verify important information</p>
    </footer>
  </div>
</template>

<style scoped>
/* ─── Shell ─────────────────────────────────────────────── */
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0c0e14;
  color: #e2e4ed;
}

/* ─── Header ─────────────────────────────────────────────── */
.header {
  background: #13151e;
  border-bottom: 1px solid #1c1f2e;
  padding: 0 1.25rem;
  height: 56px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.header-inner {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: #e2e4ed;
}
.brand-icon {
  width: 20px;
  height: 20px;
  color: #5b8def;
}
.model-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #6b7280;
  background: #1c1f2e;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
}

/* ─── Messages ───────────────────────────────────────────── */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  scroll-behavior: smooth;
}
.messages::-webkit-scrollbar { width: 5px; }
.messages::-webkit-scrollbar-track { background: transparent; }
.messages::-webkit-scrollbar-thumb { background: #1c1f2e; border-radius: 3px; }

/* ─── Empty state ────────────────────────────────────────── */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
  padding: 2rem;
}
.empty-glyph {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: #13151e;
  border: 1px solid #1c1f2e;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b4258;
}
.empty-glyph svg { width: 30px; height: 30px; }
.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: #9ca3af;
}
.empty-sub {
  font-size: 0.8125rem;
  color: #4b5563;
  max-width: 300px;
  line-height: 1.6;
}

/* ─── Message rows ───────────────────────────────────────── */
.msg-row {
  display: flex;
  gap: 0.75rem;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
  align-items: flex-start;
}
.msg-row.user { flex-direction: row-reverse; }

/* ─── Avatars ────────────────────────────────────────────── */
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}
.msg-row.user .avatar {
  background: linear-gradient(135deg, #5b8def, #7c6ef9);
  color: #fff;
}
.msg-row.assistant .avatar {
  background: #13151e;
  border: 1px solid #1c1f2e;
  color: #5b8def;
}
.ai-avatar-icon { width: 16px; height: 16px; }

/* ─── Bubbles ────────────────────────────────────────────── */
.bubble {
  padding: 0.75rem 1rem;
  border-radius: 18px;
  max-width: calc(100% - 44px);
  line-height: 1.65;
  font-size: 0.9375rem;
}
.bubble.user {
  background: linear-gradient(135deg, #4a80e8, #6b5fe6);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
}
.bubble.assistant {
  background: #13151e;
  border: 1px solid #1c1f2e;
  color: #d1d5e0;
  border-radius: 18px 18px 18px 4px;
}
.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* ─── Typing indicator ───────────────────────────────────── */
.typing {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 0.875rem 1.125rem !important;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5b8def;
  animation: blink 1.3s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 60%, 100% { opacity: 0.25; transform: scale(0.8); }
  30% { opacity: 1; transform: scale(1); }
}

/* ─── Error bar ──────────────────────────────────────────── */
.error-bar {
  background: #1f1010;
  border-top: 1px solid #4b1515;
  color: #f87171;
  padding: 0.625rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  flex-shrink: 0;
}
.error-text { flex: 1; }
.error-dismiss {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.error-dismiss:hover { opacity: 1; }

/* ─── Composer ───────────────────────────────────────────── */
.composer {
  background: #13151e;
  border-top: 1px solid #1c1f2e;
  padding: 0.875rem 1.25rem 0.75rem;
  flex-shrink: 0;
}
.composer-inner {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  gap: 0.625rem;
  align-items: flex-end;
}
.composer-input {
  flex: 1;
  background: #0c0e14;
  border: 1px solid #1c1f2e;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  color: #e2e4ed;
  font-size: 0.9375rem;
  font-family: inherit;
  line-height: 1.55;
  resize: none;
  outline: none;
  min-height: 48px;
  max-height: 180px;
  overflow-y: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.composer-input:focus {
  border-color: #5b8def;
  box-shadow: 0 0 0 3px rgba(91, 141, 239, 0.12);
}
.composer-input::placeholder { color: #3b4258; }
.composer-input:disabled { opacity: 0.5; cursor: not-allowed; }

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: linear-gradient(135deg, #4a80e8, #6b5fe6);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.1s;
}
.send-btn:hover:not(:disabled) { opacity: 0.9; transform: scale(1.03); }
.send-btn:active:not(:disabled) { transform: scale(0.97); }
.send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.send-btn svg { width: 17px; height: 17px; fill: #fff; }

.hint {
  max-width: 760px;
  margin: 0.375rem auto 0;
  font-size: 0.7rem;
  color: #2e3347;
  text-align: center;
}
</style>
