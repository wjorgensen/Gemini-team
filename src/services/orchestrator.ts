import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { RepositoryManager } from './repository-manager';
import { ProjectDetector } from './project-detector';
import { PromptBuilder } from './prompt-builder';
import { GitHubWebhookPayload, ProjectConfig, WorkflowResult } from '../types';
import { Logger } from '../utils/logger';

export class GeminiOrchestrator {
  private repositoryManager: RepositoryManager;
  private projectDetector: ProjectDetector;
  private promptBuilder: PromptBuilder;
  private logger: Logger;
  private workspaceRoot: string;

  constructor(workspaceRoot: string = '/home/wes/coding-factory') {
    this.workspaceRoot = workspaceRoot;
    this.repositoryManager = new RepositoryManager(workspaceRoot);
    this.projectDetector = new ProjectDetector();
    this.promptBuilder = new PromptBuilder();
    this.logger = new Logger('GeminiOrchestrator');
  }

  /**
   * Main entry point - processes a GitHub webhook payload
   */
  async processWebhook(payload: GitHubWebhookPayload): Promise<WorkflowResult> {
    const { repository, pull_request, comment } = payload;
    
    this.logger.info(`Processing webhook for ${repository.full_name}`, {
      prNumber: pull_request?.number,
      commentId: comment?.id,
      author: comment?.user.login
    });

    try {
      // 1. Validate the request
      await this.validateRequest(payload);

      // 2. Setup the repository locally
      const repoPath = await this.setupRepository(payload);

      // 3. Detect project type and load configuration
      const projectConfig = await this.detectAndConfigureProject(repoPath);

      // 4. Extract feature specification from comment
      const featureSpec = this.extractFeatureSpec(comment?.body || '');

      // 5. Run the Gemini agent with appropriate configuration
      const result = await this.runGeminiAgent(repoPath, projectConfig, featureSpec, payload);

      // 6. Post results back to GitHub
      await this.postResults(payload, result);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Workflow failed', { error: errorMessage });
      await this.postErrorToGitHub(payload, error instanceof Error ? error : new Error(String(error)));
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Validates that the webhook request should be processed
   */
  private async validateRequest(payload: GitHubWebhookPayload): Promise<void> {
    const { comment, repository } = payload;

    // Check if comment contains @gemini trigger
    if (!comment?.body?.toLowerCase().includes('@gemini')) {
      throw new Error('Comment does not contain @gemini trigger');
    }

    // Check if author is authorized (you can configure this)
    const authorizedUsers = process.env.AUTHORIZED_USERS?.split(',') || ['wjorgensen'];
    if (!authorizedUsers.includes(comment.user.login)) {
      throw new Error(`User ${comment.user.login} is not authorized`);
    }

    // Check if repository is accessible
    if (repository.private && !process.env.GITHUB_TOKEN) {
      throw new Error('Private repository requires GITHUB_TOKEN');
    }
  }

  /**
   * Sets up the repository locally - clones or updates as needed
   */
  private async setupRepository(payload: GitHubWebhookPayload): Promise<string> {
    const { repository, pull_request } = payload;
    
    this.logger.info(`Setting up repository ${repository.full_name}`);

    // Setup repository (clone if doesn't exist, fetch if it does)
    const repoPath = await this.repositoryManager.setupRepository(
      repository.clone_url,
      repository.full_name,
      process.env.GITHUB_TOKEN
    );

    // Checkout the correct branch for the PR
    if (pull_request) {
      await this.repositoryManager.checkoutPRBranch(
        repoPath,
        pull_request.head.ref,
        pull_request.head.sha
      );
    }

    return repoPath;
  }

  /**
   * Detects project type and loads appropriate configuration
   */
  private async detectAndConfigureProject(repoPath: string): Promise<ProjectConfig> {
    this.logger.info('Detecting project type and loading configuration');

    const projectType = await this.projectDetector.detectProjectType(repoPath);
    const config = await this.projectDetector.loadProjectConfig(repoPath, projectType);

    this.logger.info(`Detected project type: ${projectType}`, { config });

    return config;
  }

  /**
   * Extracts feature specification from the comment
   */
  private extractFeatureSpec(commentBody: string): string {
    // Remove @gemini mention and clean up the text
    return commentBody
      .replace(/@gemini/gi, '')
      .replace(/^\s+|\s+$/g, '') // trim
      .replace(/\n\s*\n/g, '\n') // normalize line breaks
      .trim();
  }

  /**
   * Runs the Gemini agent with the appropriate configuration for the project type
   */
  private async runGeminiAgent(
    repoPath: string,
    projectConfig: ProjectConfig,
    featureSpec: string,
    payload: GitHubWebhookPayload
  ): Promise<WorkflowResult> {
    this.logger.info('Running Gemini agent', { 
      projectType: projectConfig.type,
      repoPath 
    });

    // Build the prompt based on project type and configuration
    const prompt = await this.promptBuilder.buildPrompt(
      projectConfig,
      featureSpec,
      repoPath,
      payload
    );

    // Save prompt to file for Gemini CLI
    const promptFile = path.join(repoPath, '.gemini-prompt.txt');
    await fs.writeFile(promptFile, prompt);

    // Configure environment for Gemini
    const env = {
      ...process.env,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      PR_NUMBER: payload.pull_request?.number?.toString(),
      REPO_OWNER: payload.repository.owner.login,
      REPO_NAME: payload.repository.name,
      PROJECT_TYPE: projectConfig.type,
      WORKSPACE_PATH: repoPath
    };

    // Run Gemini CLI
    const result = await this.executeGeminiCLI(repoPath, promptFile, env, projectConfig);

    return result;
  }

  /**
   * Executes the Gemini CLI with the generated prompt
   */
  private async executeGeminiCLI(
    workingDir: string,
    promptFile: string,
    env: Record<string, string | undefined>,
    config: ProjectConfig
  ): Promise<WorkflowResult> {
    return new Promise((resolve, reject) => {
      const geminiProcess = spawn('gemini', ['--no-confirm'], {
        cwd: workingDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      // Send the prompt to Gemini
      fs.readFile(promptFile, 'utf8').then(prompt => {
        geminiProcess.stdin.write(prompt);
        geminiProcess.stdin.end();
      });

      geminiProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.debug('Gemini stdout:', data.toString());
      });

      geminiProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.debug('Gemini stderr:', data.toString());
      });

      geminiProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout,
            projectType: config.type,
            timestamp: new Date().toISOString(),
            commits: this.extractCommitInfo(stdout)
          });
        } else {
          reject(new Error(`Gemini process failed with code ${code}\nStderr: ${stderr}`));
        }
      });

      geminiProcess.on('error', (error) => {
        reject(error);
      });

      // Set a timeout to prevent hanging
      setTimeout(() => {
        geminiProcess.kill('SIGTERM');
        reject(new Error('Gemini process timeout'));
      }, 30 * 60 * 1000); // 30 minutes timeout
    });
  }

  /**
   * Extracts commit information from Gemini output
   */
  private extractCommitInfo(output: string): string[] {
    const commitRegex = /(?:commit|committed)\s+([a-f0-9]{7,40})/gi;
    const commits = [];
    let match;

    while ((match = commitRegex.exec(output)) !== null) {
      commits.push(match[1]);
    }

    return commits;
  }

  /**
   * Posts successful results back to GitHub
   */
  private async postResults(payload: GitHubWebhookPayload, result: WorkflowResult): Promise<void> {
    if (!payload.pull_request) return;

    const comment = this.formatSuccessComment(result);
    
    await this.postCommentToGitHub(
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      comment
    );
  }

  /**
   * Posts error information back to GitHub
   */
  private async postErrorToGitHub(payload: GitHubWebhookPayload, error: Error): Promise<void> {
    if (!payload.pull_request) return;

    const comment = `❌ **Gemini Agent Error**

Failed to process your request:
\`\`\`
${error.message}
\`\`\`

Please check the server logs for more details or try again.`;

    await this.postCommentToGitHub(
      payload.repository.owner.login,
      payload.repository.name,
      payload.pull_request.number,
      comment
    );
  }

  /**
   * Formats the success comment for GitHub
   */
  private formatSuccessComment(result: WorkflowResult): string {
    return `✅ **Gemini Agent**: Feature implementation complete!

📋 **Project Type**: ${result.projectType}
🕒 **Completed**: ${result.timestamp}
📝 **Ready for Review**: Please review the changes and merge when satisfied

**Summary:**
${result.output.split('\n').slice(-10).join('\n')}

${result.commits.length > 0 ? `**Commits added:** ${result.commits.length}` : ''}

---
*Gemini Coding Factory - Multi-Repository AI Development*`;
  }

  /**
   * Posts a comment to GitHub using the GitHub API
   */
  private async postCommentToGitHub(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<void> {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      });
      this.logger.info(`Posted comment to ${owner}/${repo}#${prNumber}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to post comment to GitHub', { error: errorMessage });
    }
  }
} 