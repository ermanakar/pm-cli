import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
  relativePath: string = '.',
  recursive: boolean = false,
  depth: number = 2
): Promise<string[]> {
  const { absolutePath, relativePath: cleanRelative } = normalizePath(projectRoot, relativePath, 'read');

  // Safety: Prevent recursive root scan without filters
  if (recursive && cleanRelative === '.' && depth > 1) {
    throw new Error("Safety: Recursive scan of root directory is not allowed. Please scan specific folders (e.g. 'app', 'src') or use non-recursive mode.");
  }

  const entries: string[] = [];
  const maxEntries = 200; // Hard cap

  async function walk(dir: string, currentDepth: number) {
    if (currentDepth > depth) return;
    if (entries.length >= maxEntries) return;

    let files;
    try {
      files = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return; // Skip if access denied or not found
    }

    for (const file of files) {
      if (entries.length >= maxEntries) break;

      const resPath = path.resolve(dir, file.name);
      const relPath = path.relative(projectRoot, resPath);

      // Check blocklist
      const isBlocked = BLOCKED_READ_PREFIXES.some(prefix => {
        if (prefix.endsWith('/')) {
          return relPath.startsWith(prefix) || relPath === prefix.slice(0, -1);
        }
        return relPath === prefix;
      });

      if (isBlocked) continue;

      if (file.isDirectory()) {
        if (recursive) {
          await walk(resPath, currentDepth + 1);
        } else {
          entries.push(relPath + '/');
        }
      } else {
        entries.push(relPath);
      }
    }
  }

  await walk(absolutePath, 1);

  if (entries.length >= maxEntries) {
    entries.push("... (truncated: max 200 files)");
  }

  return entries;
}

/**
 * Search for a string or regex pattern in allowed files.
 */
export async function searchFiles(cwd: string, pattern: string): Promise<string[]> {
  // Safety: Limit the number of matches to prevent context explosion
  const MAX_MATCHES = 50;
  const MAX_PREVIEW_LENGTH = 200;

  try {
    const { stdout } = await execAsync(`grep -r "${pattern}" .`, { cwd, maxBuffer: 1024 * 1024 });
    const lines = stdout.split('\n').filter(Boolean);

    // Filter out blocked prefixes
    const allowedLines = lines.filter(line => {
      const filePath = line.split(':')[0];
      return !BLOCKED_READ_PREFIXES.some(prefix => filePath.startsWith(prefix));
    });

    if (allowedLines.length > MAX_MATCHES) {
      return [
        ...allowedLines.slice(0, MAX_MATCHES),
        `... and ${allowedLines.length - MAX_MATCHES} more matches (truncated for safety)`
      ];
    }

    return allowedLines.map(line => {
      if (line.length > MAX_PREVIEW_LENGTH) {
        return line.substring(0, MAX_PREVIEW_LENGTH) + '...';
      }
      return line;
    });
  } catch (error) {
    return [];
  }
}

/**
 * Read a single file safely.
 */
export async function readDocFile(projectRoot: string, relativePath: string): Promise<DocContent> {
  const docPath = normalizePath(projectRoot, relativePath, 'read');

  try {
    const content = await fs.readFile(docPath.absolutePath, 'utf-8');

    // Safety: Truncate massive files
    const MAX_CHARS = 10000;
    let safeContent = content;
    if (content.length > MAX_CHARS) {
      safeContent = content.slice(0, MAX_CHARS) + `\n\n[...File truncated. Total size: ${content.length} chars. Use a more specific search or read in chunks...]`;
    }

    let preview = safeContent.slice(0, PREVIEW_LENGTH);
    if (safeContent.length > PREVIEW_LENGTH) preview += '...';

    return {
      path: docPath.relativePath,
      content: safeContent,
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

  // Ensure directory exists
  await fs.mkdir(path.dirname(docPath.absolutePath), { recursive: true });

  // Write file
  await fs.writeFile(docPath.absolutePath, pending.newContent, 'utf-8');
}
