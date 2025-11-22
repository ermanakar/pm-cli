#!/usr/bin/env node

import { program } from 'commander';
import { startRepl } from './repl';

program
  .version('0.0.1')
  .description('Product CLI for founder/engineers');

program.parse(process.argv);

// If no command is specified, start the REPL
if (!process.argv.slice(2).length) {
  startRepl();
}