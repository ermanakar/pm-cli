import * as fs from 'fs';
import * as path from 'path';

export interface ProjectContext {
  systemContext: string;
  loadedFiles: string[];
}

const CONTEXT_FILES = [
  'PMX.md',
  'docs/product-vision.md',
  'docs/metrics.md'
];

export function loadProjectContext(): ProjectContext {
  const loadedFiles: string[] = [];
  let contextParts: string[] = [];

  for (const file of CONTEXT_FILES) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Simple truncation could go here if needed
        contextParts.push(`--- START OF ${file} ---\n${content}\n--- END OF ${file} ---`);
        loadedFiles.push(file);
      } catch (err) {
        // Ignore read errors for now
      }
    }
  }

  return {
    systemContext: contextParts.join('\n\n'),
    loadedFiles
  };
}
