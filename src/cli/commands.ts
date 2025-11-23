import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import prompts from 'prompts';
import { runInvestigation } from '../core/investigator/engine';
import { runFeatureFlow } from '../core/scribe/engine';
import { prepareDocWrite, applyPendingWrite } from '../core/fsTools';
import { logToolEvent, promptForWriteConfirmation } from './ui';
import { LLMMessage } from '../core/llm';
import { saveGlobalConfig, loadPMXConfig } from '../core/config';

export async function handleConfigCommand(
  args: string[],
  rl: readline.Interface
): Promise<void> {
  const [action, key, value] = args;

  if (!action || action === 'list') {
    const config = loadPMXConfig();

    // Mask API key for display
    const displayConfig = { ...config };
    if (displayConfig.openaiApiKey) {
      displayConfig.openaiApiKey = displayConfig.openaiApiKey.slice(0, 3) + '...' + displayConfig.openaiApiKey.slice(-4);
    }

    console.log(chalk.bold('\n⚙️  Current Configuration:'));
    console.log(JSON.stringify(displayConfig, null, 2));
    console.log('');
    return;
  }

  if (action === 'set') {
    if (!key || !value) {
      console.log(chalk.yellow('Usage: /config set <key> <value>'));
      return;
    }

    if (key === 'model') {
      saveGlobalConfig({ model: value });
      console.log(chalk.green(`✓ Updated model to: ${value}`));
    } else if (key === 'openaiApiKey') {
      saveGlobalConfig({ openaiApiKey: value });
      console.log(chalk.green(`✓ Updated OpenAI API Key`));
    } else {
      console.log(chalk.yellow(`Unknown config key: ${key}`));
    }
    return;
  }

  console.log(chalk.yellow('Usage: /config [list|set <key> <value>]'));
}

export async function handleInvestigateCommand(
  args: string[],
  rl: readline.Interface,
  messages: LLMMessage[]
): Promise<void> {
  const objectiveText = args.join(' ');
  if (!objectiveText) {
    console.log(chalk.yellow('Usage: /investigate <objective>'));
    return;
  }

  console.log(chalk.magenta(`\n🕵️  Starting investigation: "${objectiveText}"`));
  console.log(chalk.dim('This may take a minute...\n'));

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

    const saveAnswer = await prompts({
      type: 'confirm',
      name: 'save',
      message: 'Save this report to docs/investigations/?',
      initial: false
    });

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

    messages.push({
      role: 'system',
      content: `[System] The user ran an investigation: "${objectiveText}".\n\nResult Summary:\n${result.summary}\n\nResult Details:\n${result.details}\n\n(You can now answer questions based on this investigation.)`
    });

  } catch (err) {
    console.error(chalk.red(`Investigation failed: ${(err as Error).message}`));
  } finally {
    rl.resume();
  }
}

export async function handleFeatureCommand(
  args: string[],
  rl: readline.Interface,
  messages: LLMMessage[]
): Promise<void> {
  const requestText = args.join(' ');
  if (!requestText) {
    console.log(chalk.yellow('Usage: /plan <feature description>'));
    return;
  }

  console.log(chalk.cyan(`\n✍️  Starting feature planning: "${requestText}"`));
  console.log(chalk.dim('I will draft a spec for you...\n'));

  rl.pause();

  try {
    const result = await runFeatureFlow(
      { title: 'Feature Request', description: requestText },
      { maxTurns: 10 }
    );

    console.log(chalk.bold('\n--- Planning Complete ---\n'));
    console.log(chalk.bold('Summary:'));
    console.log(result.summary);
    console.log('\n' + chalk.dim('─'.repeat(40)) + '\n');
    console.log(chalk.green(`Draft saved to: ${result.path}`));

    messages.push({
      role: 'system',
      content: `[System] The user ran a feature plan: "${requestText}".\n\nResult Summary:\n${result.summary}\n\nOutput File:\n${result.path}\n\n(You can now discuss this spec.)`
    });

  } catch (err) {
    console.error(chalk.red(`Planning failed: ${(err as Error).message}`));
  } finally {
    rl.resume();
  }
}

import { runRoadmapFlow } from '../core/roadmap/engine';

export async function handleRoadmapCommand(
  args: string[],
  rl: readline.Interface,
  messages: LLMMessage[]
): Promise<void> {
  const requestText = args.join(' ') || 'Review and update the roadmap based on the current context.';

  console.log(chalk.cyan(`\n🗺️  Opening Roadmap...`));
  console.log(chalk.dim('Analyzing strategy...\n'));

  rl.pause();

  try {
    const result = await runRoadmapFlow(requestText);

    console.log(chalk.bold('\n--- Roadmap Update Complete ---\n'));
    console.log(result.summary);
    console.log('\n' + chalk.dim('─'.repeat(40)) + '\n');

    messages.push({
      role: 'system',
      content: `[System] The user updated the roadmap.\n\nSummary:\n${result.summary}`
    });

  } catch (err) {
    console.error(chalk.red(`Roadmap update failed: ${(err as Error).message}`));
  } finally {
    rl.resume();
  }
}

import { runTicketFlow } from '../core/scribe/tickets';

export async function handleTicketsCommand(
  args: string[],
  rl: readline.Interface,
  messages: LLMMessage[]
): Promise<void> {
  const inputPath = args[0];
  if (!inputPath) {
    console.log(chalk.red('Usage: /tickets <path-to-prd>'));
    return;
  }

  let targetPath = inputPath;

  // UX Polish: Fuzzy match if file doesn't exist
  if (!fs.existsSync(path.resolve(process.cwd(), targetPath))) {
    // Try adding .md
    if (fs.existsSync(path.resolve(process.cwd(), targetPath + '.md'))) {
      targetPath += '.md';
    }
    // Try looking in docs/features
    else if (fs.existsSync(path.resolve(process.cwd(), 'docs/features', targetPath))) {
      targetPath = path.join('docs/features', targetPath);
    }
    else if (fs.existsSync(path.resolve(process.cwd(), 'docs/features', targetPath + '.md'))) {
      targetPath = path.join('docs/features', targetPath + '.md');
    }
    else {
      console.log(chalk.red(`Could not find PRD at '${inputPath}'`));
      console.log(chalk.dim('Tip: You can use the filename (e.g. "login") if it is in docs/features.'));
      return;
    }
  }

  console.log(chalk.cyan(`\n🎫  Generating tickets from ${targetPath}...`));
  console.log(chalk.dim('Breaking down tasks...\n'));

  rl.pause();

  try {
    const result = await runTicketFlow(targetPath);

    console.log(chalk.bold('\n--- Tickets Generated ---\n'));
    console.log(chalk.green(`✓ Created ${result.count} tickets`));
    console.log(chalk.dim(`Saved to: ${result.path}`));
    console.log('\n' + chalk.dim('─'.repeat(40)) + '\n');

    messages.push({
      role: 'system',
      content: `[System] The user generated tickets from ${targetPath}.\n\nOutput: ${result.path}`
    });

  } catch (err) {
    console.error(chalk.red(`Ticket generation failed: ${(err as Error).message}`));
  } finally {
    rl.resume();
  }
}
