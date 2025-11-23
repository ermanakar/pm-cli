import * as readline from 'readline';
import chalk from 'chalk';
import { listDocFiles, readDocFile, prepareDocWrite, applyPendingWrite } from '../../core/fsTools';
import { runInvestigation } from '../../core/investigator/engine';
import { runFeatureFlow } from '../../core/scribe/engine';
import { logToolEvent, promptForWriteConfirmation } from '../ui';

type ToolHandler = (args: any, rl: readline.Interface) => Promise<string>;

const handlers: Record<string, ToolHandler> = {
  read_file: async (args) => {
    try {
      const doc = await readDocFile(process.cwd(), args.path);
      logToolEvent({ type: 'readFile', target: args.path, status: 'ok', preview: doc.preview });
      return doc.content;
    } catch (err) {
      logToolEvent({ type: 'readFile', target: args.path, status: 'error', message: (err as Error).message });
      return `Error reading file: ${(err as Error).message}`;
    }
  },
  
  list_files: async (args) => {
    try {
      const targetPath = args.path || '.';
      const files = await listDocFiles(process.cwd(), targetPath);
      logToolEvent({ type: 'readFolder', target: targetPath, status: 'ok', message: `Found ${files.length} files.` });
      return files.join('\n');
    } catch (err) {
      logToolEvent({ type: 'readFolder', target: args.path || '.', status: 'error', message: (err as Error).message });
      return `Error listing directory: ${(err as Error).message}`;
    }
  },

  write_file: async (args, rl) => {
    rl.pause();
    try {
      const pending = await prepareDocWrite(process.cwd(), args.path, args.content, args.reason || 'No reason provided');
      const status = await promptForWriteConfirmation(pending);
      
      if (status === 'approved') {
        await applyPendingWrite(process.cwd(), pending);
        logToolEvent({ type: 'writeFile', target: args.path, status: 'ok', message: 'File saved successfully.' });
        return `Successfully wrote to ${args.path}`;
      } else {
        logToolEvent({ type: 'writeFile', target: args.path, status: 'cancelled', message: 'User rejected the write.' });
        return 'ERROR: User rejected the write operation.';
      }
    } catch (err) {
      logToolEvent({ type: 'writeFile', target: args.path, status: 'error', message: (err as Error).message });
      return `Error preparing write: ${(err as Error).message}`;
    } finally {
      rl.resume();
    }
  },

  run_investigation: async (args, rl) => {
    console.log(chalk.magenta(`\n🕵️  Starting investigation: "${args.objective}"`));
    rl.pause();
    try {
      const invResult = await runInvestigation(
        { text: args.objective },
        { maxTurns: 10, maxTimeMs: 3 * 60 * 1000 }
      );
      logToolEvent({ type: 'shell', target: 'investigator', status: 'ok', message: 'Investigation finished.' });
      return `Investigation Complete.\n\nSUMMARY:\n${invResult.summary}\n\nDETAILS:\n${invResult.details}\n\nEVIDENCE:\n${invResult.evidence.map(e => `- ${e.path}: ${e.summary}`).join('\n')}`;
    } catch (err) {
      logToolEvent({ type: 'shell', target: 'investigator', status: 'error', message: (err as Error).message });
      return `Investigation failed: ${(err as Error).message}`;
    } finally {
      rl.resume();
    }
  },

  run_feature_flow: async (args, rl) => {
    console.log(chalk.cyan(`\n✍️  Starting Scribe for: "${args.request}"`));
    rl.pause();
    try {
      const scribeResult = await runFeatureFlow(
        { title: 'Feature Request', description: args.request },
        { maxTurns: 10 }
      );
      logToolEvent({ type: 'shell', target: 'scribe', status: 'ok', message: 'Feature flow finished.' });
      return `Scribe Flow Complete.\n\nSUMMARY:\n${scribeResult.summary}\n\nOUTPUT FILE:\n${scribeResult.path}`;
    } catch (err) {
      logToolEvent({ type: 'shell', target: 'scribe', status: 'error', message: (err as Error).message });
      return `Scribe flow failed: ${(err as Error).message}`;
    } finally {
      rl.resume();
    }
  }
};

export async function handleToolCall(
  fnName: string, 
  args: any, 
  rl: readline.Interface
): Promise<string> {
  const handler = handlers[fnName];
  if (!handler) {
    return `Error: Unknown tool '${fnName}'`;
  }
  return handler(args, rl);
}
