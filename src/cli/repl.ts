import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { createDefaultLLMClient, LLMMessage } from '../core/llm';
import { buildProjectContext } from '../core/context';
import { listDocFiles, readDocFile, prepareDocWrite, applyPendingWrite } from '../core/fsTools';
import { runInvestigation } from '../core/investigator/engine';
import { logToolEvent, promptForWriteConfirmation } from './ui';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Allowed paths: docs/**, .pmx/**, src/**, package.json, README.md, etc.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The relative path to the file (e.g. src/index.ts)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the project. Recursive by default.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path (default: docs/)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Propose a write to a documentation file. The user will review and confirm.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to write to (must start with docs/ or .pmx/)' },
          content: { type: 'string', description: 'The full content of the file' },
          reason: { type: 'string', description: 'Short reason for this change (e.g. "Add dark mode FAQ")' }
        },
        required: ['path', 'content', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_investigation',
      description: 'Run a deep, autonomous investigation of the codebase to answer a complex question. Use this when you need to understand how something works before proposing changes.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'The question or goal to investigate (e.g. "How does auth work?")' }
        },
        required: ['objective']
      }
    }
  }
];

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

    const systemPrompt = `
**1. CORE IDENTITY & GOAL**
You are pmx, an expert Product Manager AI co-pilot designed for technical founders and engineers.
Your goal is to bridge the gap between product strategy and technical execution.
You are running inside a CLI tool in the user's terminal.

**2. HOW TO THINK**
- **Analyze Intent**: Understand what the user wants to achieve (e.g., "Draft a PRD", "Audit this feature").
- **Clarify First**: If the request is broad, ask 2-3 strategic questions to narrow down the scope before generating full documents.
- **Propose Structure**: Before writing big artifacts, briefly outline your plan.
- **Be Terse**: No fluff. Start answering immediately.

**3. CAPABILITIES & TOOLS**
- **Context Aware**: You have access to a subset of the project's context (wrapped in <project_context>).
- **Read-Only (Code)**: You CAN read source code to understand the current state, but you CANNOT modify it.
- **Write-Allowed (Docs)**: You CAN write/update files in the \`docs/\` directory using the \`write_file\` tool.
- **Tools**:
  - \`read_file\`: Read content of specific files (code or docs).
  - \`list_files\`: Explore directories.
  - \`write_file\`: Create or update documentation.

**4. LIMITATIONS**
- You cannot arbitrarily run shell commands.
- You cannot directly access the network.
- Do not hallucinate "I changed file X" – only describe what should be changed unless you explicitly used the \`write_file\` tool.

**5. PROJECT CONTEXT**
The following block contains the files pmx has loaded from the repository. This is your "long-term memory" of the project.

<project_context>
${projectContext.summary || "No persistent context files found."}
</project_context>

**FINAL REMINDER:**
You are pmx, a product co-pilot running inside a CLI. You only know about the project files that have been loaded into <project_context> and what the user tells you in this session. Do not claim access to any other files unless you read them with \`read_file\`.
`;

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
            const objectiveText = args.join(' ');
            if (!objectiveText) {
              console.log(chalk.yellow('Usage: /investigate <objective>'));
              break;
            }
            
            console.log(chalk.magenta(`\n🕵️  Starting investigation: "${objectiveText}"`));
            console.log(chalk.dim('This may take a minute...\n'));

            // Pause RL to prevent input interference during investigation
            rl.pause();

            try {
              const result = await runInvestigation(
                { text: objectiveText },
                { maxTurns: 10, maxTimeMs: 3 * 60 * 1000 }
              );

              console.log(chalk.bold('\n--- Investigation Complete ---\n'));
              console.log(chalk.bold('Summary:'));
              console.log(result.summary);
              console.log('\n' + chalk.dim('─'.repeat(40)) + '\n');
              console.log(result.details);
              
              // Offer to save
              const saveAnswer = await inquirer.prompt([{
                type: 'confirm',
                name: 'save',
                message: 'Save this report to docs/investigations/?',
                default: false
              }]);

              if (saveAnswer.save) {
                const slug = objectiveText.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
                const filename = `docs/investigations/${slug}.md`;
                const fileContent = `# Investigation: ${objectiveText}\n\n## Summary\n${result.summary}\n\n## Details\n${result.details}\n\n## Evidence\n${result.evidence.map(e => `- **${e.path}**: ${e.summary}`).join('\n')}`;
                
                const pending = await prepareDocWrite(process.cwd(), filename, fileContent, 'Save investigation report');
                const status = await promptForWriteConfirmation(pending);
                if (status === 'approved') {
                   await applyPendingWrite(process.cwd(), pending);
                   logToolEvent({ type: 'writeFile', target: filename, status: 'ok', message: 'Report saved.' });
                }
              }

              // Feed the investigation result back into the main chat context
              messages.push({
                role: 'system',
                content: `[System] The user ran an investigation: "${objectiveText}".\n\nResult Summary:\n${result.summary}\n\nResult Details:\n${result.details}\n\n(You can now answer questions based on this investigation.)`
              });

            } catch (err) {
               console.error(chalk.red(`Investigation failed: ${(err as Error).message}`));
            } finally {
              rl.resume();
            }
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
            const response = await llm.chatStream(messages, TOOLS, (chunk) => {
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
            const response = await llm.chat(messages, TOOLS);
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
              let result = '';

              if (fnName === 'read_file') {
                try {
                  const doc = await readDocFile(process.cwd(), args.path);
                  result = doc.content;
                  logToolEvent({
                    type: 'readFile',
                    target: args.path,
                    status: 'ok',
                    preview: doc.preview
                  });
                } catch (err) {
                  result = `Error reading file: ${(err as Error).message}`;
                  logToolEvent({
                    type: 'readFile',
                    target: args.path,
                    status: 'error',
                    message: (err as Error).message
                  });
                }
              } else if (fnName === 'list_files') {
                try {
                  const files = await listDocFiles(process.cwd(), args.path);
                  result = files.join('\n');
                  logToolEvent({
                    type: 'readFolder',
                    target: args.path || 'docs/',
                    status: 'ok',
                    message: `Found ${files.length} files.`
                  });
                } catch (err) {
                  result = `Error listing directory: ${(err as Error).message}`;
                  logToolEvent({
                    type: 'readFolder',
                    target: args.path || 'docs/',
                    status: 'error',
                    message: (err as Error).message
                  });
                }
              } else if (fnName === 'write_file') {
                // Interactive confirmation
                rl.pause();
                try {
                  const pending = await prepareDocWrite(process.cwd(), args.path, args.content, args.reason || 'No reason provided');
                  
                  // Use the new UI for confirmation
                  const status = await promptForWriteConfirmation(pending);
                  
                  if (status === 'approved') {
                    await applyPendingWrite(process.cwd(), pending);
                    result = `Successfully wrote to ${args.path}`;
                    logToolEvent({
                      type: 'writeFile',
                      target: args.path,
                      status: 'ok',
                      message: 'File saved successfully.'
                    });
                  } else {
                    result = 'ERROR: User rejected the write operation. The file was NOT saved/updated. You must inform the user that the action was cancelled and the file remains unchanged.';
                    logToolEvent({
                      type: 'writeFile',
                      target: args.path,
                      status: 'cancelled',
                      message: 'User rejected the write.'
                    });
                  }
                } catch (err) {
                  result = `Error preparing write: ${(err as Error).message}`;
                  logToolEvent({
                    type: 'writeFile',
                    target: args.path,
                    status: 'error',
                    message: (err as Error).message
                  });
                } finally {
                  rl.resume();
                }
              } else if (fnName === 'run_investigation') {
                console.log(chalk.magenta(`\n🕵️  Starting investigation: "${args.objective}"`));
                rl.pause();
                try {
                  const invResult = await runInvestigation(
                    { text: args.objective },
                    { maxTurns: 10, maxTimeMs: 3 * 60 * 1000 }
                  );
                  
                  // We return the full details in the tool result so the LLM sees it immediately
                  // and the message chain remains valid (assistant -> tool).
                  result = `Investigation Complete.\n\nSUMMARY:\n${invResult.summary}\n\nDETAILS:\n${invResult.details}\n\nEVIDENCE:\n${invResult.evidence.map(e => `- ${e.path}: ${e.summary}`).join('\n')}`;

                  logToolEvent({
                    type: 'shell',
                    target: 'investigator',
                    status: 'ok',
                    message: 'Investigation finished.'
                  });

                } catch (err) {
                  result = `Investigation failed: ${(err as Error).message}`;
                  logToolEvent({
                    type: 'shell',
                    target: 'investigator',
                    status: 'error',
                    message: (err as Error).message
                  });
                } finally {
                  rl.resume();
                }
              }

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
