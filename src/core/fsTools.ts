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

export interface SearchResult {
  path: string;
  matches: string[];
}

// --- Constants ---

const ALLOWED_WRITE_PREFIXES = ['docs/', '.pmx/'];

// We now use a blocklist for reading to support "Read Anything"
const BLOCKED_READ_PREFIXES = [
  '.git/',
  'node_modules/',
  '.env',
  '.DS_Store',
  'dist/',
  'build/',
  '.next/',
  'coverage/'
];

const PREVIEW_LENGTH = 200;

// --- Helper Functions ---

function normalizePath(projectRoot: string, relativePath: string, operation: 'read' | 'write'): DocPath {
  // Ensure path is relative and clean
  const cleanRelative = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  
  if (operation === 'write') {
    const isAllowed = ALLOWED_WRITE_PREFIXES.some(prefix => {
      if (prefix.endsWith('/')) {
        return cleanRelative.startsWith(prefix) || cleanRelative === prefix.slice(0, -1);
      }
      return cleanRelative === prefix;
    });

    if (!isAllowed) {
      throw new Error(`Access denied: Cannot write to '${cleanRelative}'. Allowed paths: ${ALLOWED_WRITE_PREFIXES.join(', ')}`);
    }
  } else {
    // Read operation: Check blocklist
    const isBlocked = BLOCKED_READ_PREFIXES.some(prefix => {
      if (prefix.endsWith('/')) {
        return cleanRelative.startsWith(prefix) || cleanRelative === prefix.slice(0, -1);
      }
      return cleanRelative === prefix;
    });

    if (isBlocked) {
      throw new Error(`Access denied: Cannot read from blocked path '${cleanRelative}'.`);
    }
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
 * @param recursive If false, only lists immediate children.
 * @param depth Max recursion depth (default: infinity).
 */
export async function listDocFiles(
  projectRoot: string, 
  prefix: string = 'docs/', 
  recursive: boolean = true,
  depth: number = 10
): Promise<string[]> {
  const results: string[] = [];
  
  let cleanPrefix = path.normalize(prefix).replace(/^(\.\.(\/|\\|$))+/, '');
  if (cleanPrefix === '.') cleanPrefix = '';
  
  const startDir = path.join(projectRoot, cleanPrefix);

  try {
    await fs.access(startDir);
  } catch {
    return []; 
  }

  async function scan(dir: string, currentDepth: number) {
    if (currentDepth > depth) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(projectRoot, fullPath);
      
      // Check blocklist
      const isBlocked = BLOCKED_READ_PREFIXES.some(prefix => {
        if (prefix.endsWith('/')) {
          return relPath.startsWith(prefix) || relPath === prefix.slice(0, -1) || prefix.startsWith(relPath + '/');
        }
        return relPath === prefix;
      });

      if (isBlocked) continue;

      if (entry.isDirectory()) {
         if (recursive) {
            await scan(fullPath, currentDepth + 1);
         } else {
            // If not recursive, we still want to indicate it's a folder
            results.push(relPath + '/');
         }
      } else if (entry.isFile()) {
         results.push(relPath);
      }
    }
  }

  await scan(startDir, 0);
  return results;
}

/**
 * Search for a string or regex pattern in allowed files.
 */
export async function searchFiles(projectRoot: string, pattern: string, caseSensitive: boolean = false): Promise<SearchResult[]> {
  const allFiles = await listDocFiles(projectRoot, ''); // List all allowed files
  const results: SearchResult[] = [];
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

  for (const filePath of allFiles) {
    try {
      const fullPath = path.join(projectRoot, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      const fileMatches: string[] = [];
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          // Reset lastIndex for global regex to ensure correct testing
          regex.lastIndex = 0; 
          fileMatches.push(`Line ${index + 1}: ${line.trim()}`);
        }
      });

      if (fileMatches.length > 0) {
        results.push({
          path: filePath,
          matches: fileMatches.slice(0, 10) // Limit matches per file to avoid huge outputs
        });
      }
    } catch (err) {
      // Ignore read errors during search
    }
  }

  return results.slice(0, 20); // Limit total files returned
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
