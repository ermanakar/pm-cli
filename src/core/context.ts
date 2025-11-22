import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProjectContext {
  summary: string;        // The combined project context as plain text
  sources: Array<{
    path: string;         // file path, e.g. "PMX.md" or "docs/product-vision.md"
    preview: string;      // first ~N chars of the file, for /context display
  }>;
}

const MAX_SUMMARY_LENGTH = 15000;
const PREVIEW_LENGTH = 200;

export async function buildProjectContext(cwd: string): Promise<ProjectContext> {
  const sources: ProjectContext['sources'] = [];
  let summary = '';

  // 1. Identify priority files
  const priorityFiles: string[] = [];

  // Check for PMX.md or GEMINI.md
  const pmxPath = path.join(cwd, 'PMX.md');
  const geminiPath = path.join(cwd, 'GEMINI.md');
  
  try {
    await fs.access(pmxPath);
    priorityFiles.push('PMX.md');
  } catch {
    try {
      await fs.access(geminiPath);
      priorityFiles.push('GEMINI.md');
    } catch {
      // Neither exists
    }
  }

  // Check for standard docs
  const standardDocs = ['docs/product-vision.md', 'docs/metrics.md'];
  for (const doc of standardDocs) {
    try {
      await fs.access(path.join(cwd, doc));
      priorityFiles.push(doc);
    } catch {
      // Doc doesn't exist
    }
  }

  // 2. Find feature one-pagers (max 3)
  // We'll use a simple glob pattern or directory traversal if glob isn't available.
  // Since we want to avoid heavy dependencies, let's try a manual search or assume glob is available if installed.
  // The user said "It’s okay to use a simple glob or fs.readdir recursively".
  // Let's do a manual search to avoid adding 'glob' dependency if it's not there, 
  // but actually I'll just use fs.readdir since the structure is specific: docs/features/*/one-pager.md
  
  const featureFiles: string[] = [];
  const featuresDir = path.join(cwd, 'docs/features');
  try {
    const features = await fs.readdir(featuresDir, { withFileTypes: true });
    for (const dirent of features) {
      if (dirent.isDirectory()) {
        const onePagerPath = path.join('docs/features', dirent.name, 'one-pager.md');
        try {
          await fs.access(path.join(cwd, onePagerPath));
          featureFiles.push(onePagerPath);
        } catch {
          // No one-pager in this feature folder
        }
      }
    }
  } catch {
    // docs/features might not exist
  }

  // Take up to 3 feature files
  const selectedFeatureFiles = featureFiles.slice(0, 3);
  const allFiles = [...priorityFiles, ...selectedFeatureFiles];

  // 3. Read files and build context
  for (const relativePath of allFiles) {
    try {
      const content = await fs.readFile(path.join(cwd, relativePath), 'utf-8');
      
      // Create preview
      let preview = content.slice(0, PREVIEW_LENGTH);
      if (content.length > PREVIEW_LENGTH) {
        preview += '...';
      }
      
      sources.push({
        path: relativePath,
        preview
      });

      // Append to summary
      const fileBlock = `[${relativePath}]\n${content}\n\n`;
      summary += fileBlock;

    } catch (err) {
      console.error(`Failed to read ${relativePath}:`, err);
    }
  }

  // 4. Truncate summary if needed
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH);
    summary += '\n\n[project context truncated]';
  }

  return {
    summary: summary.trim(),
    sources
  };
}
