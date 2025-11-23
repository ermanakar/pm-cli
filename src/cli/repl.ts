import * as readline from 'readline';
import { MemoryManager } from '../core/memory/memory';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Spinner } from './spinner';
import { createDefaultLLMClient, LLMMessage } from '../core/llm';
import { buildProjectContext } from '../core/context';
import { ContextManager } from '../core/contextManager';
import { REPL_TOOLS } from './tools/definitions';
import { handleToolCall } from './tools/handlers';
import { generateSystemPrompt } from '../core/prompts';
import { handleInvestigateCommand, handleFeatureCommand, handleConfigCommand, handleRoadmapCommand, handleTicketsCommand } from './commands';
import { runInitFlow as handleInitCommand } from './onboarding';

export async function startRepl() {
  console.log(chalk.bold('pmx – Product CLI'));
  console.log(chalk.dim('Project: PMCLI (...)'));
  console.log(chalk.dim('Type /help for commands, /quit to exit.'));

  try {
    // Check for first run
    const hasPmx = fs.existsSync(path.join(process.cwd(), 'PMX.md'));


    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue('pmx> '),
      terminal: true
    });

    const llm = createDefaultLLMClient();
    const projectContext = await buildProjectContext(process.cwd());
    const systemPrompt = generateSystemPrompt(projectContext);

    // Dashboard / HUD
    console.clear();

    const width = Math.min(process.stdout.columns ? process.stdout.columns - 4 : 60, 60);
    const border = chalk.gray('─'.repeat(width));
    const top = chalk.gray('╭' + '─'.repeat(width) + '╮');
    const bottom = chalk.gray('╰' + '─'.repeat(width) + '╯');
    const empty = chalk.gray('│') + ' '.repeat(width) + chalk.gray('│');

    const pad = (str: string, len: number) => str + ' '.repeat(Math.max(0, len - str.length));
    const line = (str: string) => {
      // Remove ansi codes for length calculation
      const visibleLen = str.replace(/\u001b\[\d+m/g, '').length;
      return chalk.gray('│') + '  ' + str + ' '.repeat(Math.max(0, width - 2 - visibleLen)) + chalk.gray('│');
    };

    console.log(top);
    console.log(line(chalk.bold.magenta('pmx v0.0.1')));
    console.log(empty);

    if (hasPmx && projectContext.sources.length > 0) {
      const pmxFile = projectContext.sources.find(s => s.path === 'PMX.md');

      let vision = 'No vision set';
      let stack = 'Unknown';
      let nextMilestone = 'No active milestone';

      if (pmxFile) {
        const extract = (name: string) => {
          const regex = new RegExp(`##\\s*.*?${name}.*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
          const match = pmxFile.content.match(regex);
          return match ? match[1].trim() : null;
        };

        const rawVision = extract('Vision');
        if (rawVision) vision = rawVision.split('\n')[0].slice(0, 50) + (rawVision.length > 50 ? '...' : '');

        const rawStack = extract('Tech Stack') || extract('Technical');
        if (rawStack) stack = rawStack.split('\n')[0].replace(/, /g, ' • ').slice(0, 50);

        const roadmap = extract('Roadmap') || '';
        nextMilestone = roadmap.match(/- \[ \] (.*)/)?.[1]?.slice(0, 50) || 'No active milestone';
      }

      console.log(line(`${chalk.bold('Project:')}  ${chalk.white(path.basename(process.cwd()))}`));
      console.log(line(`${chalk.bold('Vision:')}   ${chalk.dim(vision)}`));
      console.log(line(`${chalk.bold('Focus:')}    ${chalk.green(nextMilestone)}`));
      console.log(empty);
      console.log(line(chalk.dim(`[i] ${projectContext.sources.length} context files loaded`)));

    } else {
      // Not Onboarded State
      console.log(line(`${chalk.bold('Project:')}  ${chalk.white(path.basename(process.cwd()))}`));
      console.log(line(`${chalk.bold('Status:')}   ${chalk.yellow('Not Onboarded ⚠️')}`));
      console.log(empty);
      console.log(line(chalk.bold.cyan('👉 ACTION REQUIRED: Run /init to set up this project.')));
    }

    console.log(bottom);
    console.log(''); // Spacer

    const contextManager = new ContextManager();
    contextManager.initialize(systemPrompt);

    if (projectContext.sources.length > 0) {
      console.log(chalk.dim(`Loaded context from: ${projectContext.sources.map(s => s.path).join(', ')}`));
    }

    let isProcessing = false;

    rl.on('line', async (line) => {
      const input = line.trim();

      // Prevent concurrent processing or empty inputs
      if (isProcessing || !input) {
        if (!isProcessing) rl.prompt();
        return;
      }

      isProcessing = true;

      // --- COMMAND MODE ---
      if (input.startsWith('/')) {
        const [command, ...args] = input.split(' ');

        // Reset context for slash commands to prevent token bloat
        // We re-initialize with the system prompt + project context
        // But we DON'T keep the chat history.
        // NOTE: Some commands might want history, but for stability we default to fresh.

        // (Optional: We could pass the contextManager to commands if they need to manipulate it)
        // For now, we keep the existing command signatures but note they run "outside" the main chat loop context
        // except for the ones that take 'messages' arg - we need to fix those.

        switch (command) {
          case '/help':
            console.log(chalk.bold.cyan('\n📘  pmx Help & Commands'));
            console.log(chalk.dim('──────────────────────────────────────────────────'));
            console.log(chalk.bold('\nCore Commands:'));
            console.log(`  ${chalk.cyan('/help')}         Show this help message`);
            console.log(`  ${chalk.cyan('/quit')}         Exit the application`);
            console.log(`  ${chalk.cyan('/init')}         Run the onboarding wizard`);
            console.log(chalk.bold('\nContext & Analysis:'));
            console.log(`  ${chalk.cyan('/context')}      View loaded files`);
            console.log(`  ${chalk.cyan('/investigate')}  Run a deep scan`);
            console.log(`  ${chalk.cyan('/plan')}         Draft a feature spec`);
            console.log(`  ${chalk.cyan('/tickets')}      Generate tickets`);
            console.log('');
            break;

          case '/context':
            console.log(chalk.bold('\n📂  Project Context:'));

            // Load Memory
            const memoryManager = new MemoryManager(process.cwd());
            const memory = await memoryManager.load();

            if (memory.identity.name) {
              console.log(chalk.bold('\n🧠  Identity:'));
              console.log(`    ${chalk.cyan('Name:')}   ${memory.identity.name}`);
              console.log(`    ${chalk.cyan('Vision:')} ${memory.identity.vision}`);
              console.log(`    ${chalk.cyan('Stack:')}  ${memory.identity.stack}`);
            }

            if (memory.insights && memory.insights.length > 0) {
              console.log(chalk.bold('\n💡  Key Insights:'));
              memory.insights.slice(-5).forEach((i: { text: string; date: string }) => {
                console.log(`    • ${i.text} ${chalk.dim('(' + new Date(i.date).toLocaleDateString() + ')')}`);
              });
            }

            console.log(chalk.bold('\n📄  Loaded Files:'));
            if (projectContext.sources.length === 0) {
              console.log(chalk.dim('  (None)'));
              console.log(chalk.yellow('No project context files found. You can create PMX.md or docs/product-vision.md to give pmx more background.'));
            } else {
              projectContext.sources.forEach(s => console.log(chalk.dim(`- ${s.path}`)));
            }
            break;

          case '/quit':
            // Session Summary
            const sessionMessages = contextManager.getMessages();
            const sessionWork = sessionMessages.filter(m => m.role === 'user' && m.content && (m.content.startsWith('/') || m.content.length > 20));

            if (sessionWork.length > 0) {
              console.log(chalk.cyan('\n👋  Wrapping up session...'));
              const summaryPrompt = `
                Summarize this session's achievements in 3 bullet points.
                Focus on what was built, planned, or investigated.
                Be concise.

                Session History:
                ${sessionMessages.map(m => `${m.role}: ${m.content || ''}`).join('\n').slice(-2000)}
              `;

              try {
                const summary = await llm.chat([{ role: 'user', content: summaryPrompt }]);
                console.log(chalk.bold('\n📝  Session Summary:'));
                console.log(summary.content);
              } catch (e) {
                // Ignore summary errors on exit
              }
            }

            rl.close();
            process.exit(0);
            return;

          case '/init':
            rl.pause();
            try {
              await handleInitCommand();
            } catch (e) {
              console.error(chalk.red(`Onboarding failed: ${(e as Error).message}`));
            } finally {
              rl.resume();
            }
            break;

          case '/investigate':
            // Pass a fresh empty array or a specific context if needed. 
            // The command handler should manage its own agent loop.
            await handleInvestigateCommand(args, rl, []);
            break;

          case '/plan':
          case '/feature':
            await handleFeatureCommand(args, rl, []);
            break;

          case '/config':
            await handleConfigCommand(args, rl);
            break;

          case '/roadmap':
            await handleRoadmapCommand(args, rl, []);
            break;

          case '/tickets':
            await handleTicketsCommand(args, rl, []);
            break;

          default:
            console.log(chalk.yellow('Unknown command. Type /help for options.'));
            break;
        }
        isProcessing = false;
        rl.prompt();
        return;
      }

      // --- CHAT MODE (STRICT) ---
      // No tools allowed here to prevent accidental massive scans.

      contextManager.addMessage('user', input);
      const messages = contextManager.getMessages();

      // Streaming UI setup
      let startTime = Date.now();
      let firstChunkReceived = false;

      const spinner = new Spinner('Thinking...');
      spinner.start();

      try {
        // STRICT MODE: No tools passed to chat
        let responseContent = '';

        if (llm.chatStream) {
          const response = await llm.chatStream(messages, undefined, (chunk) => { // undefined tools
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              spinner.stop(); // Stop spinner on first token
              process.stdout.write(chalk.magenta('✦ '));
            }
            process.stdout.write(chunk);
          });
          responseContent = response.content || '';

          if (!firstChunkReceived) {
            spinner.stop(); // Stop if no stream (shouldn't happen but safety)
            process.stdout.write(chalk.magenta('✦ '));
            console.log(responseContent);
          } else {
            console.log('');
          }

          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(chalk.dim(`  (${duration}s)`));

        } else {
          const response = await llm.chat(messages, undefined); // undefined tools
          spinner.stop();
          process.stdout.write(chalk.magenta('✦ '));
          responseContent = response.content || '';
          console.log(responseContent);
        }

        contextManager.addMessage('assistant', responseContent);

      } catch (error) {
        spinner.stop();
        console.log('');
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      } finally {
        isProcessing = false;
        rl.prompt();
      }
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
