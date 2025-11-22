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

    const systemPrompt = `You are a terse, no-fluff product co-pilot for a founder/engineer. Answer in short paragraphs or bullet points. Avoid generic advice.

You are running inside a CLI that has read certain files from the repo. Do not say you can't access files; instead, base your answers on the provided project context. If the user asks you to read arbitrary files, explain that you only see the subset loaded by pmx.

PROJECT CONTEXT:
${systemContext || "No persistent context files found."}`;

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
