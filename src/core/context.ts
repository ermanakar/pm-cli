import * as fs from 'fs';
import * as path from 'path';

export interface ProjectContext {
  systemContext: string;
  loadedFiles: string[];
}

const CONTEXT_FILES = [
  'PMX.md',
  'package.json',
  'docs/product-vision.md',
  'docs/metrics.md'
];

function getFileTree(dir: string, depth: number = 0, maxDepth: number = 2): string {
  if (depth > maxDepth) return '';
  
  let tree = '';
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file.startsWith('.')) continue;
    
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    const indent = '  '.repeat(depth);
    
    if (stats.isDirectory()) {
      tree += `${indent}${file}/\n`;
      tree += getFileTree(filePath, depth + 1, maxDepth);
    } else {
      tree += `${indent}${file}\n`;
    }
  }
  return tree;
}

export function loadProjectContext(): ProjectContext {
  const loadedFiles: string[] = [];
  let contextParts: string[] = [];

  // 1. Load specific high-value context files
  for (const file of CONTEXT_FILES) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        contextParts.push(`<file path="${file}">\n${content}\n</file>`);
        loadedFiles.push(file);
      } catch (err) {
        // Ignore read errors for now
      }
    }
  }

  // 2. Generate and append file tree
  try {
    const fileTree = getFileTree(process.cwd());
    contextParts.push(`<file-tree>\n${fileTree}\n</file-tree>`);
  } catch (err) {
    // Ignore tree generation errors
  }

  return {
    systemContext: contextParts.join('\n\n'),
    loadedFiles
  };
}
