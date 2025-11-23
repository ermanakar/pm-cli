import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { createDefaultLLMClient, LLMMessage } from '../core/llm';
import { buildProjectContext } from '../core/context';
import { REPL_TOOLS } from './tools/definitions';
import { handleToolCall } from './tools/handlers';
import { generateSystemPrompt } from '../core/prompts';
import { handleInvestigateCommand } from './commands';

export async function startRepl() {
  console.log(chalk.bold('pmx – Product CLI'));
  console.log(chalk.dim('Project: PMCLI (...)'));
  console.log(chalk.dim('Type /help for commands, /quit to exit.'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('pmx> '),
    terminal: true
  });

  try {
    const llm = createDefaultLLMClient();
    const projectContext = await buildProjectContext(process.cwd());
    const systemPrompt = generateSystemPrompt(projectContext);

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
            console.log(chalk.dim('Available commands:'));
            console.log(chalk.dim('  /help         - Show this help message'));
            console.log(chalk.dim('  /context      - Show loaded context files'));
            console.log(chalk.dim('  /investigate  - Run a deep codebase investigation'));
            console.log(chalk.dim('  /quit         - Exit the application'));
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

          case '/investigate':
            await handleInvestigateCommand(args, rl, messages);
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
