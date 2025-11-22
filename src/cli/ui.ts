import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { PendingWrite, WriteStatus } from '../core/fsTools';

export type ToolEventType = 'readFile' | 'writeFile' | 'readFolder' | 'shell';

export interface ToolEvent {
  type: ToolEventType;
  target: string;
  status: 'ok' | 'error' | 'pending' | 'cancelled';
  preview?: string;
  message?: string;
}

/**
 * Renders a structured "Tool Box" to the terminal.
 */
export function logToolEvent(event: ToolEvent) {
  const width = 80;
  const borderChar = '─';
  const topBorder = `╭${borderChar.repeat(width)}╮`;
  const bottomBorder = `╰${borderChar.repeat(width)}╯`;
  const emptyLine = `│${' '.repeat(width)}│`;

  let icon = '';
  let color = chalk.white;

  switch (event.status) {
    case 'ok':
      icon = '✓';
      color = chalk.green;
      break;
    case 'error':
      icon = '✗';
      color = chalk.red;
      break;
    case 'pending':
      icon = '?';
      color = chalk.yellow;
      break;
    case 'cancelled':
      icon = '⊘';
      color = chalk.gray;
      break;
  }

  // Format the title line: "✓  ReadFile docs/foo.md"
  const typeLabel = event.type === 'readFile' ? 'ReadFile' : 
                    event.type === 'writeFile' ? 'WriteFile' :
                    event.type === 'readFolder' ? 'ReadFolder' : 'Shell';
  
  // Calculate available space for target
  // Fixed parts: "X  Label " (3 + label.length + 1)
  const prefixLength = 3 + typeLabel.length + 1;
  const maxTargetLength = width - 2 - prefixLength;
  
  let displayTarget = event.target;
  if (displayTarget.length > maxTargetLength) {
    displayTarget = '...' + displayTarget.slice(-(maxTargetLength - 3));
  }

  const titleContent = `${icon}  ${chalk.bold(typeLabel)} ${displayTarget}`;
  
  // Calculate padding based on visible length (ignoring ANSI codes)
  const visibleLength = prefixLength + displayTarget.length;
  const padding = width - 2 - visibleLength;
  
  console.log(topBorder);
  console.log(`│ ${color(titleContent)}${' '.repeat(Math.max(0, padding))} │`);

  if (event.message) {
    // Truncate message if needed
    let msg = event.message;
    if (msg.length > width - 2) {
      msg = msg.slice(0, width - 5) + '...';
    }
    console.log(`│ ${chalk.dim(msg.padEnd(width - 2))} │`);
  }

  if (event.preview) {
    console.log(emptyLine);
    const lines = event.preview.split('\n');
    for (const line of lines) {
      // Simple truncation for display
      const truncated = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
      console.log(`│ ${chalk.dim(truncated.padEnd(width - 2))} │`);
    }
  }

  console.log(bottomBorder);
}

/**
 * Interactive menu for confirming a write operation.
 */
export async function promptForWriteConfirmation(pending: PendingWrite): Promise<WriteStatus> {
  // Render the "Pending" box first
  logToolEvent({
    type: 'writeFile',
    target: pending.path,
    status: 'pending',
    message: `Reason: ${pending.reason}`,
    preview: `... first lines hidden ...\n${pending.newContent.slice(0, 200).replace(/\n/g, '\n')}...`
  });

  console.log(chalk.bold('\nApply this change?'));

  while (true) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Select an action:',
        choices: [
          { name: 'Yes, allow once', value: 'approved' },
          // { name: 'Yes, allow always', value: 'always' }, // Future feature
          { name: 'Show full content', value: 'show' },
          { name: 'No, cancel', value: 'rejected' }
        ]
      }
    ]);

    if (answer.choice === 'show') {
      console.log(chalk.gray('--- Full Content Start ---'));
      console.log(pending.newContent);
      console.log(chalk.gray('--- Full Content End ---'));
      continue;
    }

    return answer.choice as WriteStatus;
  }
}
