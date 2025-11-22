import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { createDefaultLLMClient, LLMMessage } from './core/llm';
import { loadProjectContext } from './core/context';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Use this when you need to see code or docs.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to the file to read' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the docs/ directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to write to (must start with docs/)' },
          content: { type: 'string', description: 'The full content of the file' }
        },
        required: ['path', 'content']
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

**3. AGENTIC WORKFLOW (CRITICAL)**
You are not just a chatbot; you are an agent. When the user makes a request (e.g., "Draft a PRD", "Analyze this feature"):
1. **EXPLORE FIRST**: Do not guess. Use \`list_files\` and \`read_file\` to gather information about the current codebase and docs.
   - *Example*: If asked for "Dark Mode", check if any UI code or existing design docs exist first.
2. **CLARIFY**: If the user's request is broad, ask 2-3 strategic questions to narrow down the scope *before* generating full documents.
3. **PLAN & EXECUTE**: Briefly state your plan to the user, then execute it using tools.

**4. TOOL USAGE**
- You have access to tools: read_file, list_files, write_file.
- **USE THEM AUTONOMOUSLY**.
- If you need to see a file, call read_file.
- If you need to explore a folder, call list_files.
- If you need to create a PRD or doc, call write_file.

**5. AUDIENCE ADAPTATION**
- The user is a **Founder/Engineer**. They understand code.
- Do NOT simplify technical terms.
- DO connect technical decisions to product outcomes.

**6. LIMITATIONS & GUARDRAILS**
- **READ-ONLY (Code)**: You CANNOT modify source code (src/, app/, etc.).
- **WRITE-ALLOWED (Docs)**: You CAN write/update files in the \`docs/\` directory.

**7. TONE & STYLE**
- **Terse & No-Fluff**: Start answering immediately.
- **Opinionated**: If a feature idea is bad, say so and explain why based on the metrics/vision.
- **Structured**: Use Markdown headers, bullet points, and bold text.

You will now be provided with project context inside <project_context> tags.
<project_context>
${systemContext || "No persistent context files found."}
</project_context>

**FINAL REMINDER:**
You are pmx. Don't just answer; **investigate** and **act**.
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
            console.log(chalk.dim('  /quit         - Exit the application'));
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
            process.exit(0);
            return;
            
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

      // Spinner animation
      const spinnerChars = ['|', '/', '-', '\\'];
      let spinnerIdx = 0;
      const spinnerInterval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(spinnerChars[spinnerIdx])} Thinking...`);
        spinnerIdx = (spinnerIdx + 1) % spinnerChars.length;
      }, 80);

      const clearSpinner = () => {
        clearInterval(spinnerInterval);
        process.stdout.write('\r\x1b[K'); // Clear line
      };

      try {
        let keepGoing = true;
        
        while (keepGoing) {
          const response = await llm.chat(messages, TOOLS);
          
          if (response.tool_calls && response.tool_calls.length > 0) {
            // Add assistant message with tool calls
            messages.push({
              role: 'assistant',
              content: response.content,
              tool_calls: response.tool_calls
            });

            // Process each tool call
            for (const toolCall of response.tool_calls) {
              const fnName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);
              let result = '';

              clearSpinner(); // Pause spinner for interaction/logging

              if (fnName === 'read_file') {
                console.log(chalk.dim(`Reading ${args.path}...`));
                try {
                  const fullPath = path.resolve(process.cwd(), args.path);
                  if (fs.existsSync(fullPath)) {
                    result = fs.readFileSync(fullPath, 'utf-8');
                  } else {
                    result = `Error: File ${args.path} not found.`;
                  }
                } catch (err) {
                  result = `Error reading file: ${(err as Error).message}`;
                }
              } else if (fnName === 'list_files') {
                console.log(chalk.dim(`Listing ${args.path}...`));
                try {
                  const fullPath = path.resolve(process.cwd(), args.path);
                  if (fs.existsSync(fullPath)) {
                    const files = fs.readdirSync(fullPath);
                    result = files.join('\n');
                  } else {
                    result = `Error: Directory ${args.path} not found.`;
                  }
                } catch (err) {
                  result = `Error listing directory: ${(err as Error).message}`;
                }
              } else if (fnName === 'write_file') {
                console.log(chalk.yellow(`\nAI wants to write to '${args.path}'`));
                
                // Interactive confirmation
                rl.pause();
                let answer;
                try {
                  answer = await inquirer.prompt([
                    {
                      type: 'list',
                      name: 'action',
                      message: 'How do you want to proceed?',
                      choices: [
                        { name: 'Approve and Write', value: 'approve' },
                        { name: 'Reject', value: 'reject' },
                        { name: 'Show Content', value: 'show' }
                      ]
                    }
                  ]);

                  if (answer.action === 'show') {
                    console.log(chalk.gray('--- Content Start ---'));
                    console.log(args.content);
                    console.log(chalk.gray('--- Content End ---'));
                    
                    const confirm = await inquirer.prompt([
                      {
                        type: 'confirm',
                        name: 'ok',
                        message: 'Write this file now?',
                        default: true
                      }
                    ]);
                    
                    if (confirm.ok) {
                      answer.action = 'approve';
                    } else {
                      answer.action = 'reject';
                    }
                  }
                } finally {
                  rl.resume();
                }

                if (answer && answer.action === 'approve') {
                  try {
                    const fullPath = path.resolve(process.cwd(), args.path);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, args.content, 'utf-8');
                    console.log(chalk.green(`Saved ${args.path}`));
                    result = `Successfully wrote to ${args.path}`;
                  } catch (err) {
                    result = `Error writing file: ${(err as Error).message}`;
                  }
                } else {
                  console.log(chalk.red('Operation cancelled by user.'));
                  result = 'User denied the write operation.';
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
          } else {
            // Final text response
            clearSpinner();
            messages.push({ role: 'assistant', content: response.content });
            console.log(response.content);
            keepGoing = false;
          }
        }

      } catch (error) {
        clearSpinner();
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
