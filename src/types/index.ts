// GitHub Webhook Types
export interface GitHubWebhookPayload {
  action?: string; // 'created', 'edited', 'deleted' for comment events
  repository: {
    full_name: string;
    clone_url: string;
    private: boolean;
    owner: {
      login: string;
    };
    name: string;
  };
  pull_request?: {
    number: number;
    head: {
      ref: string;
      sha: string;
    };
  };
  comment?: {
    id: number;
    body: string;
    user: {
      login: string;
    };
  };
}

// Project Type Definitions
export type ProjectType = 
  | 'nextjs'
  | 'react' 
  | 'vue'
  | 'nodejs-api'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'solidity'
  | 'hardhat'
  | 'foundry'
  | 'rust'
  | 'go'
  | 'python'
  | 'docker'
  | 'generic';

// Project Configuration
export interface ProjectConfig {
  type: ProjectType;
  language: string;
  framework: string;
  buildCommand: string;
  devCommand: string;
  testCommand: string;
  installCommand: string;
  testFramework: string;
  linting: string[];
  packageManager: string;
  detectedFeatures: string[];
  customPrompts?: Record<string, string>;
  environmentVariables?: Record<string, string>;
  additionalCommands?: Record<string, string>;
}

// Detection Rules
export interface DetectionRule {
  type: ProjectType;
  priority: number;
  conditions: DetectionCondition[];
}

export interface DetectionCondition {
  type: 'file' | 'directory' | 'file_pattern' | 'not_file';
  path?: string;
  contains?: string;
  pattern?: string;
}

// Workflow Results
export interface WorkflowResult {
  success: boolean;
  output: string;
  projectType: ProjectType;
  timestamp: string;
  commits: string[];
  errors?: string[];
  testResults?: TestResult[];
}

export interface TestResult {
  framework: string;
  passed: number;
  failed: number;
  skipped: number;
  details: string;
}

// Repository Information
export interface RepositoryInfo {
  currentBranch: string;
  currentCommit: string;
  hasUncommittedChanges: boolean;
  uncommittedFiles: string[];
}

// Configuration for specific project types
export interface NextJSConfig extends ProjectConfig {
  type: 'nextjs';
  hasAppRouter: boolean;
  hasTailwind: boolean;
  hasTypeScript: boolean;
}

export interface SolidityConfig extends ProjectConfig {
  type: 'solidity' | 'hardhat' | 'foundry';
  contractsDir: string;
  testsDir: string;
  networkConfig: Record<string, any>;
}

export interface PythonConfig extends ProjectConfig {
  type: 'python' | 'django' | 'fastapi';
  pythonVersion: string;
  hasVirtualEnv: boolean;
  requirementsFile: string;
}

// Prompt Building Types
export interface PromptContext {
  projectConfig: ProjectConfig;
  featureSpec: string;
  repositoryPath: string;
  webhookPayload: GitHubWebhookPayload;
  additionalContext?: Record<string, any>;
}

export interface PromptTemplate {
  system: string;
  instructions: string;
  constraints: string[];
  examples?: string[];
}

// Service Configuration
export interface ServiceConfig {
  workspaceRoot: string;
  authorizedUsers: string[];
  maxConcurrentJobs: number;
  timeoutMinutes: number;
  cleanupIntervalHours: number;
  maxWorkspaceSize: string;
  githubToken: string;
  geminiApiKey: string;
}

// Logger Types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  metadata?: Record<string, any>;
}

// Webhook Server Types
export interface WebhookServerConfig {
  port: number;
  path: string;
  secret?: string;
  cors: {
    origin: string[];
  };
}

// Multi-Repository Management
export interface RepositoryStatus {
  fullName: string;
  localPath: string;
  lastUpdated: string;
  currentBranch: string;
  status: 'idle' | 'cloning' | 'updating' | 'processing' | 'error';
  activeJobs: number;
}

export interface WorkspaceStats {
  totalRepositories: number;
  activeJobs: number;
  totalSize: string;
  lastCleanup: string;
  repositories: RepositoryStatus[];
}

// Job Queue Types
export interface JobRequest {
  id: string;
  repository: string;
  pullRequest: number;
  featureSpec: string;
  priority: number;
  createdAt: string;
  assignedTo?: string;
}

export interface JobResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: WorkflowResult;
  error?: string;
}

// Error Types
export class RepositoryError extends Error {
  constructor(
    message: string,
    public repository: string,
    public operation: string
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class ProjectDetectionError extends Error {
  constructor(
    message: string,
    public path: string
  ) {
    super(message);
    this.name = 'ProjectDetectionError';
  }
}

export class GeminiExecutionError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public stderr: string
  ) {
    super(message);
    this.name = 'GeminiExecutionError';
  }
} 