# PMX 2.0 Architecture Roadmap: The "Product Mind"

## 1. Vision

Transform `pmx` from a reactive CLI wrapper into a **proactive Product Management Agent**.
It should not just "read files" but "think," "plan," and "orchestrate" complex product workflows (Research → Strategy → Execution).

## 2. The Layered Architecture

We will move from a monolithic loop to a **Layered Agent System**.

### Layer 1: The Interface (CLI/REPL)

- **Responsibility**: Handling user input, rendering "Tool Boxes," streaming text, and managing the session.
- **Current State**: Good (`src/cli/`).
- **Upgrade**: Needs to handle "Thinking" states and "Sub-Agent" handoffs visually.

### Layer 2: The Orchestrator (The "PM Brain")

- **Responsibility**: The main agent the user talks to. It does not do the heavy lifting itself. It **thinks**, **plans**, and **delegates**.
- **Capabilities**:
  - **Thinking**: Can pause to reason before acting (Chain of Thought).
  - **Delegation**: Can call "Specialist Agents" (Tools) instead of just raw functions.
  - **Context Management**: Maintains the high-level goal ("Ship Dark Mode") while sub-agents handle details ("Find CSS files").

### Layer 3: Specialist Agents (The "Team")

These are specialized loops (like the current Investigator) that run autonomously to complete a specific sub-goal.

1. **🕵️ The Investigator (Existing)**
   - **Goal**: Answer questions about the codebase.
   - **Tools**: `grep`, `read_file`, `list_files`.
   - **Output**: Structured Report.

2. **📝 The Scribe (Planned)**
   - **Goal**: Create high-quality documentation (PRDs, RFCs, User Stories).
   - **Tools**: `write_file`, `read_template`.
   - **Output**: Markdown artifacts.

3. **🌐 The Researcher (Future)**
   - **Goal**: External context.
   - **Tools**: `web_search`, `fetch_url`.
   - **Output**: Competitor analysis, market trends.

### Layer 4: The Tool Belt (Capabilities)

- **Responsibility**: Atomic operations.
- **Tools**: `fsTools` (Read/Write), `git` (future), `browser` (future).

---

## 3. Implementation Plan

### Phase 1: The Thinking Orchestrator (Immediate)

**Goal**: Make the main agent aware of its tools and able to "think".

1. **Expose Investigator as a Tool**:
   - Add `run_investigation` to the main LLM's tool definition.
   - When the main agent calls it, we trigger the sub-loop and feed the result back (just like we did manually).
   - **Result**: User asks "How does auth work?", Agent decides to call `run_investigation`.

2. **Add "Thinking" Capability**:
   - Implement a `think` tool or `<thinking>` block parsing.
   - **UI**: Show a "🧠 Thinking..." box while the agent plans its next move.
   - **Benefit**: Prevents impulsive answers; allows the agent to break down "Add Dark Mode" into steps.

### Phase 2: Curated Product Flows (The "Playbooks")

**Goal**: Enable one-click workflows for common PM tasks.

1. **The "Feature Kickoff" Flow**:
   - User: "Kick off Dark Mode."
   - Orchestrator Plan:
     1. Investigate current styling (Call Investigator).
     2. (Future) Search competitors (Call Researcher).
     3. Draft PRD (Call Scribe).
     4. Generate Ticket Plan.

2. **The "Audit" Flow**:
   - User: "Audit our security."
   - Orchestrator Plan:
     1. Investigate auth patterns.
     2. Investigate API endpoints.
     3. Write Audit Report.

---

## 4. Technical Changes Required

### `src/core/orchestrator/` (New)

- `agent.ts`: The main loop (refactored from `repl.ts`).
- `planner.ts`: Logic for breaking down complex user requests.

### `src/core/tools/` (Refactor)

- Consolidate `fsTools`, `investigator`, etc. into a unified `ToolRegistry`.

### `src/cli/ui.ts`

- Add `logThinkingEvent` (e.g., "🧠 Planning next step...").

---

## 5. Example Interaction (Target State)

```text
pmx> I want to add Dark Mode.

🧠 Thinking...
│  1. This is a feature request.
│  2. I need to understand the current CSS/Theme setup.
│  3. Then I should draft a PRD.
│  4. Action: Call Investigator.

🕵️ Investigator
│  Searching for "theme", "css", "styled-components"...
│  Found "src/theme.ts".
│  Report generated.

🧠 Thinking...
│  1. Investigation complete. We use a custom ThemeProvider.
│  2. Now I will draft the PRD based on "docs/templates/prd.md".
│  3. Action: Write PRD.

✓  WriteFile docs/features/dark-mode-prd.md
```
