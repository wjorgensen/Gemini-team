import path from 'path';
import fs from 'fs/promises';
import { ProjectConfig, ProjectType, DetectionRule } from '../types';
import { Logger } from '../utils/logger';

export class ProjectDetector {
  private logger: Logger;
  private detectionRules: DetectionRule[];

  constructor() {
    this.logger = new Logger('ProjectDetector');
    this.detectionRules = this.initializeDetectionRules();
  }

  async detectProjectType(repoPath: string): Promise<ProjectType> {
    this.logger.info(`Detecting project type for: ${repoPath}`);

    for (const rule of this.detectionRules) {
      const matches = await this.evaluateRule(repoPath, rule);
      if (matches) {
        this.logger.info(`Detected project type: ${rule.type}`, { 
          path: repoPath, 
          rule: rule.type 
        });
        return rule.type;
      }
    }

    this.logger.warn(`Could not detect project type, defaulting to generic`, { path: repoPath });
    return 'generic';
  }

  async loadProjectConfig(repoPath: string, projectType: ProjectType): Promise<ProjectConfig> {
    this.logger.info(`Loading configuration for ${projectType} project`, { path: repoPath });

    const baseConfig = await this.getBaseConfigForType(projectType);
    const customConfig = await this.loadCustomConfig(repoPath);
    const detectedFeatures = await this.detectProjectFeatures(repoPath, projectType);

    const finalConfig: ProjectConfig = {
      type: projectType,
      language: baseConfig.language || 'unknown',
      framework: baseConfig.framework || 'Unknown',
      buildCommand: customConfig.buildCommand || baseConfig.buildCommand || 'echo "No build command"',
      devCommand: customConfig.devCommand || baseConfig.devCommand || 'echo "No dev command"',
      testCommand: customConfig.testCommand || baseConfig.testCommand || 'echo "No test command"',
      installCommand: customConfig.installCommand || baseConfig.installCommand || 'echo "No install command"',
      testFramework: customConfig.testFramework || baseConfig.testFramework || 'none',
      linting: baseConfig.linting || [],
      packageManager: baseConfig.packageManager || 'unknown',
      detectedFeatures,
      customPrompts: customConfig.customPrompts,
      environmentVariables: customConfig.environmentVariables,
      additionalCommands: customConfig.additionalCommands
    };

    this.logger.debug('Final project configuration', finalConfig);
    return finalConfig;
  }

  private initializeDetectionRules(): DetectionRule[] {
    const rules: DetectionRule[] = [
      {
        type: 'nextjs' as ProjectType,
        priority: 10,
        conditions: [
          { type: 'file', path: 'next.config.js' },
          { type: 'file', path: 'package.json', contains: 'next' }
        ]
      },
      {
        type: 'nextjs' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'next.config.ts' },
          { type: 'file', path: 'package.json', contains: 'next' }
        ]
      },
      {
        type: 'react' as ProjectType,
        priority: 8,
        conditions: [
          { type: 'file', path: 'package.json', contains: 'react' },
          { type: 'not_file', path: 'next.config.js' },
          { type: 'not_file', path: 'next.config.ts' }
        ]
      },
      {
        type: 'vue' as ProjectType,
        priority: 8,
        conditions: [
          { type: 'file', path: 'package.json', contains: 'vue' }
        ]
      },
      {
        type: 'hardhat' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'hardhat.config.js' }
        ]
      },
      {
        type: 'hardhat' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'hardhat.config.ts' }
        ]
      },
      {
        type: 'foundry' as ProjectType,
        priority: 10,
        conditions: [
          { type: 'file', path: 'foundry.toml' }
        ]
      },
      {
        type: 'solidity' as ProjectType,
        priority: 7,
        conditions: [
          { type: 'file_pattern', pattern: '**/*.sol' },
          { type: 'not_file', path: 'hardhat.config.js' },
          { type: 'not_file', path: 'foundry.toml' }
        ]
      },
      {
        type: 'rust' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'Cargo.toml' }
        ]
      },
      {
        type: 'go' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'go.mod' }
        ]
      },
      {
        type: 'fastapi' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'requirements.txt', contains: 'fastapi' }
        ]
      },
      {
        type: 'django' as ProjectType,
        priority: 9,
        conditions: [
          { type: 'file', path: 'manage.py' },
          { type: 'file', path: 'requirements.txt', contains: 'django' }
        ]
      },
      {
        type: 'python' as ProjectType,
        priority: 6,
        conditions: [
          { type: 'file', path: 'requirements.txt' }
        ]
      },
      {
        type: 'python' as ProjectType,
        priority: 5,
        conditions: [
          { type: 'file_pattern', pattern: '**/*.py' }
        ]
      },
      {
        type: 'express' as ProjectType,
        priority: 8,
        conditions: [
          { type: 'file', path: 'package.json', contains: 'express' },
          { type: 'not_file', path: 'next.config.js' }
        ]
      },
      {
        type: 'nodejs-api' as ProjectType,
        priority: 7,
        conditions: [
          { type: 'file', path: 'package.json' },
          { type: 'not_file', path: 'next.config.js' },
          { type: 'not_file', path: 'package.json', contains: 'react' }
        ]
      },
      {
        type: 'docker' as ProjectType,
        priority: 5,
        conditions: [
          { type: 'file', path: 'Dockerfile' }
        ]
      }
    ];
    
    return rules.sort((a, b) => b.priority - a.priority);
  }

  private async evaluateRule(repoPath: string, rule: DetectionRule): Promise<boolean> {
    for (const condition of rule.conditions) {
      const result = await this.evaluateCondition(repoPath, condition);
      if (!result) {
        return false;
      }
    }
    return true;
  }

  private async evaluateCondition(repoPath: string, condition: any): Promise<boolean> {
    const fullPath = path.join(repoPath, condition.path);

    switch (condition.type) {
      case 'file':
        try {
          const stats = await fs.stat(fullPath);
          if (!stats.isFile()) return false;
          
          if (condition.contains) {
            const content = await fs.readFile(fullPath, 'utf-8');
            return content.includes(condition.contains);
          }
          return true;
        } catch {
          return false;
        }

      case 'not_file':
        try {
          await fs.stat(fullPath);
          return false;
        } catch {
          return true;
        }

      case 'directory':
        try {
          const stats = await fs.stat(fullPath);
          return stats.isDirectory();
        } catch {
          return false;
        }

      case 'file_pattern':
        try {
          const files = await this.findFilesByPattern(repoPath, condition.pattern);
          return files.length > 0;
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  private async findFilesByPattern(basePath: string, pattern: string): Promise<string[]> {
    const results: string[] = [];
    const parts = pattern.split('/');
    await this.searchPattern(basePath, parts, 0, results);
    return results;
  }

  private async searchPattern(
    currentPath: string,
    patternParts: string[],
    partIndex: number,
    results: string[]
  ): Promise<void> {
    if (partIndex >= patternParts.length) {
      return;
    }

    const part = patternParts[partIndex];
    
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        
        if (part === '**') {
          if (partIndex === patternParts.length - 1) {
            results.push(entryPath);
          } else {
            if (entry.isDirectory()) {
              await this.searchPattern(entryPath, patternParts, partIndex, results);
              await this.searchPattern(entryPath, patternParts, partIndex + 1, results);
            }
          }
        } else if (part.includes('*')) {
          const regex = new RegExp(part.replace(/\*/g, '.*'));
          if (regex.test(entry.name)) {
            if (partIndex === patternParts.length - 1) {
              results.push(entryPath);
            } else if (entry.isDirectory()) {
              await this.searchPattern(entryPath, patternParts, partIndex + 1, results);
            }
          }
        } else {
          if (entry.name === part) {
            if (partIndex === patternParts.length - 1) {
              results.push(entryPath);
            } else if (entry.isDirectory()) {
              await this.searchPattern(entryPath, patternParts, partIndex + 1, results);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors and continue
    }
  }

  private async getBaseConfigForType(projectType: ProjectType): Promise<Partial<ProjectConfig>> {
    const configs: Record<ProjectType, Partial<ProjectConfig>> = {
      nextjs: {
        language: 'typescript',
        framework: 'Next.js',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
        testCommand: 'npm run test',
        installCommand: 'npm install',
        testFramework: 'playwright',
        linting: ['eslint', 'prettier'],
        packageManager: 'npm'
      },
      react: {
        language: 'typescript',
        framework: 'React',
        buildCommand: 'npm run build',
        devCommand: 'npm start',
        testCommand: 'npm test',
        installCommand: 'npm install',
        testFramework: 'jest',
        linting: ['eslint', 'prettier'],
        packageManager: 'npm'
      },
      vue: {
        language: 'typescript',
        framework: 'Vue.js',
        buildCommand: 'npm run build',
        devCommand: 'npm run serve',
        testCommand: 'npm run test',
        installCommand: 'npm install',
        testFramework: 'cypress',
        linting: ['eslint', 'prettier'],
        packageManager: 'npm'
      },
      'nodejs-api': {
        language: 'javascript',
        framework: 'Node.js',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
        testCommand: 'npm test',
        installCommand: 'npm install',
        testFramework: 'jest',
        linting: ['eslint'],
        packageManager: 'npm'
      },
      express: {
        language: 'javascript',
        framework: 'Express.js',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
        testCommand: 'npm test',
        installCommand: 'npm install',
        testFramework: 'jest',
        linting: ['eslint'],
        packageManager: 'npm'
      },
      fastapi: {
        language: 'python',
        framework: 'FastAPI',
        buildCommand: 'python -m build',
        devCommand: 'uvicorn main:app --reload',
        testCommand: 'pytest',
        installCommand: 'pip install -r requirements.txt',
        testFramework: 'pytest',
        linting: ['black', 'flake8'],
        packageManager: 'pip'
      },
      django: {
        language: 'python',
        framework: 'Django',
        buildCommand: 'python manage.py collectstatic --noinput',
        devCommand: 'python manage.py runserver',
        testCommand: 'python manage.py test',
        installCommand: 'pip install -r requirements.txt',
        testFramework: 'django-test',
        linting: ['black', 'flake8'],
        packageManager: 'pip'
      },
      solidity: {
        language: 'solidity',
        framework: 'Solidity',
        buildCommand: 'npx hardhat compile',
        devCommand: 'npx hardhat node',
        testCommand: 'npx hardhat test',
        installCommand: 'npm install',
        testFramework: 'hardhat',
        linting: ['solhint'],
        packageManager: 'npm'
      },
      hardhat: {
        language: 'solidity',
        framework: 'Hardhat',
        buildCommand: 'npx hardhat compile',
        devCommand: 'npx hardhat node',
        testCommand: 'npx hardhat test',
        installCommand: 'npm install',
        testFramework: 'hardhat',
        linting: ['solhint', 'eslint'],
        packageManager: 'npm'
      },
      foundry: {
        language: 'solidity',
        framework: 'Foundry',
        buildCommand: 'forge build',
        devCommand: 'anvil',
        testCommand: 'forge test',
        installCommand: 'forge install',
        testFramework: 'foundry',
        linting: ['solhint'],
        packageManager: 'forge'
      },
      rust: {
        language: 'rust',
        framework: 'Rust',
        buildCommand: 'cargo build --release',
        devCommand: 'cargo run',
        testCommand: 'cargo test',
        installCommand: 'cargo fetch',
        testFramework: 'cargo-test',
        linting: ['clippy', 'rustfmt'],
        packageManager: 'cargo'
      },
      go: {
        language: 'go',
        framework: 'Go',
        buildCommand: 'go build',
        devCommand: 'go run main.go',
        testCommand: 'go test ./...',
        installCommand: 'go mod download',
        testFramework: 'go-test',
        linting: ['golint', 'gofmt'],
        packageManager: 'go'
      },
      python: {
        language: 'python',
        framework: 'Python',
        buildCommand: 'python setup.py build',
        devCommand: 'python main.py',
        testCommand: 'pytest',
        installCommand: 'pip install -r requirements.txt',
        testFramework: 'pytest',
        linting: ['black', 'flake8'],
        packageManager: 'pip'
      },
      docker: {
        language: 'dockerfile',
        framework: 'Docker',
        buildCommand: 'docker build .',
        devCommand: 'docker-compose up',
        testCommand: 'docker-compose -f docker-compose.test.yml up',
        installCommand: 'docker-compose pull',
        testFramework: 'docker',
        linting: ['hadolint'],
        packageManager: 'docker'
      },
      generic: {
        language: 'unknown',
        framework: 'Generic',
        buildCommand: 'echo "No build command configured"',
        devCommand: 'echo "No dev command configured"',
        testCommand: 'echo "No test command configured"',
        installCommand: 'echo "No install command configured"',
        testFramework: 'none',
        linting: [],
        packageManager: 'unknown'
      }
    };

    return configs[projectType] || configs.generic;
  }

  private async loadCustomConfig(repoPath: string): Promise<Partial<ProjectConfig>> {
    const configFiles = ['GEMINI.md', '.gemini.json', '.gemini.yml'];
    
    for (const configFile of configFiles) {
      const configPath = path.join(repoPath, configFile);
      
      try {
        if (configFile.endsWith('.md')) {
          const content = await fs.readFile(configPath, 'utf-8');
          return this.parseMarkdownConfig(content);
        } else if (configFile.endsWith('.json')) {
          const content = await fs.readFile(configPath, 'utf-8');
          return JSON.parse(content);
        }
      } catch {
        // Continue to next config file
      }
    }

    return {};
  }

  private parseMarkdownConfig(content: string): Partial<ProjectConfig> {
    const config: Partial<ProjectConfig> = {};
    
    const projectTypeMatch = content.match(/\*\*Project Type\*\*:\s*(.+)/i);
    if (projectTypeMatch) {
      config.framework = projectTypeMatch[1].trim();
    }

    const testFrameworkMatch = content.match(/\*\*Testing Framework\*\*:\s*(.+)/i);
    if (testFrameworkMatch) {
      config.testFramework = testFrameworkMatch[1].trim();
    }

    const buildMatch = content.match(/\*\*Build Command\*\*:\s*`(.+)`/i);
    if (buildMatch) {
      config.buildCommand = buildMatch[1].trim();
    }

    return config;
  }

  private async detectProjectFeatures(repoPath: string, projectType: ProjectType): Promise<string[]> {
    const features: string[] = [];

    const featureChecks = [
      { file: 'Dockerfile', feature: 'docker' },
      { file: 'docker-compose.yml', feature: 'docker-compose' },
      { file: '.github/workflows', feature: 'github-actions' },
      { file: 'terraform', feature: 'terraform' },
      { file: 'kubernetes', feature: 'kubernetes' },
      { file: '.env.example', feature: 'environment-config' },
      { file: 'README.md', feature: 'documentation' }
    ];

    for (const check of featureChecks) {
      try {
        await fs.access(path.join(repoPath, check.file));
        features.push(check.feature);
      } catch {
        // Feature not present
      }
    }

    const testingFeatures = await this.detectTestingFrameworks(repoPath);
    features.push(...testingFeatures);

    if (projectType === 'nextjs' || projectType === 'react') {
      const frontendFeatures = [
        { file: 'tailwind.config.js', feature: 'tailwind' },
        { file: 'styled-components', feature: 'styled-components' },
        { file: 'package.json', contains: 'storybook', feature: 'storybook' }
      ];

      for (const check of frontendFeatures) {
        try {
          if (check.contains) {
            const packageJson = await fs.readFile(path.join(repoPath, check.file), 'utf-8');
            if (packageJson.includes(check.contains)) {
              features.push(check.feature);
            }
          } else {
            await fs.access(path.join(repoPath, check.file));
            features.push(check.feature);
          }
        } catch {
          // Feature not present
        }
      }
    }

    return features;
  }

  private async detectTestingFrameworks(repoPath: string): Promise<string[]> {
    const testingFeatures: string[] = [];

    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const allDeps = { 
        ...packageJson.dependencies, 
        ...packageJson.devDependencies 
      };

      if (allDeps['@playwright/test'] || allDeps['playwright']) {
        testingFeatures.push('playwright-tests');
        
        const playwrightConfigs = ['playwright.config.ts', 'playwright.config.js'];
        for (const config of playwrightConfigs) {
          try {
            await fs.access(path.join(repoPath, config));
            testingFeatures.push('playwright-config');
            break;
          } catch {}
        }

        const testDirs = ['e2e', 'tests', 'test'];
        for (const dir of testDirs) {
          try {
            await fs.access(path.join(repoPath, dir));
            testingFeatures.push(`${dir}-directory`);
          } catch {}
        }
      }

      if (allDeps['jest'] || allDeps['@types/jest']) {
        testingFeatures.push('jest-tests');
      }

      if (allDeps['cypress']) {
        testingFeatures.push('cypress-tests');
        
        try {
          await fs.access(path.join(repoPath, 'cypress.config.js'));
          testingFeatures.push('cypress-config');
        } catch {}
      }

      if (allDeps['vitest']) {
        testingFeatures.push('vitest-tests');
      }

      if (allDeps['@testing-library/react'] || allDeps['@testing-library/vue']) {
        testingFeatures.push('testing-library');
      }

      if (packageJson.scripts) {
        const scripts = packageJson.scripts;
        if (scripts['test:e2e']) testingFeatures.push('e2e-script');
        if (scripts['test:unit']) testingFeatures.push('unit-test-script');
        if (scripts['test:integration']) testingFeatures.push('integration-test-script');
      }

    } catch (error: any) {
      this.logger.debug('Could not detect testing frameworks', { error: error.message });
    }

    return testingFeatures;
  }
} 