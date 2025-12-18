# pmx - The Product Operating System for Developers

`pmx` is an intelligent CLI companion that lives in your terminal, helping you **plan features**, **investigate code**, and **maintain product context** without leaving your workflow.

It bridges the gap between **Product Thinking** and **Engineering Execution** by treating your codebase as the source of truth.

## 🚀 Getting Started

### Installation

```bash
npm install -g pmx
```

### Setup

1. **Navigate to your project root.**
2. **Run the CLI:**

    ```bash
    pmx
    ```

3. **Onboarding:**
    If this is your first time, run `/init` to scan your codebase and establish a "Product Identity".

    ```bash
    > /init
    ```

    *This creates a `.pmx/` folder to store project context, memory, and configuration.*

---

## 🧠 Core Workflows

### 1. Investigate (`/investigate`)

Ask complex questions about your codebase. `pmx` uses a "Deep Thinking" agent to explore files, search patterns, and synthesize answers.

```bash
> /investigate How is authentication handled in this project?
```

*Features:*

- **Deep Thinking:** The agent plans its approach, reads files, and verifies findings.
- **Visual Feedback:** A spinner shows real-time thought processes.
- **Memory:** Permanent architectural insights are saved to `memory.json`.

### 2. Plan (`/plan`)

Draft detailed Feature Specifications (PRDs) based on your codebase's actual architecture.

```bash
> /plan Add a "Forgot Password" flow
```

*Features:*

- **Context-Aware:** Checks existing components to recommend reuse.
- **Structured Output:** Generates a Markdown file in `docs/features/`.
- **Critique Loop:** The agent critiques its own plan before finalizing.

### 3. Execute (`/tickets`)

Turn a PRD into actionable engineering tickets.

```bash
> /tickets docs/features/forgot-password.md
```

*Features:*

- **Breakdown:** Splits big features into frontend, backend, and database tasks.
- **Export:** Generates a CSV (importable to Jira/Linear) and a JSON file.
- **Acceptance Criteria:** Automatically adds ACs to every ticket.

### 4. Strategize (`/roadmap`)

Visualize and manage your high-level goals.

```bash
> /roadmap
```

*Features:*

- **Visual Timeline:** See what's Now, Next, and Later.
- **Interactive:** Add or move items directly from the CLI.
- **File-Based:** Updates `roadmap.md` in your repo.

### 5. Context (`/context`)

See what `pmx` knows about your project.

```bash
> /context
```

*Features:*

- **Identity:** Displays the project name, vision, and stack.
- **Insights:** Shows accumulated architectural knowledge (e.g., "Database is Postgres").
- **Files:** Lists loaded context files.

---

## 📂 Configuration

`pmx` stores its brain in the `.pmx/` directory:

- **`memory.json`**: The long-term memory (Identity, Risks, Insights).
- **`config.json`**: (Optional) Custom settings.

### "Read-Heavy, Write-Light" Philosophy

By default, `pmx` is designed to **read** your entire codebase but only **write** to:

- `docs/` (Documentation)
- `.pmx/` (Internal Memory)
- `roadmap.md` (Strategy)

It will **never** modify your source code (`src/`) without explicit permission (future feature).

---

## ⌨️ Shortcuts

- **`/quit`**: Exit the CLI and get a summary of your session.
- **`Ctrl+C`**: Cancel the current operation.

---

## 🤝 Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for details.

## ✨ Acknowledgements

This project was architected and developed with the assistance of **Google's Gemini 3 Pro**.

License: MIT
