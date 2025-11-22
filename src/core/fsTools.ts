import * as fs from 'fs/promises';
import * as path from 'path';

// --- Types ---

export interface DocPath {
  projectRoot: string;
  relativePath: string;
  absolutePath: string;
}

export interface DocContent {
  path: string;
  content: string;
  preview: string;
}

export interface PendingWrite {
  path: string;
  oldContent: string | null;
  newContent: string;
  reason: string;
}

export type WriteStatus = 'approved' | 'rejected';

// --- Constants ---

const ALLOWED_WRITE_PREFIXES = ['docs/', '.pmx/'];
const ALLOWED_READ_PREFIXES = [
  'docs/', 
  '.pmx/', 
  'src/', 
  'package.json', 
  'README.md', 
  'tsconfig.json', 
  'PMX.md', 
  'GEMINI.md'
];
const PREVIEW_LENGTH = 200;

// --- Helper Functions ---

function normalizePath(projectRoot: string, relativePath: string, operation: 'read' | 'write'): DocPath {
  // Ensure path is relative and clean
  const cleanRelative = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  
  const allowedList = operation === 'write' ? ALLOWED_WRITE_PREFIXES : ALLOWED_READ_PREFIXES;
  
  const isAllowed = allowedList.some(prefix => {
    if (prefix.endsWith('/')) {
      return cleanRelative.startsWith(prefix) || cleanRelative === prefix.slice(0, -1);
    }
    return cleanRelative === prefix;
  });

  if (!isAllowed) {
    const action = operation === 'write' ? 'write to' : 'read from';
    throw new Error(`Access denied: Cannot ${action} '${cleanRelative}'. Allowed paths: ${allowedList.join(', ')}`);
  }

  return {
    projectRoot,
    relativePath: cleanRelative,
    absolutePath: path.resolve(projectRoot, cleanRelative)
  };
}

// --- API ---

/**
 * List files in the project (read-only).
 */
export async function listDocFiles(projectRoot: string, prefix: string = 'docs/'): Promise<string[]> {
  const results: string[] = [];
  
  let cleanPrefix = path.normalize(prefix).replace(/^(\.\.(\/|\\|$))+/, '');
  if (cleanPrefix === '.') cleanPrefix = '';
  
  const startDir = path.join(projectRoot, cleanPrefix);

  try {
    await fs.access(startDir);
  } catch {
    return []; 
  }

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(projectRoot, fullPath);
      
      if (entry.isDirectory()) {
         // Only recurse if this directory is within an allowed tree.
         const isDirAllowed = ALLOWED_READ_PREFIXES.some(p => {
            return (p.endsWith('/') && (relPath.startsWith(p) || relPath === p.slice(0, -1) || p.startsWith(relPath + '/')));
         });
         
         if (isDirAllowed) {
            await scan(fullPath);
         }
      } else if (entry.isFile()) {
         const isFileAllowed = ALLOWED_READ_PREFIXES.some(p => {
            if (p.endsWith('/')) {
               return relPath.startsWith(p);
            }
            return relPath === p;
         });
         
         if (isFileAllowed) {
            results.push(relPath);
         }
      }
    }
  }

  await scan(startDir);
  return results;
}

/**
 * Read a single file safely.
 */
export async function readDocFile(projectRoot: string, relativePath: string): Promise<DocContent> {
  const docPath = normalizePath(projectRoot, relativePath, 'read');
  
  try {
    const content = await fs.readFile(docPath.absolutePath, 'utf-8');
    let preview = content.slice(0, PREVIEW_LENGTH);
    if (content.length > PREVIEW_LENGTH) preview += '...';
    
    return {
      path: docPath.relativePath,
      content,
      preview
    };
  } catch (err) {
    throw new Error(`Failed to read file '${docPath.relativePath}': ${(err as Error).message}`);
  }
}

/**
 * Prepare a write operation without executing it.
 */
export async function prepareDocWrite(
  projectRoot: string, 
  relativePath: string, 
  newContent: string, 
  reason: string
): Promise<PendingWrite> {
  const docPath = normalizePath(projectRoot, relativePath, 'write');
  let oldContent: string | null = null;

  try {
    oldContent = await fs.readFile(docPath.absolutePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  return {
    path: docPath.relativePath,
    oldContent,
    newContent,
    reason
  };
}

/**
 * Apply a pending write to disk.
 * This function assumes confirmation has already happened.
 */
export async function applyPendingWrite(
  projectRoot: string, 
  pending: PendingWrite
): Promise<void> {
  const docPath = normalizePath(projectRoot, pending.path, 'write');
  const dir = path.dirname(docPath.absolutePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(docPath.absolutePath, pending.newContent, 'utf-8');
}
