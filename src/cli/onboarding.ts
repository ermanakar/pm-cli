import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { listDocFiles, readDocFile } from '../core/fsTools';
import { createDefaultLLMClient } from '../core/llm';

export async function runInitFlow(): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀  Welcome to pmx! Let\'s onboard your project.\n'));
  console.log(chalk.dim('I am analyzing your codebase to understand the context...'));

  let llm;
  try {
    llm = createDefaultLLMClient();
  } catch (e) {
    console.log(chalk.yellow('Warning: No LLM client available (check OPENAI_API_KEY). Falling back to basic mode.'));
  }

  // 1. Deep Scan & Context Gathering
  console.log(chalk.blue('🔍  Scanning project structure...'));
  const stack = await detectStack();
  const context = await gatherInitialContext();
  
  console.log(chalk.green(`✓  Analyzed project structure`));
  if (stack.length) console.log(chalk.green(`✓  Detected stack: ${chalk.bold(stack.join(', '))}`));

  let questions = [
    "What is the core value proposition of this project?",
    "Who is your ideal customer?",
    "What is the most critical feature to build next?"
  ];

  // 2. Generate Dynamic Questions (if LLM available)
  if (llm) {
    console.log(chalk.blue('\n🤔  Formulating questions for you...'));
    try {
      const analysisPrompt = `
        You are an expert Product Manager joining a new team.
        
        Project Context:
        ${context}
        
        Detected Stack: ${stack.join(', ')}
        
        Your goal is to create a "Product Master Plan" (PMX.md).
        Based on the code and context above, generate 3 specific, high-value questions for the founder.
        Do not ask generic questions if the code already answers them.
        Focus on:
        1. The "Why" (Vision)
        2. The "Who" (Target User) - if not obvious
        3. The "What's Next" (Immediate priorities)
        
        Return ONLY a JSON array of strings. Example: ["Question 1?", "Question 2?"]
        Keep questions concise (max 15 words) to avoid terminal wrapping issues.
      `;

      const response = await llm.chat([{ role: 'user', content: analysisPrompt }]);
      const jsonStr = response.content?.match(/\[.*\]/s)?.[0];
      if (jsonStr) {
        questions = JSON.parse(jsonStr);
        // Ensure questions are strings and not too long
        questions = questions.map(q => String(q).trim());
      }
    } catch (e) {
      // Fallback to default questions
    }
  }

  // 3. Interview
  console.log(chalk.dim('\nPlease answer the following to set the product direction:\n'));
  
  const answers: Record<string, string> = {};
  let qIndex = 1;

  for (const q of questions) {
    console.log(chalk.bold.cyan(`\n❓ Question ${qIndex}/${questions.length}:`));
    console.log(chalk.bold(q));
    
    const { answer } = await inquirer.prompt([{
      type: 'input',
      name: 'answer',
      message: '>',
      prefix: ''
    }]);
    answers[q] = answer;
    qIndex++;
  }

  // 4. Generation
  console.log(chalk.blue('\n🧠  Synthesizing Product Master Plan...'));
  
  let pmxContent = '';
  
  if (llm) {
    const generationPrompt = `
      Generate a comprehensive "PMX.md" file (Markdown) for this project.
      
      Context:
      ${context}
      
      Founder Interview:
      ${Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}
      
      The file should be professional, inspiring, and practical.
      Structure:
      # [Project Name] - Product Master Plan
      
      ## 1. Vision & Core Value
      (Synthesize the vision)
      
      ## 2. Target Audience
      (Who are we building for?)
      
      ## 3. Technical Foundation
      (Briefly summarize the stack and architecture based on your analysis)
      
      ## 4. Current Status & Context
      (What is the state of the project?)
      
      ## 5. Roadmap
      ### Immediate Focus
      (Actionable next steps)
      ### Future Horizons
      (Longer term ideas)
      
      Return ONLY the markdown content.
    `;

    const pmxResponse = await llm.chat([{ role: 'user', content: generationPrompt }]);
    pmxContent = pmxResponse.content || '';
  } else {
    // Fallback template
    pmxContent = `# Project Context\n\n## Vision\n${Object.values(answers).join('\n\n')}`;
  }

  await writeDirectly('PMX.md', pmxContent);
  await createDocsFolder();

  console.log(chalk.bold.green('\n✨  Onboarding complete!'));
  console.log(chalk.dim('I have created PMX.md with a synthesized product strategy.'));
  
  showTutorial();
}

function showTutorial() {
  console.log(chalk.bold.cyan('\n📘  How to use pmx'));
  console.log(chalk.dim('──────────────────────────────────────────────────'));
  
  console.log(chalk.bold('\n1. The Mental Model'));
  console.log(`   pmx acts as your ${chalk.bold('Product Co-pilot')}. It reads your code and`);
  console.log(`   ${chalk.bold('PMX.md')} to understand context. You plan, it helps build.`);

  console.log(chalk.bold('\n2. Key Commands'));
  console.log(`   ${chalk.cyan('/investigate')}  →  Deep dive into how a feature works`);
  console.log(`   ${chalk.cyan('/context')}      →  See what files pmx is reading`);
  console.log(`   ${chalk.cyan('/help')}         →  List all available commands`);

  console.log(chalk.bold('\n3. What I can do'));
  console.log(`   • Read and analyze your codebase`);
  console.log(`   • Create and edit files (with your permission)`);
  console.log(`   • Run terminal commands (tests, builds, etc.)`);
  console.log(`   • Draft feature specs and roadmaps`);

  console.log(chalk.bold('\n💡  Try this first:'));
  console.log(`   Type: "${chalk.italic('Help me plan the next feature on the roadmap')}"`);
  console.log('');
}

async function gatherInitialContext(): Promise<string> {
  let context = '';
  const cwd = process.cwd();
  
  // Read README
  try {
    const readme = await readDocFile(cwd, 'README.md');
    context += `\n--- README.md ---\n${readme.content.slice(0, 2000)}\n`;
  } catch {}

  // Read package.json
  try {
    const pkg = await readDocFile(cwd, 'package.json');
    context += `\n--- package.json ---\n${pkg.content}\n`;
  } catch {}

  // List top-level files
  try {
    const files = await listDocFiles(cwd, '.');
    context += `\n--- Root Files ---\n${files.join('\n')}\n`;
  } catch {}

  return context;
}

async function detectStack(): Promise<string[]> {
  const stack: string[] = [];
  const rootFiles = await listDocFiles(process.cwd(), '.');
  
  if (rootFiles.includes('package.json')) {
    try {
      const pkg = JSON.parse((await readDocFile(process.cwd(), 'package.json')).content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps['react']) stack.push('React');
      if (deps['next']) stack.push('Next.js');
      if (deps['vue']) stack.push('Vue');
      if (deps['typescript']) stack.push('TypeScript');
      if (deps['tailwindcss']) stack.push('Tailwind');
      if (deps['prisma']) stack.push('Prisma');
      if (deps['supabase-js'] || deps['@supabase/supabase-js']) stack.push('Supabase');
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  if (rootFiles.includes('tsconfig.json') && !stack.includes('TypeScript')) stack.push('TypeScript');
  if (rootFiles.includes('go.mod')) stack.push('Go');
  if (rootFiles.includes('Cargo.toml')) stack.push('Rust');
  if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) stack.push('Python');

  return stack;
}

async function createDocsFolder() {
  try {
    await fs.mkdir(path.join(process.cwd(), 'docs/features'), { recursive: true });
    await fs.mkdir(path.join(process.cwd(), 'docs/investigations'), { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

// Helper to write without the full "proposal" flow since this is the init command
async function writeDirectly(relativePath: string, content: string) {
  try {
    const fullPath = path.join(process.cwd(), relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(chalk.dim(`   Created ${relativePath}`));
  } catch (e) {
    console.error(chalk.red(`   Failed to create ${relativePath}: ${(e as Error).message}`));
  }
}
