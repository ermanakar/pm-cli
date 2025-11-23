import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import prompts from 'prompts';
import { listDocFiles, readDocFile } from '../core/fsTools';
import { createDefaultLLMClient } from '../core/llm';
import { saveGlobalConfig } from '../core/config';
import { runFeatureFlow } from '../core/scribe/engine';
import { runInvestigation } from '../core/investigator/engine';

export async function runInitFlow(): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀  Welcome to pmx! Let\'s onboard your project.\n'));
  console.log(chalk.dim('I am analyzing your codebase to understand the context...'));

  let llm;
  try {
    llm = createDefaultLLMClient();
  } catch (e) {
    console.log(chalk.yellow('\n⚠️  No OpenAI API Key found.'));
    console.log(chalk.dim('pmx requires an API key to generate plans and analyze code.'));
    
    const { apiKey } = await prompts({
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenAI API Key (sk-...):',
    });

    if (apiKey) {
      saveGlobalConfig({ openaiApiKey: apiKey });
      console.log(chalk.green('✓ Saved API key to global config.'));
      
      // Try again
      try {
        llm = createDefaultLLMClient();
      } catch (e2) {
         console.log(chalk.red('Still could not initialize LLM client. Proceeding in basic mode.'));
      }
    } else {
       console.log(chalk.yellow('Skipping AI setup. Falling back to basic mode.'));
    }
  }

  // 1. Deep Scan & Context Gathering
  console.log(chalk.blue('🔍  Scanning project structure...'));
  
  let context = '';
  let stack: string[] = [];
  let productProfile = {
    oneLiner: "A new project",
    targetAudience: "Users",
    suggestedNextSteps: [] as string[]
  };

  if (llm) {
    console.log(chalk.dim('    Running deep investigation (this may take 30-60s)...'));
    try {
      const investigation = await runInvestigation({
        text: "Perform a comprehensive analysis of this project. Identify the tech stack, core functionality, folder structure, and business purpose. Read key source files to understand the implementation."
      }, {
        maxTurns: 8, // Give it enough turns to explore
        maxTimeMs: 60 * 1000
      });

      context = `
Investigation Summary:
${investigation.summary}

Investigation Details:
${investigation.details}

Evidence Collected:
${investigation.evidence.map(e => `- ${e.path}`).join('\n')}
      `;

      console.log(chalk.green(`✓  Deep analysis complete.`));
      
      // 2. The "Magic Mirror" - Generate Product Profile
      console.log(chalk.blue('\n🧠  Synthesizing Product Identity...'));
      
      const profilePrompt = `
        You are a Product Visionary.
        Based on the investigation below, create a "Product Identity Card" for this project.
        
        INVESTIGATION:
        ${context}
        
        Return a JSON object with:
        - "oneLiner": A punchy, 1-sentence description of what this product IS (e.g. "A SaaS boilerplate for dog walkers").
        - "targetAudience": Who is this for? (e.g. "Solo founders building MVPs").
        - "suggestedNextSteps": An array of 3 specific, high-impact features or tasks the user should build NEXT. 
           (e.g. "Add Stripe Subscription", "Create User Dashboard", "Setup CI/CD").
           Do not suggest things that are already built.
      `;

      const response = await llm.chat([{ role: 'user', content: profilePrompt }]);
      const jsonStr = response.content?.match(/\{[\s\S]*\}/)?.[0];
      if (jsonStr) {
        productProfile = JSON.parse(jsonStr);
      }

    } catch (e) {
      console.log(chalk.yellow(`Deep investigation failed: ${(e as Error).message}`));
      console.log(chalk.dim('Falling back to shallow scan.'));
      stack = await detectStack();
      context = await gatherInitialContext();

      // Attempt to generate profile from shallow context if LLM is available
      if (llm && context) {
        console.log(chalk.dim('    Attempting to generate profile from shallow context...'));
        try {
           const profilePrompt = `
             You are a Product Visionary.
             Based on the shallow context below, create a "Product Identity Card" for this project.
             
             CONTEXT:
             ${context}
             
             Return a JSON object with:
             - "oneLiner": A punchy, 1-sentence description.
             - "targetAudience": Who is this for?
             - "suggestedNextSteps": 3 specific next steps.
           `;
           const response = await llm.chat([{ role: 'user', content: profilePrompt }]);
           const jsonStr = response.content?.match(/\{[\s\S]*\}/)?.[0];
           if (jsonStr) {
             productProfile = JSON.parse(jsonStr);
           }
        } catch (e2) {
           // Ignore
        }
     }
    }
  } else {
    stack = await detectStack();
    context = await gatherInitialContext();
  }
  
  // 3. The Reveal & Confirmation
  console.log(chalk.bold('\n✨  Here is what I see:'));
  console.log(chalk.dim('──────────────────────────────────────────────────'));
  console.log(`${chalk.bold('Product:')}  ${productProfile.oneLiner}`);
  console.log(`${chalk.bold('For:')}      ${productProfile.targetAudience}`);
  console.log(chalk.dim('──────────────────────────────────────────────────'));

  const confirm = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Does this sound right?',
    initial: true
  });

  if (!confirm.value) {
    // Allow manual override if AI got it wrong
    const corrections = await prompts([
      { type: 'text', name: 'oneLiner', message: 'What is the one-liner?' },
      { type: 'text', name: 'targetAudience', message: 'Who is the target audience?' }
    ]);
    if (corrections.oneLiner) productProfile.oneLiner = corrections.oneLiner;
    if (corrections.targetAudience) productProfile.targetAudience = corrections.targetAudience;
  }

  // 4. Generate PMX.md immediately
  console.log(chalk.blue('\n📝  Generating Product Master Plan (PMX.md)...'));
  const pmxContent = `# ${productProfile.oneLiner}\n\n## Vision\n${productProfile.oneLiner}\n\n## Target Audience\n${productProfile.targetAudience}\n\n## Context\n${context}`;
  await writeDirectly('PMX.md', pmxContent);
  await createDocsFolder();
  console.log(chalk.green('✓  PMX.md created.'));

  // 5. The Kickstart - Pick a feature to build NOW
  if (productProfile.suggestedNextSteps.length > 0) {
    console.log(chalk.bold('\n🚀  Let\'s get to work. Which of these should we tackle first?'));
    
    const choice = await prompts({
      type: 'select',
      name: 'feature',
      message: 'Select a feature to plan:',
      choices: [
        ...productProfile.suggestedNextSteps.map(s => ({ title: s, value: s })),
        { title: 'None (I will choose later)', value: 'none' }
      ]
    });

    if (choice.feature && choice.feature !== 'none') {
      console.log(chalk.cyan(`\n⚡️  Drafting spec for: "${choice.feature}"...`));
      try {
        const result = await runFeatureFlow(
          { title: choice.feature, description: "Drafted during onboarding kickstart." },
          { maxTurns: 8 }
        );
        console.log(chalk.green(`\n✓  Spec created at ${result.path}`));
        console.log(chalk.dim('   You can edit this file or run /plan to refine it.'));
      } catch (e) {
        console.log(chalk.red('Failed to draft spec: ' + (e as Error).message));
      }
    }
  }

  console.log(chalk.bold.green('\n✨  Onboarding complete!'));
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
    const files = await listDocFiles(cwd, '.', false);
    context += `\n--- Root Files ---\n${files.join('\n')}\n`;
  } catch {}

  return context;
}

async function detectStack(): Promise<string[]> {
  const stack: string[] = [];
  const rootFiles = await listDocFiles(process.cwd(), '.', false);
  
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
