import path from 'path';

export class SafetyService {
    private allowedWritePaths: string[] = [
        'docs',
        '.pmx',
        'README.md', // Allow updating README
        'PMX.md'     // Allow updating PMX.md
    ];

    constructor(private rootDir: string = process.cwd()) { }

    /**
     * Checks if a file path is safe to write to.
     * @param filePath Absolute or relative path to the file.
     * @returns True if safe, false otherwise.
     */
    validateWrite(filePath: string): boolean {
        const resolvedPath = path.resolve(this.rootDir, filePath);
        const relativePath = path.relative(this.rootDir, resolvedPath);

        // Allowed paths:
        // 1. .pmx directory (and subdirectories)
        // 2. docs directory (and subdirectories)
        // 3. PMX.md in root
        // 4. README.md in root (optional, but good for docs)

        const isPmxDir = relativePath.startsWith('.pmx') || relativePath.startsWith('.pmx-global'); // Allow global config too
        const isDocsDir = relativePath.startsWith('docs');
        const isPmxFile = relativePath === 'PMX.md';
        const isReadme = relativePath === 'README.md';

        if (isPmxDir || isDocsDir || isPmxFile || isReadme) {
            return true;
        }

        throw new Error(`Safety Violation: Writing to '${relativePath}' is not allowed. Agent can only write to .pmx/, docs/, PMX.md, and README.md.`);
    }
}
