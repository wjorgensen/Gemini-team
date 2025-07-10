import path from 'path';
import fs from 'fs/promises';
import { ProjectConfig, PromptContext, PromptTemplate, GitHubWebhookPayload } from '../types';
import { Logger } from '../utils/logger';

export class PromptBuilder {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('PromptBuilder');
  }

  /**
   * Builds a simplified prompt for Gemini (workflow is now in global ~/.gemini/GEMINI.md)
   */
  async buildPrompt(
    projectConfig: ProjectConfig,
    featureSpec: string,
    repositoryPath: string,
    webhookPayload: GitHubWebhookPayload
  ): Promise<string> {
    const startTime = Date.now();
    
    this.logger.info('Building simplified prompt (using global GEMINI.md)', {
      projectType: projectConfig.type,
      framework: projectConfig.framework,
      improvement: 'Reduced prompt size by 80% using global workflow file'
    });

    try {
      // Get basic project context (much simpler now)
      this.logger.debug('Gathering basic project context');
      const projectContext = await this.gatherBasicProjectContext(repositoryPath, projectConfig);
      
      // Build minimal prompt - workflow instructions are in ~/.gemini/GEMINI.md
      this.logger.debug('Building minimal prompt');
      const prompt = this.buildMinimalPrompt(projectConfig, featureSpec, webhookPayload, projectContext);
      
      this.logger.info('Simplified prompt build completed', { 
        totalDuration: Date.now() - startTime + 'ms',
        promptLength: prompt.length,
        projectType: projectConfig.type,
        reduction: `Reduced from ~5000+ chars to ${prompt.length} chars (${Math.round((1 - prompt.length / 5000) * 100)}% reduction)`
      });

      return prompt;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to build prompt', { 
        error: errorMessage,
        duration: Date.now() - startTime + 'ms',
        projectType: projectConfig.type
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Builds a minimal prompt since workflow is handled by global GEMINI.md
   */
  private buildMinimalPrompt(
    projectConfig: ProjectConfig,
    featureSpec: string,
    webhookPayload: GitHubWebhookPayload,
    projectContext: string
  ): string {
    return `# Development Task

## Project Context
**Repository**: ${webhookPayload.repository.full_name}
**Type**: ${projectConfig.type} (${projectConfig.framework})
**Language**: ${projectConfig.language}
**Package Manager**: ${projectConfig.packageManager}

**Available Commands**:
- Install: \`${projectConfig.installCommand}\`
- Dev: \`${projectConfig.devCommand}\`
- Build: \`${projectConfig.buildCommand}\`
- Test: \`${projectConfig.testCommand}\`

**Tools**: ${projectConfig.linting.join(', ')} | ${projectConfig.testFramework}
**Features**: ${projectConfig.detectedFeatures.join(', ')}

${projectContext}

## Task
${featureSpec}

---
**Note**: Follow the Gemini Development Protocol from your global GEMINI.md file. Start with analysis, create a feature plan, implement systematically, test thoroughly, and ensure quality.`;
  }

  /**
   * Gathers minimal project context (much simpler than before)
   */
  private async gatherBasicProjectContext(repositoryPath: string, config: ProjectConfig): Promise<string> {
    const context: string[] = [];

    try {
      // Just get the basic project structure
      const structure = await this.getSimpleProjectStructure(repositoryPath);
      if (structure) {
        context.push(`**Structure**: ${structure}`);
      }

      // Get recent commits for context
      const recentCommits = await this.getRecentCommits(repositoryPath);
      if (recentCommits) {
        context.push(`**Recent Activity**: ${recentCommits}`);
      }

    } catch (error) {
      this.logger.debug('Failed to gather some project context', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return context.join('\n');
  }

  /**
   * Gets a simplified project structure overview
   */
  private async getSimpleProjectStructure(repositoryPath: string): Promise<string> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Just get top-level structure + key files
      const { stdout } = await execAsync(
        'find . -maxdepth 2 -type f \\( -name "*.json" -o -name "*.md" -o -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rs" -o -name "*.go" \\) | head -10',
        { cwd: repositoryPath }
      );

      const files = stdout.trim().split('\n').filter((f: string) => f.trim());
      return files.length > 0 ? files.join(', ') : 'Standard project structure';
    } catch {
      return 'Unable to analyze structure';
    }
  }

  /**
   * Gets recent commit information for context
   */
  private async getRecentCommits(repositoryPath: string): Promise<string | null> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        'git log --oneline -3',
        { cwd: repositoryPath }
      );

      return stdout.trim();
    } catch {
      return null;
    }
  }
} 