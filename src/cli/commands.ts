import * as readline from 'readline';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { runInvestigation } from '../core/investigator/engine';
import { runFeatureFlow } from '../core/scribe/engine';
import { prepareDocWrite, applyPendingWrite } from '../core/fsTools';
import { logToolEvent, promptForWriteConfirmation } from './ui';
import { LLMMessage } from '../core/llm';

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
