# PMX - The Product Operating System for Developers

`pmx` is an intelligent CLI companion that lives in your terminal, helping you **investigate code**, **track strategic goals**, and **maintain product context** without leaving your workflow.

It bridges the gap between **Product Thinking** and **Engineering Execution** by treating your codebase as the source of truth.

## ✨ What's New

- **Natural Language Input** - Just type naturally! No slash commands needed.
- **Strategic Memory** - Track OKRs, decisions, risks, and personas.
- **Health Checks** - Proactive codebase quality audits.

---

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
    Run `/init` to scan your codebase and establish a "Product Identity".

    ```bash
    > /init
    ```

    *This creates a `.pmx/` folder with project context, memory, and configuration.*

---

## 💬 Natural Language Input

PMX understands what you mean! Instead of memorizing commands, just ask naturally:

| What You Type | What Happens |
|---------------|--------------|
| "How is authentication handled?" | Investigates the codebase |
| "I want to add a forgot password feature" | Plans the feature |
| "What are our current goals?" | Shows strategic memory |
| "Check the codebase health" | Runs health audit |
| "Show me the UserService" | Reads the file |

---

## 🧠 Core Workflows

### 1. Initialize (`/init`)

Deep-scan your codebase to establish product identity.

```bash
> /init
```

*What it does:*
- Analyzes your codebase structure, dependencies, and patterns
- Extracts product name, vision, tech stack, and domain
- Creates `PMX.md` with your product profile
- Populates strategic memory with identity

---

### 2. Investigate (`/investigate`)

Ask complex questions about your codebase. PMX uses an autonomous agent to explore files and synthesize answers.

```bash
> /investigate How is authentication handled?
```

Or just ask naturally:
```bash
> How does the payment flow work?
```

*Features:*
- **Deep Thinking:** The agent plans its approach, reads files, and verifies findings.
- **Visual Feedback:** Real-time thought processes shown.
- **Tool Use:** Automatically lists directories, reads files, and searches patterns.

---

### 3. Strategic Memory (`/memory`)

Track your product's strategic context: OKRs, decisions, risks, and personas.

```bash
> /memory              # View strategic memory summary
> /memory okr <text>   # Add an OKR
> /memory decision <text>  # Log a decision
> /memory risk <text>  # Add a risk
> /memory persona <name>   # Add a user persona
```

*Example:*
```bash
> /memory okr Increase user retention by 20%
✅ OKR Added!

Objective: Increase user retention by 20%
Quarter: Q1 2025
Status: on-track
```

*What gets tracked:*
- **OKRs** - Objectives with key results and quarterly tracking
- **Decisions** - Important choices with context and rationale
- **Risks** - Risk register with likelihood, impact, and mitigation
- **Personas** - Target users with goals and pain points
- **Insights** - Auto-generated architectural discoveries

---

### 4. Health Check (`/health`)

Audit your codebase quality and get actionable recommendations.

```bash
> /health         # Full health report
> /health quick   # Quick stats overview
```

*Output:*
```
╔══════════════════════════════════════════════════════════════╗
║  📊 PMX HEALTH REPORT                                        ║
╠══════════════════════════════════════════════════════════════╣
║  Overall Score: 72/100                                       ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ Code Size:    85%   │  ⚠️  Test Coverage:  45%           ║
║  ✅ Documentation: 78%  │  ⚠️  Structure:      62%           ║
╚══════════════════════════════════════════════════════════════╝
```

*What it checks:*
- Large files (>500 lines)
- Missing tests
- Documentation coverage
- Project structure

---

### 5. Read Files (`/read`)

Read file contents with syntax highlighting.

```bash
> /read src/services/UserService.ts
```

---

### 6. Smart Docs (`/scribe`)

Generate context-aware PRDs, tickets, and specs. Smart Scribe **automatically**:
- Investigates your codebase for relevant patterns
- Pulls strategic memory (OKRs, personas, decisions, risks)
- Uses structured templates with clear sections

```bash
> /scribe prd User Authentication
> /scribe ticket Fix Login Bug
> /scribe spec API Refactor
```

*What it generates:*
- **PRDs** - Strategic alignment, personas, user stories, acceptance criteria
- **Tickets** - Context, file references, Given/When/Then criteria
- **Specs** - Architecture, API changes, database changes, testing

*Output goes to `docs/<type>-<topic>.md`*

**Coming Soon:** Direct sync to Confluence and auto-create Jira tickets from acceptance criteria.

---

## 🔌 Integrations

### Jira Integration

Connect PMX to your Jira instance for ticket management.

```bash
> /jira setup                    # Show setup instructions
> /jira configure <email> <token> <url>  # Configure connection
```

Once connected, ask naturally:
```bash
> Create a Jira ticket for the login bug
> Show me open issues in project CORE
```

### MCP Status

Check Model Context Protocol server connections.

```bash
> /mcp status    # Check connection status
> /mcp connect   # Retry connections
```

---

## 📂 Configuration

PMX stores its brain in the `.pmx/` directory:

| File | Purpose |
|------|---------|
| `memory.json` | Strategic memory (OKRs, decisions, risks, personas, insights) |
| `context.json` | Project identity and context |
| `config.json` | Settings and MCP server configurations |

### "Read-Heavy, Write-Light" Philosophy

PMX is designed to **read** your entire codebase but only **write** to safe locations:

- ✅ `docs/` (Documentation)
- ✅ `.pmx/` (Internal Memory)
- ✅ `PMX.md` (Product Profile)
- ✅ `README.md` (If explicitly requested)
- ❌ `src/` (Never modified without permission)

---

## ⌨️ Command Reference

| Command | Description |
|---------|-------------|
| `/init` | Deep scan & initialize project |
| `/investigate <query>` | Explore the codebase |
| `/memory` | View strategic memory |
| `/memory okr <text>` | Add an OKR |
| `/memory decision <text>` | Log a decision |
| `/memory risk <text>` | Add a risk |
| `/memory persona <name>` | Add a persona |
| `/health` | Full codebase health check |
| `/health quick` | Quick stats |
| `/read <path>` | Read a file |
| `/scribe <type> <topic>` | Generate documentation |
| `/jira setup` | Jira setup instructions |
| `/mcp status` | Check MCP connections |
| `/help` | Show all commands |

---

## ⌨️ Shortcuts

- **`/help`**: Show available commands
- **`Ctrl+C`**: Cancel the current operation
- **`quit`** or **`exit`**: Exit the CLI

---

## 🤝 Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for details.

## ✨ Acknowledgements

This project was developed with the assistance of **Claude** (Anthropic) and **Google's Gemini**.

License: MIT
