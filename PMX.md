# PMX – Product Master Plan

## 1. Vision & Core Value

PMX is a command-line companion designed to empower founder/engineers, product managers, and technical leaders by giving them deep, effortless insight into their product and codebase. It is a **read-heavy, write-light** assistant that excels at understanding systems, synthesizing product artifacts, and informing strategic decisions—without risking uncontrolled code modification.

The core vision:
- Bring product intelligence directly to the terminal.
- Bridge product and engineering through shared context.
- Make foundational product work fast, precise, and AI‑augmented.
- Empower small teams to operate with clarity typically found in much larger organizations.

PMX is not just a CLI—it is a lightweight product operating system for people who build.

## 2. Target Audience

PMX primarily serves:
- **Founder/Engineers** who need instant clarity across product, architecture, and execution.
- **Product Managers** who want structured product outputs generated from existing artifacts.
- **Tech Leads** who need insight into systems and decision‑support without leaving their workflows.

In practice, PMX is built for any hybrid product/technical role that straddles vision and execution.

## 3. Technical Foundation

PMX is a Node.js/TypeScript CLI built on a modular architecture:

- **CLI Layer** (Commander, Inquirer, Prompts)  
  Handles user commands, onboarding, interactive flows, and REPL.

- **Core Engines**  
  - **Investigator Engine**: Reads and analyzes code, documents, and context.  
  - **Scribe Engine**: Generates product artifacts (docs, notes, specs) in controlled directories.  
  - **LLM Layer**: OpenAI client wrapper for structured, deterministic model interactions.

- **Config & Context System**  
  Stores project metadata in `.pmx/` and ensures PMX understands the project without overstepping boundaries.

- **File Access Control**  
  Enforces:  
  - Read anywhere by default  
  - Write only to safe zones (`docs/`, `.pmx/`) unless explicitly permitted

This architecture aligns directly with PMX’s philosophy of safe, powerful introspection.

## 4. Current Status & Context

The project is in an early, foundational state:

- Core CLI structure is implemented.  
- Engines for reading and writing product artifacts are scaffolded.  
- LLM integration is functional.  
- Boundary rules (read-heavy, write-light) are conceptually established and partially enforced.  
- No advanced workflows or planning tools exist yet.  

Founder feedback emphasizes that PMX must excel at **making product work easy to create and maintain**, turning messy inputs into clear product outputs.

Next major strategic decision:  
Should PMX focus next on **deeper code insight**, **product planning tools**, or **workflow automation**?  
This remains open, but early architecture can support all three.

## 5. Roadmap

### Immediate Focus

These steps maximize value quickly while strengthening the foundation.

1. **Solidify Safety Boundaries**  
   - Enforce strict write-permission logic.  
   - Improve messaging when PMX blocks disallowed writes.

2. **Upgrade Investigator Engine**  
   - Add ability to read file trees with contextual summaries.  
   - Provide system overviews: components, modules, dependencies.

3. **Improve Scribe Engine Outputs**  
   - Templates for PRDs, specs, release notes, product briefs.  
   - Automatic doc placement in `docs/`.

4. **Project Initialization Enhancements**  
   - Clearer onboarding sequence.  
   - Auto-detection of project type (frontend, backend, full-stack).

5. **Quality-of-Life Enhancements**  
   - Global `pmx ask` command for natural-language queries.  
   - Better error messages and interaction feedback.

### Future Horizons

These ideas represent the long-term evolution of PMX.

1. **Deep Code Insight**  
   - Queryable architecture maps  
   - Root-cause explanations  
   - Code-level impact analysis for roadmap decisions

2. **Planning & Strategy Tools**  
   - AI-assisted roadmapping  
   - OKR‑to‑spec pipelines  
   - Feature comparison and opportunity mapping

3. **Workflow Automation**  
   - Daily briefing and project digest  
   - Automated doc upkeep and stale-file detection  
   - Patterns extracted from git history and architecture trends

4. **Team Collaboration Mode**  
   - Shared `.pmx/` context files  
   - Multi-user product workspace synced across contributors

5. **Plugin Ecosystem**  
   - Extensible commands for specialized workflows  
   - Community-driven templates for product documents

---

PMX aims to become the most intuitive, insightful, and safe AI tool for product-minded builders—turning everyday product tasks into a streamlined, intelligent workflow directly in the terminal.