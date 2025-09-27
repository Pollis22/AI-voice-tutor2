Here’s your drop-in **`README_PHASE1.md`** for the repo—copy/paste as-is.

---

# Phase 1 — ElevenLabs ConvAI Swap (Multi-Agent)

**Goal:** Replace the single voice agent with a **multi-agent switcher** (one agent per age band) in your Replit web app and keep the TutorMind teaching flow. This README documents setup, code, security, and acceptance tests.

---

## 1) Agents & IDs

Create/duplicate **five ElevenLabs agents** (same core prompt, different LLM + greeting). Use these IDs:

```ts
// src/agents.ts
export const AGENTS = {
  k2:      "agent_0101k6691t11ew6bcfm3396wfhza",
  g3_5:    "agent_4501k66bf389e01t212acwk5vc26",
  g6_8:    "agent_3701k66bmce0ecr8mt98nvc4pb96",
  g9_12:   "agent_6301k66brd9gfhqtey7t3tf1masf",
  college: "agent_8901k66cfk6ae6v8h7gj1t21enqa",
} as const;

export const GREETINGS = {
  k2:      "Hi there, it's your favorite JIE tutor! Let’s play with numbers or letters. Do you want to start with counting, reading, or something fun?",
  g3_5:    "Hello it’s your JIE Tutor! I can help you with math, reading, or Spanish. Which one do you want to start with today?",
  g6_8:    "Hello it’s your JIE Tutor! I can help you with math, reading, science or languages. Which one do you want to start with today? Don't forget to choose your language.",
  g9_12:   "Hello it’s your JIE Tutor! Hey, welcome! I can help with algebra, essays, or exam prep. What subject are you working on now? Don't forget to choose your language.",
  college: "Hello it’s your Tutor Mind Tutor! I’m here to help with advanced topics like calculus, essay writing, or languages. Which class or subject do you want to dive into today? Don't forget to choose your language.",
} as const;
```

> These IDs are saved to memory so we can reuse them anywhere.

---

## 2) ElevenLabs Agent Settings (per age band)

* **System Prompt:** *TutorMind v3 (Multilingual)* + one-line age modifier at top

  * K–2: “Use very short sentences, playful examples, lots of encouragement.”
  * 3–5: “Use step-by-step explanations; check understanding often.”
  * 6–8: “Focus on structure and vocabulary; short practice problems.”
  * 9–12: “Concise, exam-prep cadence; rigorous methods for math/science.”
  * College: “Efficient, precise, rigorous; standard methods.”

**Model & Reasoning**

* K–2 → **GPT-5 Nano**, Reasoning **Low**
* 3–5 → **GPT-5 Nano**, Reasoning **Low**
* 6–8 → **GPT-5 Mini**, Reasoning **Low**
* 9–12 → **GPT-5 (Full)**, Reasoning **Medium**
* College → **GPT-5 (Full)**, Reasoning **Medium**

**Other**

* Temperature: **0.2–0.3 (Deterministic)**
* Max conversation time: **3600** seconds (1 hour)
* Interface:

  * **Send text while on call: ON**
  * **Realtime transcript: ON**
  * **Language dropdown: ON** (global product)
  * **Mute button: ON**
  * **Expanded behavior: Starts collapsed**
  * **Variant: Compact** (Full for demos)

---

## 3) Security → Allowlist (required)

In each agent: **Security → Allowlist → Add host**. Add the exact origins (no paths, no trailing slash):

* `https://<repl-name>.<username>.repl.co`  *(Replit preview)*
* `https://<deployment-subdomain>.replit.app`  *(Replit Deployments, if used)*
* `http://localhost:3000`  *(optional local dev)*
* `https://yourdomain.com` and `https://www.yourdomain.com`  *(production)*

**Enable overrides:** ON → toggle **Agent language** only.
Keep **First message** and **System prompt** overrides OFF.

---

## 4) Replit App Integration

### 4.1 Install the widget (once)

The code below loads the embed script once and mounts the widget dynamically.

```tsx
// src/TutorApp.tsx
import { useEffect, useRef, useState } from "react";
import { AGENTS } from "./agents";

const SUBJECT_STARTERS: Record<string, string> = {
  general: "I’d like a quick skills check to see where I should start.",
  math:    "I want to work on math today. Begin with a warm-up problem at my level.",
  english: "I want help with reading/writing. Start with a short exercise at my level.",
  spanish: "I want to practice Spanish. Start with simple call-and-response drills."
};

type ProgressNote = { lastLevel?: string; lastSubject?: string; lastSummary?: string; updatedAt?: string; };
const PROGRESS_KEY = "tutormind_progress_v1";
const loadProgress = (): ProgressNote => { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); } catch { return {}; } };
const saveProgress = (p: ProgressNote) => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {} };

export default function TutorApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const memo = loadProgress();
  const [level, setLevel] = useState<keyof typeof AGENTS>(memo.lastLevel as any || "k2");
  const [subject, setSubject] = useState(memo.lastSubject || "general");
  const [studentName, setStudentName] = useState("");
  const [gradeText, setGradeText] = useState("");

  useEffect(() => {
    if (document.querySelector('script[data-elevenlabs-convai]')) { setScriptReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true; s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    s.onload = () => setScriptReady(true);
    document.body.appendChild(s);
  }, []);

  const composeFirstUserMessage = () => {
    const starter = SUBJECT_STARTERS[subject] || "";
    const tail = memo.lastSummary ? ` Also, resume from last time: ${memo.lastSummary}` : "";
    return `${starter}${tail}`.trim();
  };

  const mount = (agentId: string, firstUserMessage?: string) => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const el = document.createElement("elevenlabs-convai");
    el.setAttribute("agent-id", agentId);
    if (firstUserMessage) el.setAttribute("first-user-message", firstUserMessage);
    if (studentName) el.setAttribute("metadata-student-name", studentName);
    if (gradeText)   el.setAttribute("metadata-student-grade", gradeText);
    containerRef.current.appendChild(el);

    saveProgress({
      lastLevel: level,
      lastSubject: subject,
      lastSummary: memo.lastSummary,
      updatedAt: new Date().toISOString(),
    });
  };

  const startTutor = () => mount(AGENTS[level], composeFirstUserMessage());

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <h1>JIE Tutor — Multi-Agent</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={level} onChange={e => setLevel(e.target.value as any)}>
          <option value="k2">Kindergarten–2</option>
          <option value="g3_5">Grades 3–5</option>
          <option value="g6_8">Grades 6–8</option>
          <option value="g9_12">Grades 9–12</option>
          <option value="college">College/Adult</option>
        </select>

        <select value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="general">General</option>
          <option value="math">Math</option>
          <option value="english">English</option>
          <option value="spanish">Spanish</option>
        </select>

        <input placeholder="Student name (optional)" value={studentName} onChange={e=>setStudentName(e.target.value)} />
        <input placeholder="Grade text (optional)" value={gradeText} onChange={e=>setGradeText(e.target.value)} />

        <button onClick={startTutor} disabled={!scriptReady}>Start / Switch Tutor</button>
      </div>

      <div ref={containerRef} />
    </div>
  );
}
```

```tsx
// src/App.tsx
import TutorApp from "./TutorApp";
export default function App() { return <TutorApp />; }
```

---

## 5) Prompt (System)

Use **TutorMind v3 — Multilingual** as the shared prompt for all agents (the version we finalized).
At the very top of each agent, add the one-line **age modifier** corresponding to the band.

---

## 6) Acceptance Tests

* **AT-1 (Agent Switch):** Changing the level re-mounts the widget with the correct `agent-id`.
* **AT-2 (Subject Grounding):** Selecting Math/English/Spanish changes the first turn topic.
* **AT-3 (Language Dropdown):** Switching language changes spoken output immediately.
* **AT-4 (Resume Note):** Saving a progress note appends to the next session’s first message.
* **AT-5 (Timeout):** Near 1 hour, agent closes with recap + practice suggestion.
* **AT-6 (Security):** Widget connects only from allowlisted origins.

---

## 7) Troubleshooting

* **Widget loads but can’t connect:** Check ElevenLabs **Allowlist** for the exact origin in use.
* **Language dropdown does nothing:** Ensure **Enable overrides → Agent language** is ON.
* **Rambly answers:** Keep Temperature at **0.2–0.3** and Reasoning Effort per table above.
* **Costs spike:** Verify younger agents use **Nano/Mini**; keep turns short (prompt enforces 1–3 sentences).
* **Mic/autoplay blocked:** Make sure your UI includes a manual “Start” click before audio (browser policy).

---

## 8) Roadmap (Phase 2 preview)

* Add **assignment uploads + RAG** to ground lessons in student materials.
* Add **server-side session summaries** for cross-agent continuity.
* Subject-specialized agents (optional): duplicate age agents into Math/English/Spanish variants if needed.

---

**Done.** This README is the single source of truth for Phase 1 multi-agent integration.
