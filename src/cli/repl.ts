import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createDefaultLLMClient, LLMMessage } from '../core/llm';
import { buildProjectContext } from '../core/context';
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

    const width = 60;
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

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

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

      if (input.startsWith('/')) {
        const [command, ...args] = input.split(' ');

        switch (command) {
          case '/help':
            console.log(chalk.bold.cyan('\n📘  pmx Help & Commands'));
            console.log(chalk.dim('──────────────────────────────────────────────────'));

            console.log(chalk.bold('\nCore Commands:'));
            console.log(`  ${chalk.cyan('/help')}         Show this help message`);
            console.log(`  ${chalk.cyan('/quit')}         Exit the application`);
            console.log(`  ${chalk.cyan('/init')}         Run the onboarding wizard`);

            console.log(chalk.bold('\nContext & Analysis:'));
            console.log(`  ${chalk.cyan('/context')}      View loaded files (PMX.md, docs, etc.)`);
            console.log(`  ${chalk.cyan('/investigate')}  Run a deep scan on a specific feature/folder`);
            console.log(chalk.dim('                 Usage: /investigate <path> <question>'));
            console.log(`  ${chalk.cyan('/plan')}         Draft a new feature spec or PRD`);
            console.log(chalk.dim('                 Usage: /plan <feature description>'));
            console.log(`  ${chalk.cyan('/config')}       Manage global settings`);
            console.log(chalk.dim('                 Usage: /config [list|set <key> <value>]'));
            console.log(`  ${chalk.cyan('/roadmap')}      View or update the product roadmap`);
            console.log(chalk.dim('                 Usage: /roadmap [request]'));
            console.log(`  ${chalk.cyan('/tickets')}      Generate engineering tickets from a PRD`);
            console.log(chalk.dim('                 Usage: /tickets <path/to/prd.md>'));

            console.log(chalk.bold('\nNatural Language Examples:'));
            console.log(`  • "Plan the user authentication feature"`);
            console.log(`  • "Why is the build failing?"`);
            console.log(`  • "Draft a PRD for the dashboard"`);
            console.log('');
            break;

          case '/context':
            console.log(chalk.bold('Project context loaded from:'));
            if (projectContext.sources.length === 0) {
              console.log(chalk.dim('  (None)'));
              console.log(chalk.yellow('No project context files found. You can create PMX.md or docs/product-vision.md to give pmx more background.'));
            } else {
              projectContext.sources.forEach(s => console.log(chalk.dim(`- ${s.path}`)));
              console.log(chalk.bold('\nPreviews:'));
              projectContext.sources.forEach(s => {
                console.log(chalk.cyan(`[${s.path}]`));
                console.log(chalk.dim(s.preview));
                console.log('');
              });
            }
            break;

          case '/quit':
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
            await handleInvestigateCommand(args, rl, messages);
            break;

          case '/plan':
          case '/feature':
            await handleFeatureCommand(args, rl, messages);
            break;

          case '/config':
            await handleConfigCommand(args, rl);
            break;

          case '/roadmap':
            await handleRoadmapCommand(args, rl, messages);
            break;

          case '/tickets':
            await handleTicketsCommand(args, rl, messages);
            break;

          default:
            console.log(chalk.yellow('Unknown command. Type /help for options.'));
            break;
        }
        isProcessing = false;
        rl.prompt();
        return;
      }

      messages.push({ role: 'user', content: input });
      const initialMessageCount = messages.length;

      // Streaming UI setup
      let startTime = Date.now();
      let firstChunkReceived = false;

      // We'll use a simple "✦" prompt for the AI response
      process.stdout.write(chalk.magenta('✦ '));

      try {
        let keepGoing = true;

        while (keepGoing) {
          // If the client supports streaming, use it
          let responseContent = '';
          let responseToolCalls: any[] | undefined;

          if (llm.chatStream) {
            const response = await llm.chatStream(messages, REPL_TOOLS, (chunk) => {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                // Calculate time to first token could be logged here if needed
              }
              process.stdout.write(chunk);
            });
            responseContent = response.content || '';
            responseToolCalls = response.tool_calls;

            // Add a newline after streaming finishes
            console.log('');

            // Show timing
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(chalk.dim(`  (${duration}s)`));

          } else {
            // Fallback for non-streaming clients
            const response = await llm.chat(messages, REPL_TOOLS);
            responseContent = response.content || '';
            responseToolCalls = response.tool_calls;
            console.log(responseContent);
          }

          if (responseToolCalls && responseToolCalls.length > 0) {
            // Add assistant message with tool calls
            messages.push({
              role: 'assistant',
              content: responseContent,
              tool_calls: responseToolCalls
            });

            // Process each tool call
            for (const toolCall of responseToolCalls) {
              const fnName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);

              const result = await handleToolCall(fnName, args, rl);

              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: fnName,
                content: result
              });
            }
            // Loop continues to send tool results back to LLM
            // Reset timer for the next turn
            startTime = Date.now();
            firstChunkReceived = false;
            process.stdout.write(chalk.magenta('✦ '));

          } else {
            // Final text response (already streamed)
            messages.push({ role: 'assistant', content: responseContent });
            keepGoing = false;
          }
        }

      } catch (error) {
        console.log(''); // Ensure newline
        console.error(chalk.red(`Error: ${(error as Error).message}`));

        // Only pop the user message if we haven't progressed in the conversation
        if (messages.length === initialMessageCount) {
          messages.pop();
        }
      }

      isProcessing = false;
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
