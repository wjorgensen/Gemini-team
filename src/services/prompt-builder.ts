import path from 'path';
import fs from 'fs/promises';
import { ProjectConfig, PromptContext, PromptTemplate, GitHubWebhookPayload } from '../types';
import { Logger } from '../utils/logger';

export class PromptBuilder {
  private logger: Logger;
  private templateCache: Map<string, PromptTemplate>;

  constructor() {
    this.logger = new Logger('PromptBuilder');
    this.templateCache = new Map();
  }

  /**
   * Builds a complete prompt for Gemini based on project configuration and context
   */
  async buildPrompt(
    projectConfig: ProjectConfig,
    featureSpec: string,
    repositoryPath: string,
    webhookPayload: GitHubWebhookPayload
  ): Promise<string> {
    const context: PromptContext = {
      projectConfig,
      featureSpec,
      repositoryPath,
      webhookPayload
    };

    this.logger.info('Building prompt for project', {
      projectType: projectConfig.type,
      framework: projectConfig.framework
    });

    // Get the base template for the project type
    const template = await this.getTemplateForProject(projectConfig);
    
    // Build the complete prompt
    const prompt = await this.assemblePrompt(template, context);
    
    this.logger.debug('Generated prompt', { 
      length: prompt.length,
      projectType: projectConfig.type 
    });

    return prompt;
  }

  /**
   * Gets the appropriate template for a project type
   */
  private async getTemplateForProject(config: ProjectConfig): Promise<PromptTemplate> {
    const cacheKey = `${config.type}-${config.framework}`;
    
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    const template = await this.loadTemplate(config);
    this.templateCache.set(cacheKey, template);
    
    return template;
  }

  /**
   * Loads or generates a template for the given project configuration
   */
  private async loadTemplate(config: ProjectConfig): Promise<PromptTemplate> {
    // Try to load custom template first
    const customTemplate = await this.loadCustomTemplate(config);
    if (customTemplate) {
      return customTemplate;
    }

    // Generate template based on project type
    return this.generateTemplateForType(config);
  }

  /**
   * Attempts to load a custom template from templates directory
   */
  private async loadCustomTemplate(config: ProjectConfig): Promise<PromptTemplate | null> {
    const templatePaths = [
      `templates/${config.type}.md`,
      `templates/${config.framework.toLowerCase()}.md`,
      `templates/custom-${config.type}.md`
    ];

    for (const templatePath of templatePaths) {
      try {
        const content = await fs.readFile(templatePath, 'utf-8');
        return this.parseTemplateContent(content);
      } catch {
        // Template file doesn't exist, continue
      }
    }

    return null;
  }

  /**
   * Parses template content from markdown format
   */
  private parseTemplateContent(content: string): PromptTemplate {
    const sections = content.split('## ');
    const template: PromptTemplate = {
      system: '',
      instructions: '',
      constraints: []
    };

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const title = lines[0].toLowerCase();

      if (title.includes('system')) {
        template.system = lines.slice(1).join('\n').trim();
      } else if (title.includes('instructions')) {
        template.instructions = lines.slice(1).join('\n').trim();
      } else if (title.includes('constraints')) {
        template.constraints = lines.slice(1)
          .filter(line => line.trim().startsWith('- '))
          .map(line => line.trim().substring(2));
      }
    }

    return template;
  }

  /**
   * Generates a template based on project type
   */
  private generateTemplateForType(config: ProjectConfig): PromptTemplate {
    const baseTemplate = this.getBaseTemplate();
    const typeSpecific = this.getTypeSpecificTemplate(config);

    return {
      system: this.mergeSystemPrompts(baseTemplate.system, typeSpecific.system || ''),
      instructions: this.mergeInstructions(baseTemplate.instructions, typeSpecific.instructions || ''),
      constraints: [...baseTemplate.constraints, ...(typeSpecific.constraints || [])],
      examples: typeSpecific.examples
    };
  }

  /**
   * Gets the base template that applies to all project types
   */
  private getBaseTemplate(): PromptTemplate {
    return {
      system: `You are Gemini CLI running as a background development agent in a multi-repository coding factory.
Your role is to act as a senior AI developer who can work autonomously on feature requests.
You have access to Git operations, can read and write files, and can execute appropriate commands for the project type.`,

      instructions: `Follow the **Gemini Development Protocol** for every feature request:

1. **Analysis Phase**
   • Carefully analyze the feature request in the context of this specific project
   • Understand the existing codebase structure and patterns
   • Identify any dependencies, prerequisites, or potential conflicts

2. **Planning Phase**
   • Create or update 'feature-plan.md' in the repository root with:
     - Clear objective summary of the feature
     - Technical design notes considering the project's architecture
     - **GitHub-style checklist** of specific, actionable tasks (\`- [ ] task description\`)
     - Estimated complexity and potential risks
   • Commit this file with message "📋 Create feature plan for: [brief description]"

3. **Implementation Loop**
   For each unchecked task in your checklist:
   a. Implement the code changes needed to satisfy that specific task
   b. Follow the project's existing patterns, coding standards, and architecture
   c. Test the changes locally using appropriate commands for this project type
   d. Commit the changes with a descriptive message that matches the task
   e. Update 'feature-plan.md' to check off the completed task (\`- [x] task description\`)
   f. Commit the checklist update with message "✅ Complete: [task description]"

4. **Testing Phase**
   • Run the project's test suite using the configured test command
   • If tests fail, analyze the failures and fix them systematically
   • For new features, create appropriate tests using the project's testing framework
   • Continue until all tests pass

5. **Quality Assurance**
   • Run linting and formatting tools if available
   • Ensure code follows the project's style guidelines
   • Verify that the feature works as specified in different scenarios

6. **Completion**
   • Verify ALL checklist items are checked ✅ AND all tests pass 🟢
   • Create a final commit with message "🎉 Feature complete: [feature name]"
   • Post a comprehensive completion comment to the PR`,

      constraints: [
        'DO NOT merge or close the PR - leave that for human review',
        'Follow the specific coding standards and patterns of this project',
        'Keep commits atomic and descriptive',
        'If you encounter errors, debug systematically and document your approach',
        'Always prioritize code quality and maintainability over speed',
        'Respect existing architecture patterns and don\'t introduce unnecessary complexity',
        'Test thoroughly before marking any task as complete'
      ]
    };
  }

  /**
   * Gets project-type-specific template additions
   */
  private getTypeSpecificTemplate(config: ProjectConfig): Partial<PromptTemplate> {
    const templates: Record<string, Partial<PromptTemplate>> = {
      nextjs: {
        system: `You are working on a Next.js application. You understand React, TypeScript, and Next.js patterns including App Router, Server Components, and Client Components.`,
        instructions: `
### Next.js Specific Guidelines:
• Use TypeScript strictly - no 'any' types
• Follow Next.js App Router patterns when possible
• Use functional React components with hooks
• Implement proper SEO with metadata
• Use Next.js Image component for images
• Create responsive designs with Tailwind CSS (if detected)
• Generate Playwright E2E tests for new UI features
• Follow React best practices for component composition`,
        constraints: [
          'Use App Router structure (app/ directory) if it exists',
          'Implement proper loading and error states',
          'Follow Next.js performance best practices',
          'Use server components when possible, client components when necessary'
        ],
        examples: ['Creating a new page with proper metadata', 'Implementing a form with validation']
      },

      react: {
        system: `You are working on a React application. You understand modern React patterns, hooks, and component architecture.`,
        instructions: `
### React Specific Guidelines:
• Use functional components with hooks exclusively
• Implement proper state management (useState, useReducer, Context)
• Follow React best practices for performance (useMemo, useCallback)
• Create reusable components with proper prop interfaces
• Implement error boundaries where appropriate
• Write Jest/React Testing Library tests for components`,
        constraints: [
          'No class components - use functional components only',
          'Implement proper prop validation with TypeScript',
          'Follow React performance best practices'
        ]
      },

      'nodejs-api': {
        system: `You are working on a Node.js API backend. You understand REST principles, Express.js patterns, and backend architecture.`,
        instructions: `
### Node.js API Guidelines:
• Implement proper error handling with try-catch blocks
• Use middleware for cross-cutting concerns (auth, logging, validation)
• Validate input data with appropriate libraries
• Implement proper HTTP status codes
• Document API endpoints with comments
• Write unit tests for API endpoints using Jest
• Follow RESTful design principles`,
        constraints: [
          'Implement proper authentication and authorization',
          'Use environment variables for configuration',
          'Follow security best practices (helmet, cors, rate limiting)'
        ]
      },

      hardhat: {
        system: `You are working on a Hardhat-based Ethereum smart contract project. You understand Solidity, testing patterns, and deployment scripts.`,
        instructions: `
### Hardhat Specific Guidelines:
• Write secure Solidity code following best practices
• Implement comprehensive test coverage with Hardhat tests
• Use proper gas optimization techniques
• Follow OpenZeppelin patterns for common functionality
• Implement proper access controls and security measures
• Document contract interfaces and functions
• Create deployment scripts for different networks`,
        constraints: [
          'Follow Solidity security best practices',
          'Test contracts thoroughly including edge cases',
          'Use established patterns (OpenZeppelin) when possible',
          'Consider gas costs in implementation decisions'
        ]
      },

      foundry: {
        system: `You are working on a Foundry-based Ethereum smart contract project. You understand Solidity, Foundry testing, and deployment patterns.`,
        instructions: `
### Foundry Specific Guidelines:
• Write Solidity code optimized for Foundry's testing framework
• Use Foundry's fuzzing capabilities for comprehensive testing
• Implement proper forge test patterns
• Use forge fmt for code formatting
• Follow Foundry project structure conventions
• Implement gas snapshots for optimization tracking`,
        constraints: [
          'Use Foundry testing patterns (forge test)',
          'Implement fuzzing tests where appropriate',
          'Follow Foundry project structure'
        ]
      },

      python: {
        system: `You are working on a Python project. You understand Python best practices, type hints, and testing patterns.`,
        instructions: `
### Python Specific Guidelines:
• Use type hints throughout the codebase
• Follow PEP 8 style guidelines
• Implement proper error handling with custom exceptions
• Use virtual environments and requirements.txt
• Write comprehensive tests with pytest
• Document functions and classes with docstrings
• Use f-strings for string formatting`,
        constraints: [
          'Follow PEP 8 style guidelines strictly',
          'Use type hints for better code documentation',
          'Implement proper error handling'
        ]
      },

      django: {
        system: `You are working on a Django web application. You understand Django patterns, models, views, and templates.`,
        instructions: `
### Django Specific Guidelines:
• Follow Django model best practices (relationships, validation)
• Use Django's built-in authentication and authorization
• Implement proper URL patterns and view structure
• Use Django templates with proper context
• Write Django tests using TestCase
• Follow Django security best practices
• Use Django migrations for database changes`,
        constraints: [
          'Follow Django project structure conventions',
          'Use Django ORM patterns appropriately',
          'Implement proper CSRF protection'
        ]
      },

      rust: {
        system: `You are working on a Rust project. You understand Rust ownership, borrowing, and idiomatic Rust patterns.`,
        instructions: `
### Rust Specific Guidelines:
• Follow Rust ownership and borrowing principles
• Use Result<T, E> for error handling
• Implement proper trait bounds and generics
• Write comprehensive tests with #[cfg(test)]
• Use cargo fmt and cargo clippy
• Follow Rust naming conventions
• Implement proper lifetime annotations where needed`,
        constraints: [
          'Follow Rust ownership principles strictly',
          'Use idiomatic Rust patterns',
          'Handle errors with Result types'
        ]
      },

      go: {
        system: `You are working on a Go project. You understand Go patterns, interfaces, and concurrency.`,
        instructions: `
### Go Specific Guidelines:
• Follow Go naming conventions and style guidelines
• Use interfaces for abstraction
• Implement proper error handling with error returns
• Use goroutines and channels for concurrency when appropriate
• Write table-driven tests
• Follow Go project structure conventions
• Use go fmt and go vet`,
        constraints: [
          'Follow Go naming conventions',
          'Implement proper error handling',
          'Use Go idioms and patterns'
        ]
      }
    };

    return templates[config.type] || templates.generic || {
      system: `You are working on a ${config.framework} project using ${config.language}.`,
      instructions: `Follow the project's existing patterns and use appropriate tools for ${config.framework}.`,
      constraints: ['Follow existing project patterns', 'Use appropriate testing frameworks']
    };
  }

  /**
   * Merges system prompts
   */
  private mergeSystemPrompts(base: string, specific: string): string {
    return `${base}\n\n${specific}`;
  }

  /**
   * Merges instruction sections
   */
  private mergeInstructions(base: string, specific: string): string {
    return `${base}\n${specific}`;
  }

  /**
   * Assembles the complete prompt from template and context
   */
  private async assemblePrompt(template: PromptTemplate, context: PromptContext): Promise<string> {
    const { projectConfig, featureSpec, repositoryPath, webhookPayload } = context;

    // Gather additional context about the repository
    const repoContext = await this.gatherRepositoryContext(repositoryPath, projectConfig);

    const prompt = `SYSTEM
${template.system}

=== PROJECT CONTEXT ===
**Repository**: ${webhookPayload.repository.full_name}
**Project Type**: ${projectConfig.type}
**Framework**: ${projectConfig.framework}
**Language**: ${projectConfig.language}
**Package Manager**: ${projectConfig.packageManager}

**Available Commands**:
• Install: ${projectConfig.installCommand}
• Development: ${projectConfig.devCommand}
• Build: ${projectConfig.buildCommand}
• Test: ${projectConfig.testCommand}

**Testing Framework**: ${projectConfig.testFramework}
**Linting Tools**: ${projectConfig.linting.join(', ')}
**Detected Features**: ${projectConfig.detectedFeatures.join(', ')}

${repoContext}

=== DEVELOPMENT PROTOCOL ===
${template.instructions}

=== CONSTRAINTS ===
${template.constraints.map(constraint => `• ${constraint}`).join('\n')}

${template.examples ? `\n=== EXAMPLES ===\n${template.examples.join('\n\n')}` : ''}

=== CURRENT TASK ===
USER
Implement the following feature in this ${projectConfig.framework} project:

${featureSpec}

Begin by analyzing the existing codebase structure, then create your feature plan and execute each step systematically. Remember to follow the project's existing patterns and maintain high code quality standards.`;

    return prompt;
  }

  /**
   * Gathers additional context about the repository
   */
  private async gatherRepositoryContext(repositoryPath: string, config: ProjectConfig): Promise<string> {
    const context: string[] = [];

    try {
      // Check for important configuration files
      const configFiles = await this.findConfigurationFiles(repositoryPath);
      if (configFiles.length > 0) {
        context.push(`**Configuration Files Found**: ${configFiles.join(', ')}`);
      }

      // Get project structure overview
      const structure = await this.getProjectStructure(repositoryPath);
      context.push(`**Project Structure**:\n${structure}`);

      // Get recent commits for context
      const recentCommits = await this.getRecentCommits(repositoryPath);
      if (recentCommits) {
        context.push(`**Recent Activity**:\n${recentCommits}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to gather repository context', { error: errorMessage });
    }

    return context.join('\n\n');
  }

  /**
   * Finds important configuration files
   */
  private async findConfigurationFiles(repositoryPath: string): Promise<string[]> {
    const configFiles = [
      'package.json', 'tsconfig.json', 'next.config.js', 'tailwind.config.js',
      'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml',
      'hardhat.config.js', 'foundry.toml', 'Dockerfile', 'docker-compose.yml',
      '.eslintrc.js', '.prettierrc', 'jest.config.js', 'playwright.config.ts'
    ];

    const found: string[] = [];
    
    for (const file of configFiles) {
      try {
        await fs.access(path.join(repositoryPath, file));
        found.push(file);
      } catch {
        // File doesn't exist
      }
    }

    return found;
  }

  /**
   * Gets a high-level overview of project structure
   */
  private async getProjectStructure(repositoryPath: string): Promise<string> {
    try {
      const entries = await fs.readdir(repositoryPath, { withFileTypes: true });
      const dirs = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map(entry => entry.name)
        .slice(0, 10); // Limit to first 10 directories

      return dirs.length > 0 ? dirs.join(', ') : 'No major directories found';
    } catch {
      return 'Unable to read project structure';
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
        'git log --oneline -5',
        { cwd: repositoryPath }
      );

      return stdout.trim();
    } catch {
      return null;
    }
  }
} 