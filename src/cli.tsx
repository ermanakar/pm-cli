#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './app.js';

const program = new Command();

program
    .name('pmx')
    .description('Product Master Plan CLI')
    .version('0.0.1');

program
    .command('chat', { isDefault: true })
    .description('Start the PMX chat interface')
    .action(() => {
        render(<App />);
    });

program.parse(process.argv);
