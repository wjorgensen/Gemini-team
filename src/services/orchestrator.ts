import path from 'path';
import fs from 'fs/promises';
import { RepositoryManager } from './repository-manager';
import { ProjectDetector } from './project-detector';
import { PromptBuilder } from './prompt-builder';
import { GitHubWebhookPayload, ProjectConfig, WorkflowResult } from '../types';
import { Logger } from '../utils/logger';
import { spawn } from 'child_process';
import { join } from 'path';
import readline from 'readline';

// 🚨 NEW: QuotaExceededError for queue management
class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class GeminiOrchestrator {
  private repositoryManager: RepositoryManager;
  private projectDetector: ProjectDetector;
  private promptBuilder: PromptBuilder;
  private logger: Logger;
  private workspaceRoot: string;

  // 🚨 QUOTA PROTECTION: Static variables to track API exhaustion
  private static quotaExhausted = false;
  private static quotaResetTime = 0;
  private static readonly QUOTA_RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

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

    // 🚨 QUOTA PROTECTION: Check if quota is exhausted
    const quotaStatus = this.checkQuotaStatus();
    if (quotaStatus.blocked) {
      throw new Error(quotaStatus.message!);
    }

    // Build the prompt based on project type and configuration
    const prompt = await this.promptBuilder.buildPrompt(
      projectConfig,
      featureSpec,
      repoPath,
      payload
    );

    // Save prompt to file for reference and CLI usage
    const promptFile = path.join(repoPath, '.gemini-prompt.txt');
    await fs.writeFile(promptFile, prompt);

    // 🚨 FIXED ARG_MAX PROTECTION: Use --prompt-file instead of --prompt
    this.logger.warn('⚠️ FIXED ARG_MAX ISSUE - USING PROMPT FILE', {
      message: 'Using --prompt-file flag instead of --prompt to avoid ARG_MAX limits',
      previousIssue: 'Long prompts hit kernel ARG_MAX limit causing silent retries',
      newMethod: '--prompt-file with saved file (eliminates argument length limits)',
      promptFile: promptFile,
      promptLength: prompt.length,
      maxArgLength: 'Unlimited (file-based)',
      quotaStatus: GeminiOrchestrator.quotaExhausted ? 'PROTECTED' : 'AVAILABLE'
    });

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

    // Job queue handles the CLI execution now
    this.logger.info('✅ Job preparation completed - execution handled by worker queue', {
      promptFile,
      projectType: projectConfig.type,
      repoPath,
      method: 'BullMQ worker with --prompt-file + streaming'
    });

    // Return a success result indicating job was prepared
    return {
      success: true,
      output: 'Job queued for processing by worker',
      projectType: projectConfig.type,
      timestamp: new Date().toISOString(),
      commits: []
    };
  }

  // NOTE: CLI execution moved to worker.ts for proper job queue handling
  // This orchestrator now only handles job preparation and validation

  /**
   * Checks if quota is exhausted and should block requests
   */
  private checkQuotaStatus(): { blocked: boolean; message?: string } {
    if (GeminiOrchestrator.quotaExhausted && Date.now() < GeminiOrchestrator.quotaResetTime) {
      const resetIn = Math.ceil((GeminiOrchestrator.quotaResetTime - Date.now()) / (60 * 1000));
      return {
        blocked: true,
        message: `🚫 **API Quota Exhausted - Service Protected**

Service is temporarily suspended to prevent further quota waste.

**Status:**
- Quota reset in: ${resetIn} minutes  
- Free tier limit: 100 requests per day
- Protection: ACTIVE (no new requests allowed)

**What caused this:**
- Previous 98 requests due to incorrect CLI usage
- Fixed: Now using --prompt flag instead of stdin piping

**Solutions:**
1. Wait for quota reset (midnight UTC)
2. Upgrade to paid tier for higher limits
3. Use different API key

Service will resume automatically when quota resets.`
      };
    }
    return { blocked: false };
  }

  /**
   * Detects quota exhaustion in stderr and activates protection
   */
  private detectQuotaExhaustion(stderr: string): boolean {
    const quotaIndicators = ['quota', '429', 'free_tier_requests', 'RESOURCE_EXHAUSTED', 'exceeded your current quota'];
    if (quotaIndicators.some(indicator => stderr.toLowerCase().includes(indicator.toLowerCase()))) {
      this.logger.error('🚫 QUOTA EXHAUSTION DETECTED', {
        message: 'Activating quota protection to prevent further waste',
        resetTime: new Date(Date.now() + GeminiOrchestrator.QUOTA_RESET_INTERVAL).toISOString()
      });
      
      // Set quota exhaustion protection
      GeminiOrchestrator.quotaExhausted = true;
      GeminiOrchestrator.quotaResetTime = Date.now() + GeminiOrchestrator.QUOTA_RESET_INTERVAL;
      return true;
    }
    return false;
  }

  /**
   * Enhances error messages with specific handling for rate limiting and common issues
   */
  private enhanceErrorMessage(exitCode: number, stderr: string): string {
    const baseMessage = `Gemini process failed with code ${exitCode}`;
    
    // Check for rate limiting (429 errors)
    if (stderr.includes('status 429') || stderr.includes('rate limit') || stderr.includes('quota')) {
      if (stderr.includes('free_tier_requests')) {
        return `${baseMessage}

🚫 **Rate Limit Exceeded: Free Tier API Quota**

You've hit the free tier limit for Gemini API requests. The free tier allows only 5 requests per minute.

**Solutions:**
1. **Wait and retry**: The quota resets every minute
2. **Upgrade to paid tier**: Visit https://ai.google.dev/pricing for higher limits
3. **Switch to different model**: Consider using a different Gemini model with higher limits
4. **Use API key with billing enabled**: Ensure your API key has billing configured

**Current Error:**
\`\`\`
${stderr.substring(0, 1000)}${stderr.length > 1000 ? '...' : ''}
\`\`\`

Please wait a few minutes before trying again, or upgrade your API plan for higher limits.`;
      } else {
        return `${baseMessage}

🚫 **Rate Limit Exceeded**

You've exceeded the API rate limits for your current plan.

**Error Details:**
\`\`\`
${stderr}
\`\`\`

Please wait and try again, or check your API quota at https://ai.google.dev/`;
      }
    }

    // Check for authentication issues
    if (stderr.includes('GEMINI_API_KEY') || stderr.includes('authentication') || stderr.includes('401')) {
      return `${baseMessage}

🔑 **Authentication Error**

The Gemini API key is missing or invalid.

**Solutions:**
1. Check that GEMINI_API_KEY environment variable is set
2. Verify your API key at https://aistudio.google.com/app/apikey
3. Ensure the API key has the necessary permissions

**Error Details:**
\`\`\`
${stderr}
\`\`\``;
    }

    // Check for network/connectivity issues
    if (stderr.includes('network') || stderr.includes('timeout') || stderr.includes('connection')) {
      return `${baseMessage}

🌐 **Network Connection Error**

Unable to connect to the Gemini API.

**Possible causes:**
1. Network connectivity issues
2. Firewall blocking outbound connections
3. Temporary service outage

**Error Details:**
\`\`\`
${stderr}
\`\`\`

Please check your network connection and try again.`;
    }

    // Generic error with full stderr
    return `${baseMessage}
Stderr: ${stderr}`;
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

  async executeGemini(repoPath: string, prompt: string): Promise<string> {
    this.logger.info(`Executing Gemini for ${repoPath}`);

    const promptFile = join(repoPath, '.gemini-prompt.txt');
    await fs.writeFile(promptFile, prompt);

    const geminiArgs = [
      '--prompt-file', promptFile,
      '--yolo',
      '--model', 'gemini-1.5-pro',
      '--output-format', 'stream-json'
    ];

    return new Promise((resolve, reject) => {
      const geminiProcess = spawn('gemini', geminiArgs, {
        cwd: repoPath,
        env: { ...process.env }
      });

      const out = readline.createInterface({ input: geminiProcess.stdout! });
      const err = readline.createInterface({ input: geminiProcess.stderr! });

      let output = '';
      let errorOutput = '';

      out.on('line', line => {
        output += line + '\n';
      });

      err.on('line', line => {
        errorOutput += line + '\n';
        if (this.detectQuotaExhaustion(line)) {
          geminiProcess.kill();
          reject(new QuotaExceededError('API quota exhausted'));
        }
      });

      geminiProcess.on('close', code => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(this.enhanceErrorMessage(code ?? -1, errorOutput)));
        }
      });

      geminiProcess.on('error', err => {
        reject(err);
      });
    });
  }
} 