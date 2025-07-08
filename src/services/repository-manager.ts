import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export class RepositoryManager {
  private workspaceRoot: string;
  private logger: Logger;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.logger = new Logger('RepositoryManager');
  }

  /**
   * Sets up a repository locally - clones if it doesn't exist, fetches if it does
   */
  async setupRepository(
    cloneUrl: string,
    fullName: string,
    githubToken?: string
  ): Promise<string> {
    const repoPath = path.join(this.workspaceRoot, fullName);
    
    try {
      // Check if repository already exists
      const exists = await this.repositoryExists(repoPath);
      
      if (exists) {
        this.logger.info(`Repository exists, updating: ${fullName}`);
        await this.updateRepository(repoPath);
      } else {
        this.logger.info(`Cloning repository: ${fullName}`);
        await this.cloneRepository(cloneUrl, repoPath, githubToken);
      }

      return repoPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to setup repository ${fullName}`, { error: errorMessage });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Checks if a repository exists at the given path
   */
  private async repositoryExists(repoPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(repoPath, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clones a repository to the specified path
   */
  private async cloneRepository(
    cloneUrl: string,
    repoPath: string,
    githubToken?: string
  ): Promise<void> {
    // Ensure the parent directory exists
    await fs.mkdir(path.dirname(repoPath), { recursive: true });

    // Prepare clone URL with authentication if token is provided
    let authenticatedUrl = cloneUrl;
    if (githubToken && cloneUrl.includes('github.com')) {
      authenticatedUrl = cloneUrl.replace(
        'https://github.com/',
        `https://${githubToken}@github.com/`
      );
    }

    const { stdout, stderr } = await execAsync(
      `git clone "${authenticatedUrl}" "${repoPath}"`,
      { timeout: 300000 } // 5 minute timeout
    );

    this.logger.debug('Clone output:', { stdout, stderr });
  }

  /**
   * Updates an existing repository by fetching latest changes
   */
  private async updateRepository(repoPath: string): Promise<void> {
    try {
      // Fetch all remotes and branches
      await execAsync('git fetch --all --prune', { 
        cwd: repoPath,
        timeout: 120000 // 2 minute timeout
      });

      // Reset any local changes to keep the workspace clean
      await execAsync('git reset --hard HEAD', { cwd: repoPath });
      
      this.logger.info('Repository updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to update repository, attempting to re-clone', { error: errorMessage });
      
      // If update fails, remove and re-clone
      await fs.rm(repoPath, { recursive: true, force: true });
      throw new Error('Repository update failed, needs re-clone');
    }
  }

  /**
   * Checks out the correct branch for a pull request
   */
  async checkoutPRBranch(
    repoPath: string,
    branchName: string,
    commitSha: string
  ): Promise<void> {
    try {
      this.logger.info(`Checking out PR branch: ${branchName} (${commitSha})`);

      // Try to checkout the branch directly first
      try {
        await execAsync(`git checkout "${branchName}"`, { cwd: repoPath });
      } catch {
        // If branch doesn't exist locally, create it from the remote
        await execAsync(
          `git checkout -b "${branchName}" "origin/${branchName}"`,
          { cwd: repoPath }
        );
      }

      // Ensure we're at the exact commit from the PR
      await execAsync(`git reset --hard "${commitSha}"`, { cwd: repoPath });

      // Verify we're on the correct commit
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      const currentSha = stdout.trim();

      if (currentSha !== commitSha) {
        throw new Error(
          `Failed to checkout correct commit. Expected: ${commitSha}, Got: ${currentSha}`
        );
      }

      this.logger.info(`Successfully checked out ${branchName} at ${commitSha}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to checkout PR branch ${branchName}`, { error: errorMessage });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Gets information about the current repository state
   */
  async getRepositoryInfo(repoPath: string) {
    try {
      const [branchResult, commitResult, statusResult] = await Promise.all([
        execAsync('git branch --show-current', { cwd: repoPath }),
        execAsync('git rev-parse HEAD', { cwd: repoPath }),
        execAsync('git status --porcelain', { cwd: repoPath })
      ]);

      return {
        currentBranch: branchResult.stdout.trim(),
        currentCommit: commitResult.stdout.trim(),
        hasUncommittedChanges: statusResult.stdout.trim().length > 0,
        uncommittedFiles: statusResult.stdout.trim().split('\n').filter(Boolean)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get repository info', { error: errorMessage });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Commits changes with a given message
   */
  async commitChanges(
    repoPath: string,
    message: string,
    authorName: string = 'Gemini Agent',
    authorEmail: string = 'gemini-agent@coding-factory.local'
  ): Promise<string> {
    try {
      // Configure git user for this commit
      await execAsync(`git config user.name "${authorName}"`, { cwd: repoPath });
      await execAsync(`git config user.email "${authorEmail}"`, { cwd: repoPath });

      // Add all changes
      await execAsync('git add .', { cwd: repoPath });

      // Check if there are changes to commit
      const { stdout: statusOutput } = await execAsync(
        'git status --porcelain',
        { cwd: repoPath }
      );

      if (!statusOutput.trim()) {
        this.logger.info('No changes to commit');
        return '';
      }

      // Commit the changes
      const { stdout } = await execAsync(
        `git commit -m "${message.replace(/"/g, '\\"')}"`,
        { cwd: repoPath }
      );

      // Get the commit hash
      const { stdout: commitHash } = await execAsync(
        'git rev-parse HEAD',
        { cwd: repoPath }
      );

      const hash = commitHash.trim();
      this.logger.info(`Committed changes: ${hash} - ${message}`);
      
      return hash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to commit changes', { error: errorMessage });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Pushes commits to the remote repository
   */
  async pushChanges(
    repoPath: string,
    branchName: string,
    githubToken?: string
  ): Promise<void> {
    try {
      // If we have a GitHub token, update the remote URL to include it
      if (githubToken) {
        const { stdout: remoteUrl } = await execAsync(
          'git remote get-url origin',
          { cwd: repoPath }
        );

        if (remoteUrl.includes('github.com') && !remoteUrl.includes('@')) {
          const authenticatedUrl = remoteUrl.trim().replace(
            'https://github.com/',
            `https://${githubToken}@github.com/`
          );
          
          await execAsync(
            `git remote set-url origin "${authenticatedUrl}"`,
            { cwd: repoPath }
          );
        }
      }

      // Push the changes
      await execAsync(`git push origin "${branchName}"`, { 
        cwd: repoPath,
        timeout: 120000 // 2 minute timeout
      });

      this.logger.info(`Successfully pushed changes to ${branchName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to push changes to ${branchName}`, { error: errorMessage });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Cleans up the workspace by removing old repositories
   */
  async cleanupWorkspace(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(this.workspaceRoot, entry.name);
          const stats = await fs.stat(dirPath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            this.logger.info(`Cleaning up old repository: ${entry.name}`);
            await fs.rm(dirPath, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to cleanup workspace', { error: errorMessage });
    }
  }

  /**
   * Gets the size of the workspace
   */
  async getWorkspaceStats() {
    try {
      const { stdout } = await execAsync(`du -sh "${this.workspaceRoot}"`, {
        timeout: 30000
      });
      
      const [size, _] = stdout.trim().split('\t');
      
      const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
      const repositoryCount = entries.filter(entry => entry.isDirectory()).length;

      return {
        totalSize: size,
        repositoryCount,
        workspacePath: this.workspaceRoot
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to get workspace stats', { error: errorMessage });
      return {
        totalSize: 'unknown',
        repositoryCount: 0,
        workspacePath: this.workspaceRoot
      };
    }
  }
} 