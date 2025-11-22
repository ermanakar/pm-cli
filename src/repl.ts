import * as readline from 'readline';
import chalk from 'chalk';
import { createDefaultLLMClient, LLMMessage } from './core/llm';
import { loadProjectContext } from './core/context';

export function startRepl() {
  console.log(chalk.bold('pmx – Product CLI'));
  console.log(chalk.dim('Project: PMCLI (...)'));
  console.log(chalk.dim('Type /help for commands, /quit to exit.'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('pmx> '),
  });

  try {
    const llm = createDefaultLLMClient();
    const { systemContext, loadedFiles } = loadProjectContext();

    const systemPrompt = `
**1. CORE IDENTITY & GOAL**
You are pmx, an expert Product Manager AI co-pilot designed for technical founders and engineers.
Your goal is to bridge the gap between product strategy and technical execution.
You are running inside a CLI tool in the user's terminal.

**2. CONTEXT AWARENESS**
You have access to a subset of the project's context (wrapped in <project_context>).
- <file path="...">: Content of high-value files (PMX.md, package.json, etc.).
- <file-tree>: High-level map of the project structure.
- **CRITICAL**: If the user asks about a file NOT in your context, do NOT guess. Explicitly state: "I don't have that file in my context. Please paste it or use a command to load it."

**3. THINKING PROCESS**
- **Analyze Intent**: Is this a strategic question, a tactical request, or a technical query?
- **Check Alignment**: Does this request align with the vision in 'PMX.md'? If not, challenge the user politely but firmly.
- **Propose before Building**: Before generating long artifacts, propose a structure/outline.

**4. AUDIENCE ADAPTATION**
- The user is a **Founder/Engineer**. They understand code.
- Do NOT simplify technical terms.
- DO connect technical decisions to product outcomes (e.g., "Refactoring this auth flow (Tech) reduces user churn (Product).").

**5. LIMITATIONS & GUARDRAILS**
- You are currently **READ-ONLY**. You cannot write files or run commands.
- If asked to write code/files, generate the content in a code block and say: "Here is the content for [filename]. You can copy/paste this."

**6. TONE & STYLE**
- **Terse & No-Fluff**: No "I hope this helps" or "Great question". Start answering immediately.
- **Opinionated**: If a feature idea is bad, say so and explain why based on the metrics/vision.
- **Structured**: Use Markdown headers, bullet points, and bold text for readability in a terminal.

**7. AVAILABLE COMMANDS**
- /help, /context, /quit. (Do not hallucinate others).

You will now be provided with project context inside <project_context> tags.
<project_context>
${systemContext || "No persistent context files found."}
</project_context>

**FINAL REMINDER:**
You are pmx. Be sharp, strategic, and concise.
`;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    if (loadedFiles.length > 0) {
      console.log(chalk.dim(`Loaded context from: ${loadedFiles.join(', ')}`));
    }

    rl.on('line', async (line) => {
      const input = line.trim();
      if (input.startsWith('/')) {
        switch (input) {
          case '/help':
            console.log(chalk.dim('Available commands:'));
            console.log(chalk.dim('  /help    - Show this help message'));
            console.log(chalk.dim('  /context - Show loaded context files'));
            console.log(chalk.dim('  /quit    - Exit the application'));
            break;
          case '/context':
            console.log(chalk.dim('Loaded Context Files:'));
            if (loadedFiles.length === 0) {
              console.log(chalk.dim('  (None)'));
            } else {
              loadedFiles.forEach(f => console.log(chalk.dim(`  - ${f}`)));
            }
            break;
          case '/quit':
            rl.close();
            return;
          default:
            console.log(chalk.yellow('Unknown command. Type /help for options.'));
            break;
        }
        rl.prompt();
        return;
      }

      messages.push({ role: 'user', content: input });

      try {
        const assistantResponse = await llm.chat(messages);
        messages.push({ role: 'assistant', content: assistantResponse });
        console.log(assistantResponse);
      } catch (error) {
        console.error(chalk.red('Error: Unable to contact LLM. Check your OPENAI_API_KEY and try again.'));
        messages.pop(); // Remove the user message that caused the error
      }

      rl.prompt();
    }).on('close', () => {
      console.log('Exiting pmx.');
      process.exit(0);
    });
    
    rl.prompt();

  } catch (error) {
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}
