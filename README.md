# pmx - Product CLI for Founder/Engineers

`pmx` is a command-line interface (CLI) tool designed to empower founder/engineers in their product management workflows. Our vision is to provide a powerful, intelligent assistant directly in your terminal, streamlining common product tasks, facilitating informed decision-making, and bridging the gap between product strategy and technical execution.

## Vision and Core Principles

### Read Anything, Write Almost Nothing (by default)

`pmx` is built on the core principle of being a **read-heavy, write-light** tool. By default, it has extensive capabilities to analyze, summarize, and extract information from your codebase and documentation. This allows founder/engineers to:

-   **Deeply understand existing systems:** Quickly get insights into code, architecture, and dependencies.
-   **Analyze product artifacts:** Process and synthesize information from product specifications, user stories, and documentation.
-   **Inform strategic decisions:** Leverage AI to identify patterns, suggest improvements, and answer complex questions about the product.

While `pmx` excels at reading and analysis, its ability to write or modify files is strictly controlled and limited. By default, `pmx` is allowed to write only to designated product documentation directories (e.g., `docs/`) and its own configuration files (`.pmx/`). This design choice ensures:

-   **Codebase Protection:** Prevents accidental or AI-hallucinated modifications to critical source code (`src/`, `app/`, `backend/`, etc.).
-   **Clear Ownership:** Establishes a clear boundary where product managers own the narrative and artifacts (managed via `pmx`), while engineers (and their specialized tools) retain ownership and control over code implementation.
-   **Controlled Evolution:** Any functionality requiring code modification will be explicit and opt-in, ensuring deliberate engineering oversight.

### Bridging Product and Engineering

`pmx` aims to be the central hub for:

-   **Product Documentation:** Effortlessly navigate, query, and generate product visions, PRDs, feature one-pagers, and metrics.
-   **Strategic Insight:** Turn raw data and diffuse information into actionable insights for product development.
-   **Workflow Automation:** Automate repetitive product management tasks, freeing up valuable time for strategic thinking and execution.

This tool is for those who want to drive product forward with clarity, precision, and a deep, AI-augmented understanding of both the market and the underlying technology.
