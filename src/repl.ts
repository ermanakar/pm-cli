import * as readline from 'readline';
import chalk from 'chalk';

export function startRepl() {
  console.log(chalk.bold('pmx – Product CLI'));
  console.log(chalk.dim('Project: PMCLI (...)'));
  console.log(chalk.dim('Type /help for commands, /quit to exit.'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('pmx> '),
  });

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    switch (input) {
      case '/help':
        console.log(chalk.dim('Available commands:'));
        console.log(chalk.dim('  /help  - Show this help message'));
        console.log(chalk.dim('  /quit  - Exit the application'));
        break;
      case '/quit':
        rl.close();
        break;
      default:
        console.log(`Received: ${input}`);
        break;
    }
    rl.prompt();
  }).on('close', () => {
    console.log('Exiting pmx.');
    process.exit(0);
  });
}
