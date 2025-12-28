import path from 'path';
import fs from 'fs-extra';
import { FileSystemService } from './FileSystemService.js';
import chalk from 'chalk';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface HealthReport {
    timestamp: string;
    score: number; // 0-100
    categories: {
        codeSize: CategoryScore;
        structure: CategoryScore;
        documentation: CategoryScore;
        testCoverage: CategoryScore;
    };
    issues: HealthIssue[];
    recommendations: string[];
    stats: ProjectStats;
}

export interface CategoryScore {
    score: number;
    label: string;
    details: string;
}

export interface HealthIssue {
    severity: 'info' | 'warning' | 'critical';
    category: string;
    title: string;
    description: string;
    affectedFiles: string[];
    suggestedAction?: string;
}

export interface ProjectStats {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
    largestFiles: { path: string; lines: number }[];
    directories: number;
}

export interface QuickStats {
    files: number;
    lines: number;
    mainLanguage: string;
    hasTests: boolean;
    hasReadme: boolean;
    hasDocs: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HEALTH SERVICE
// ═══════════════════════════════════════════════════════════════

export class HealthService {
    private readonly CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.swift', '.go', '.rs', '.java', '.kt'];
    private readonly TEST_PATTERNS = ['test', 'spec', '__tests__', 'tests'];
    private readonly DOC_FILES = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs'];

    constructor(
        private fileSystem: FileSystemService,
        private rootDir: string = process.cwd()
    ) { }

    // ─────────────────────────────────────────────────────────────
    // Quick Stats (for welcome screen)
    // ─────────────────────────────────────────────────────────────

    async getQuickStats(): Promise<QuickStats> {
        const stats = await this.gatherProjectStats();

        const languages = Object.entries(stats.languages);
        const mainLanguage = languages.length > 0
            ? languages.sort((a, b) => b[1] - a[1])[0][0]
            : 'Unknown';

        return {
            files: stats.totalFiles,
            lines: stats.totalLines,
            mainLanguage,
            hasTests: await this.hasTests(),
            hasReadme: await fs.pathExists(path.join(this.rootDir, 'README.md')),
            hasDocs: await fs.pathExists(path.join(this.rootDir, 'docs'))
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Full Health Check
    // ─────────────────────────────────────────────────────────────

    async runHealthCheck(): Promise<HealthReport> {
        const stats = await this.gatherProjectStats();
        const issues: HealthIssue[] = [];

        // Analyze each category
        const codeSize = await this.analyzeCodeSize(stats, issues);
        const structure = await this.analyzeStructure(stats, issues);
        const documentation = await this.analyzeDocumentation(issues);
        const testCoverage = await this.analyzeTestCoverage(stats, issues);

        // Calculate overall score
        const categoryScores = [codeSize, structure, documentation, testCoverage];
        const overallScore = Math.round(
            categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length
        );

        // Generate recommendations
        const recommendations = this.generateRecommendations(issues);

        return {
            timestamp: new Date().toISOString(),
            score: overallScore,
            categories: {
                codeSize,
                structure,
                documentation,
                testCoverage
            },
            issues,
            recommendations,
            stats
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Stats Gathering
    // ─────────────────────────────────────────────────────────────

    private async gatherProjectStats(): Promise<ProjectStats> {
        const stats: ProjectStats = {
            totalFiles: 0,
            totalLines: 0,
            languages: {},
            largestFiles: [],
            directories: 0
        };

        await this.walkDirectory(this.rootDir, stats);

        // Sort largest files
        stats.largestFiles.sort((a, b) => b.lines - a.lines);
        stats.largestFiles = stats.largestFiles.slice(0, 10);

        return stats;
    }

    private async walkDirectory(dir: string, stats: ProjectStats): Promise<void> {
        try {
            const entries = await this.fileSystem.listDir(dir);
            stats.directories++;

            for (const entry of entries) {
                const fullPath = path.join(dir, entry);
                const stat = await fs.stat(fullPath);

                if (stat.isDirectory()) {
                    await this.walkDirectory(fullPath, stats);
                } else if (stat.isFile()) {
                    const ext = path.extname(entry).toLowerCase();

                    if (this.CODE_EXTENSIONS.includes(ext)) {
                        stats.totalFiles++;

                        // Count lines
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const lines = content.split('\n').length;
                            stats.totalLines += lines;

                            // Track by language
                            const lang = this.extToLanguage(ext);
                            stats.languages[lang] = (stats.languages[lang] || 0) + lines;

                            // Track largest files
                            stats.largestFiles.push({
                                path: path.relative(this.rootDir, fullPath),
                                lines
                            });
                        } catch (e) {
                            // Skip files we can't read
                        }
                    }
                }
            }
        } catch (e) {
            // Skip directories we can't access
        }
    }

    private extToLanguage(ext: string): string {
        const map: Record<string, string> = {
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript',
            '.py': 'Python',
            '.swift': 'Swift',
            '.go': 'Go',
            '.rs': 'Rust',
            '.java': 'Java',
            '.kt': 'Kotlin'
        };
        return map[ext] || ext;
    }

    // ─────────────────────────────────────────────────────────────
    // Category Analyzers
    // ─────────────────────────────────────────────────────────────

    private async analyzeCodeSize(stats: ProjectStats, issues: HealthIssue[]): Promise<CategoryScore> {
        let score = 100;

        // Check for overly large files
        const largeFiles = stats.largestFiles.filter(f => f.lines > 500);
        const hugeFiles = stats.largestFiles.filter(f => f.lines > 1000);

        for (const file of hugeFiles) {
            issues.push({
                severity: 'critical',
                category: 'Code Size',
                title: `Very large file: ${file.path}`,
                description: `${file.lines} lines. Consider splitting into smaller modules.`,
                affectedFiles: [file.path],
                suggestedAction: 'Refactor into smaller, focused modules'
            });
            score -= 15;
        }

        for (const file of largeFiles.filter(f => f.lines <= 1000)) {
            issues.push({
                severity: 'warning',
                category: 'Code Size',
                title: `Large file: ${file.path}`,
                description: `${file.lines} lines. Consider refactoring.`,
                affectedFiles: [file.path],
                suggestedAction: 'Review for possible extraction of components'
            });
            score -= 5;
        }

        score = Math.max(0, Math.min(100, score));

        return {
            score,
            label: this.getScoreLabel(score),
            details: `${stats.totalFiles} files, ${stats.totalLines} lines total`
        };
    }

    private async analyzeStructure(stats: ProjectStats, issues: HealthIssue[]): Promise<CategoryScore> {
        let score = 100;

        // Check for common structural issues
        const hasPackageJson = await fs.pathExists(path.join(this.rootDir, 'package.json'));
        const hasSrc = await fs.pathExists(path.join(this.rootDir, 'src'));
        const hasGitignore = await fs.pathExists(path.join(this.rootDir, '.gitignore'));

        if (!hasPackageJson && !await fs.pathExists(path.join(this.rootDir, 'go.mod')) &&
            !await fs.pathExists(path.join(this.rootDir, 'Cargo.toml'))) {
            issues.push({
                severity: 'warning',
                category: 'Structure',
                title: 'No package manifest found',
                description: 'Missing package.json, go.mod, or Cargo.toml',
                affectedFiles: [],
                suggestedAction: 'Initialize a proper project structure'
            });
            score -= 20;
        }

        if (!hasSrc && stats.totalFiles > 5) {
            issues.push({
                severity: 'info',
                category: 'Structure',
                title: 'No src/ directory',
                description: 'Consider organizing code in a src/ directory',
                affectedFiles: [],
                suggestedAction: 'Create src/ directory for source files'
            });
            score -= 10;
        }

        if (!hasGitignore) {
            issues.push({
                severity: 'warning',
                category: 'Structure',
                title: 'No .gitignore file',
                description: 'Risk of committing sensitive or unnecessary files',
                affectedFiles: [],
                suggestedAction: 'Add a .gitignore file'
            });
            score -= 15;
        }

        score = Math.max(0, Math.min(100, score));

        return {
            score,
            label: this.getScoreLabel(score),
            details: `${stats.directories} directories`
        };
    }

    private async analyzeDocumentation(issues: HealthIssue[]): Promise<CategoryScore> {
        let score = 100;

        const hasReadme = await fs.pathExists(path.join(this.rootDir, 'README.md'));
        const hasDocs = await fs.pathExists(path.join(this.rootDir, 'docs'));
        const hasContributing = await fs.pathExists(path.join(this.rootDir, 'CONTRIBUTING.md'));
        const hasChangelog = await fs.pathExists(path.join(this.rootDir, 'CHANGELOG.md'));

        if (!hasReadme) {
            issues.push({
                severity: 'critical',
                category: 'Documentation',
                title: 'No README.md',
                description: 'Project lacks basic documentation',
                affectedFiles: [],
                suggestedAction: 'Create a README.md with project overview'
            });
            score -= 40;
        } else {
            // Check README quality
            const readme = await fs.readFile(path.join(this.rootDir, 'README.md'), 'utf-8');
            if (readme.length < 500) {
                issues.push({
                    severity: 'info',
                    category: 'Documentation',
                    title: 'README is brief',
                    description: 'Consider expanding documentation',
                    affectedFiles: ['README.md']
                });
                score -= 10;
            }
        }

        if (!hasDocs && !hasContributing) {
            issues.push({
                severity: 'info',
                category: 'Documentation',
                title: 'Limited documentation',
                description: 'No docs/ folder or CONTRIBUTING.md',
                affectedFiles: [],
                suggestedAction: 'Add documentation for contributors'
            });
            score -= 15;
        }

        score = Math.max(0, Math.min(100, score));

        const docCount = [hasReadme, hasDocs, hasContributing, hasChangelog].filter(Boolean).length;

        return {
            score,
            label: this.getScoreLabel(score),
            details: `${docCount}/4 documentation files present`
        };
    }

    private async analyzeTestCoverage(stats: ProjectStats, issues: HealthIssue[]): Promise<CategoryScore> {
        let score = 100;

        const hasTests = await this.hasTests();

        if (!hasTests) {
            issues.push({
                severity: 'critical',
                category: 'Testing',
                title: 'No tests found',
                description: 'Project has no visible test files',
                affectedFiles: [],
                suggestedAction: 'Add tests for critical functionality'
            });
            return {
                score: 0,
                label: 'Missing',
                details: 'No test files found'
            };
        }

        // Count test files
        let testFiles = 0;
        for (const file of stats.largestFiles) {
            if (this.TEST_PATTERNS.some(p => file.path.includes(p))) {
                testFiles++;
            }
        }

        const testRatio = testFiles / Math.max(1, stats.totalFiles - testFiles);

        if (testRatio < 0.1) {
            issues.push({
                severity: 'warning',
                category: 'Testing',
                title: 'Low test coverage',
                description: 'Very few test files relative to source files',
                affectedFiles: [],
                suggestedAction: 'Add more tests, especially for critical paths'
            });
            score = 40;
        } else if (testRatio < 0.3) {
            score = 60;
        } else if (testRatio < 0.5) {
            score = 80;
        }

        return {
            score,
            label: this.getScoreLabel(score),
            details: `${testFiles} test files found`
        };
    }

    private async hasTests(): Promise<boolean> {
        for (const pattern of this.TEST_PATTERNS) {
            const testPath = path.join(this.rootDir, pattern);
            if (await fs.pathExists(testPath)) {
                return true;
            }
        }

        // Also check for test files in common locations
        try {
            const srcDir = path.join(this.rootDir, 'src');
            if (await fs.pathExists(srcDir)) {
                const entries = await this.fileSystem.listDir(srcDir);
                for (const entry of entries) {
                    if (this.TEST_PATTERNS.some(p => entry.includes(p))) {
                        return true;
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }

        return false;
    }

    // ─────────────────────────────────────────────────────────────
    // Recommendations Generator
    // ─────────────────────────────────────────────────────────────

    private generateRecommendations(issues: HealthIssue[]): string[] {
        const recommendations: string[] = [];

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        if (criticalCount > 0) {
            recommendations.push(`🔴 Address ${criticalCount} critical issue(s) first`);
        }

        if (warningCount > 3) {
            recommendations.push(`🟡 Consider addressing the ${warningCount} warnings to improve code health`);
        }

        // Category-specific recommendations
        const categories = [...new Set(issues.map(i => i.category))];
        for (const category of categories) {
            const categoryIssues = issues.filter(i => i.category === category);
            if (categoryIssues.length > 2) {
                recommendations.push(`📁 ${category} has multiple issues - prioritize refactoring`);
            }
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ Great job! Your codebase is in good health.');
        }

        return recommendations;
    }

    private getScoreLabel(score: number): string {
        if (score >= 90) return 'Excellent';
        if (score >= 75) return 'Good';
        if (score >= 50) return 'Fair';
        if (score >= 25) return 'Needs Work';
        return 'Critical';
    }

    // ─────────────────────────────────────────────────────────────
    // Formatted Output
    // ─────────────────────────────────────────────────────────────

    formatReport(report: HealthReport): string {
        const scoreColor = report.score >= 75 ? chalk.green :
            report.score >= 50 ? chalk.yellow : chalk.red;

        const lines: string[] = [
            '',
            chalk.bold('╔══════════════════════════════════════════════════════════════╗'),
            chalk.bold('║  📊 PMX HEALTH REPORT                                        ║'),
            chalk.bold('╠══════════════════════════════════════════════════════════════╣'),
            `║  Overall Score: ${scoreColor(report.score + '/100')}${' '.repeat(43 - String(report.score).length)}║`,
            chalk.bold('╠══════════════════════════════════════════════════════════════╣'),
        ];

        // Category scores
        const categories = [
            { name: 'Code Size', data: report.categories.codeSize },
            { name: 'Structure', data: report.categories.structure },
            { name: 'Documentation', data: report.categories.documentation },
            { name: 'Testing', data: report.categories.testCoverage }
        ];

        for (const cat of categories) {
            const icon = cat.data.score >= 75 ? '✅' : cat.data.score >= 50 ? '⚠️' : '❌';
            const label = `${icon} ${cat.name}:`.padEnd(20);
            const score = `${cat.data.score}%`.padEnd(6);
            const detail = cat.data.details.slice(0, 30);
            lines.push(`║  ${label}${score} ${chalk.gray(detail)}${' '.repeat(Math.max(0, 30 - detail.length))}║`);
        }

        // Critical issues
        const critical = report.issues.filter(i => i.severity === 'critical');
        if (critical.length > 0) {
            lines.push(chalk.bold('╠══════════════════════════════════════════════════════════════╣'));
            lines.push(`║  ${chalk.red('🚨 CRITICAL ISSUES')} (${critical.length})${' '.repeat(39 - String(critical.length).length)}║`);
            for (const issue of critical.slice(0, 5)) {
                const text = `  └── ${issue.title}`.slice(0, 60);
                lines.push(`║${text}${' '.repeat(63 - text.length)}║`);
            }
        }

        // Warnings
        const warnings = report.issues.filter(i => i.severity === 'warning');
        if (warnings.length > 0) {
            lines.push(chalk.bold('╠══════════════════════════════════════════════════════════════╣'));
            lines.push(`║  ${chalk.yellow('⚠️  WARNINGS')} (${warnings.length})${' '.repeat(45 - String(warnings.length).length)}║`);
            for (const issue of warnings.slice(0, 3)) {
                const text = `  └── ${issue.title}`.slice(0, 60);
                lines.push(`║${text}${' '.repeat(63 - text.length)}║`);
            }
            if (warnings.length > 3) {
                const moreText = `  └── ... ${warnings.length - 3} more`;
                lines.push(`║${moreText}${' '.repeat(63 - moreText.length)}║`);
            }
        }

        // Recommendations
        if (report.recommendations.length > 0) {
            lines.push(chalk.bold('╠══════════════════════════════════════════════════════════════╣'));
            lines.push(`║  ${chalk.cyan('💡 RECOMMENDATIONS')}${' '.repeat(43)}║`);
            for (const rec of report.recommendations.slice(0, 3)) {
                const text = `  ${rec}`.slice(0, 60);
                lines.push(`║${text}${' '.repeat(63 - text.length)}║`);
            }
        }

        lines.push(chalk.bold('╚══════════════════════════════════════════════════════════════╝'));
        lines.push('');

        return lines.join('\n');
    }

    formatQuickStats(stats: QuickStats): string {
        const checks = [
            stats.hasReadme ? '✅' : '❌',
            stats.hasTests ? '✅' : '❌',
            stats.hasDocs ? '✅' : '❌'
        ];

        return [
            chalk.gray('─────────────────────────────'),
            `📁 ${stats.files} files | ${stats.lines} lines | ${stats.mainLanguage}`,
            `${checks[0]} README  ${checks[1]} Tests  ${checks[2]} Docs`,
            chalk.gray('─────────────────────────────')
        ].join('\n');
    }
}
