import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { GeminiOrchestrator } from './orchestrator';
import { GitHubWebhookPayload, WebhookServerConfig } from '../types';
import { Logger } from '../utils/logger';
import { addGeminiJob, initializeQueue, getQueueStats } from './queue';
import { initializeSocketIO, emitJobStarted } from './events';

export class WebhookServer {
  private app: express.Application;
  private httpServer: any;
  private orchestrator: GeminiOrchestrator;
  private logger: Logger;
  private config: WebhookServerConfig;
  private processedWebhooks: Set<string>; // Add deduplication tracking

  constructor(orchestrator: GeminiOrchestrator, config: WebhookServerConfig) {
    this.orchestrator = orchestrator;
    this.config = config;
    this.logger = new Logger('WebhookServer');
    this.app = express();
    this.httpServer = createServer(this.app);
    this.processedWebhooks = new Set();
    this.setupMiddleware();
    this.setupRoutes();
    
    // Clean up processed webhooks every hour
    setInterval(() => {
      this.processedWebhooks.clear();
      this.logger.debug('Cleared webhook deduplication cache');
    }, 60 * 60 * 1000);
  }

  /**
   * Sets up Express middleware
   */
  private setupMiddleware(): void {
    // Rate limiting using express-rate-limit (replaces manual rate limiting)
    const webhookRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minute window
      max: 10, // Limit each IP to 10 requests per windowMs
      message: {
        error: 'Too many webhook requests from this IP, please try again later.',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Apply rate limiting to webhook endpoints
    this.app.use(this.config.path, webhookRateLimit);

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));

    // CORS configuration
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (this.config.cors.origin.includes('*') || 
          (origin && this.config.cors.origin.includes(origin))) {
        res.header('Access-Control-Allow-Origin', origin);
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-GitHub-Event, X-GitHub-Delivery, X-Hub-Signature-256');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        userAgent: req.headers['user-agent'],
        githubEvent: req.headers['x-github-event'],
        githubDelivery: req.headers['x-github-delivery']
      });
      next();
    });
  }

  /**
   * Sets up Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'gemini-coding-factory'
      });
    });

    // Status endpoint with workspace and queue information
    this.app.get('/status', async (req, res) => {
      try {
        // Get workspace stats from repository manager
        const workspaceStats = await this.orchestrator['repositoryManager'].getWorkspaceStats();
        
        // Get queue statistics
        const queueStats = await getQueueStats();
        
        res.json({
          status: 'operational',
          timestamp: new Date().toISOString(),
          workspace: workspaceStats,
          queue: queueStats,
          server: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            version: process.env.npm_package_version || 'unknown'
          },
          features: [
            'BullMQ job queue with rate limiting',
            'Socket.io real-time events',
            'ARG_MAX protection (--prompt-file)',
            'Memory streaming (readline)',
            'Automatic quota protection',
            'Express rate limiting'
          ]
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to get status', { error: errorMessage });
        res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve status information'
        });
      }
    });

    // Main webhook endpoint
    this.app.post(this.config.path, async (req, res) => {
      try {
        // Verify webhook signature if secret is configured
        if (this.config.secret) {
          const isValid = this.verifySignature(req.body, req.headers['x-hub-signature-256'] as string);
          if (!isValid) {
            this.logger.warn('Invalid webhook signature', {
              delivery: req.headers['x-github-delivery']
            });
            return res.status(401).json({ error: 'Invalid signature' });
          }
        }

        const githubEvent = req.headers['x-github-event'] as string;
        const payload: GitHubWebhookPayload = req.body;

        // Only process issue_comment events for now
        if (githubEvent !== 'issue_comment') {
          this.logger.debug('Ignoring non-comment event', { event: githubEvent });
          return res.status(200).json({ message: 'Event ignored' });
        }

        // Only process comment creation events (ignore edits and deletions)
        if (payload.action && payload.action !== 'created') {
          this.logger.info('Ignoring comment action', { 
            action: payload.action,
            commentId: payload.comment?.id,
            delivery: req.headers['x-github-delivery']
          });
          return res.status(200).json({ message: 'Comment action ignored' });
        }

        // Validate payload structure
        if (!this.isValidWebhookPayload(payload)) {
          this.logger.warn('Invalid webhook payload structure');
          return res.status(400).json({ error: 'Invalid payload structure' });
        }

        // 🚨 IMPROVED: Deduplication and job queue processing
        const deliveryId = req.headers['x-github-delivery'] as string;
        const commentId = payload.comment?.id?.toString() || 'unknown';
        const deduplicationKey = `${payload.repository.full_name}-${commentId}-${payload.action}`;
        
        // Check for duplicate processing
        if (this.processedWebhooks.has(deduplicationKey)) {
          this.logger.warn('Duplicate webhook ignored to prevent API waste', {
            repository: payload.repository.full_name,
            commentId,
            delivery: deliveryId
          });
          return res.status(200).json({ message: 'Duplicate webhook ignored' });
        }

        // Mark as processed
        this.processedWebhooks.add(deduplicationKey);

        this.logger.info('Processing webhook with BullMQ queue', {
          repository: payload.repository.full_name,
          delivery: deliveryId,
          deduplicationKey
        });

        // Add job to queue instead of direct processing
        const jobId = await this.queueWebhookJob(payload, deliveryId);

        // Respond immediately to GitHub
        res.status(200).json({ 
          message: 'Webhook received and queued for processing',
          jobId,
          delivery: deliveryId,
          queueStatus: 'queued'
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Webhook processing error', { error: errorMessage });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Trigger endpoint for manual testing (only in development)
    if (process.env.NODE_ENV === 'development') {
      this.app.post('/trigger', async (req, res) => {
        try {
          const { repository, feature, branch = 'main' } = req.body;

          if (!repository || !feature) {
            return res.status(400).json({ 
              error: 'Missing required fields: repository, feature' 
            });
          }

          // Create a mock webhook payload for testing
          const mockPayload: GitHubWebhookPayload = {
            repository: {
              full_name: repository,
              clone_url: `https://github.com/${repository}.git`,
              private: false,
              owner: {
                login: repository.split('/')[0]
              },
              name: repository.split('/')[1]
            },
            pull_request: {
              number: 999, // Mock PR number
              head: {
                ref: branch,
                sha: 'mock-sha-' + Date.now()
              }
            },
            comment: {
              id: Date.now(),
              body: `@gemini ${feature}`,
              user: {
                login: 'wjorgensen' // Authorized user for testing
              }
            }
          };

          // Process the mock webhook
          const result = await this.orchestrator.processWebhook(mockPayload);

          res.json({
            message: 'Manual trigger processed',
            result: {
              success: result.success,
              projectType: result.projectType,
              timestamp: result.timestamp
            }
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Manual trigger error', { error: errorMessage });
          res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
    }

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Express error handler', { error: errorMessage });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Verifies GitHub webhook signature
   */
  private verifySignature(payload: any, signature: string): boolean {
    if (!signature || !this.config.secret) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', this.config.secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  }

  /**
   * Validates webhook payload structure
   */
  private isValidWebhookPayload(payload: any): payload is GitHubWebhookPayload {
    return payload &&
           payload.repository &&
           payload.repository.full_name &&
           payload.repository.clone_url &&
           payload.comment &&
           payload.comment.body &&
           payload.comment.user &&
           payload.comment.user.login;
  }

  /**
   * Queues webhook job using BullMQ instead of direct processing
   */
  private async queueWebhookJob(payload: GitHubWebhookPayload, deliveryId: string): Promise<string> {
    try {
      // Setup repository and prepare job data
      const repoPath = await this.orchestrator['repositoryManager'].setupRepository(
        payload.repository.clone_url,
        payload.repository.full_name,
        process.env.GITHUB_TOKEN
      );

      // Checkout PR branch if needed
      if (payload.pull_request) {
        await this.orchestrator['repositoryManager'].checkoutPRBranch(
          repoPath,
          payload.pull_request.head.ref,
          payload.pull_request.head.sha
        );
      }

      // Detect project configuration
      const projectConfig = await this.orchestrator['projectDetector'].loadProjectConfig(
        repoPath,
        await this.orchestrator['projectDetector'].detectProjectType(repoPath)
      );

      // Extract feature specification
      const featureSpec = payload.comment?.body
        ?.replace(/@gemini/gi, '')
        ?.trim() || '';

      // Build prompt and save to file
      const prompt = await this.orchestrator['promptBuilder'].buildPrompt(
        projectConfig,
        featureSpec,
        repoPath,
        payload
      );

      const promptFile = `${repoPath}/.gemini-prompt.txt`;
      await require('fs/promises').writeFile(promptFile, prompt);

      // Prepare environment
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

      // Add job to queue
      const jobId = await addGeminiJob({
        repoPath,
        promptFile,
        projectConfig,
        payload,
        env
      });

      // Emit job started event for real-time dashboard
      emitJobStarted(jobId, {
        repository: payload.repository.full_name,
        user: payload.comment?.user.login,
        featureSpec,
        projectType: projectConfig.type
      });

      this.logger.info('Webhook job queued successfully', {
        jobId,
        repository: payload.repository.full_name,
        delivery: deliveryId,
        projectType: projectConfig.type
      });

      return jobId;

    } catch (error) {
      this.logger.error('Failed to queue webhook job', {
        repository: payload.repository.full_name,
        delivery: deliveryId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Starts the webhook server with queue and Socket.io initialization
   */
  async start(): Promise<void> {
    try {
      // Initialize Redis queue
      await initializeQueue();
      this.logger.info('BullMQ queue initialized');

      // Initialize Socket.io for real-time dashboard
      initializeSocketIO(this.httpServer);
      this.logger.info('Socket.io initialized for real-time dashboard');

      return new Promise((resolve) => {
        const server = this.httpServer.listen(this.config.port, () => {
          this.logger.info(`🚀 Gemini Coding Factory started`, {
            port: this.config.port,
            path: this.config.path,
            cors: this.config.cors.origin,
            features: [
              'BullMQ job queue',
              'Redis rate limiting', 
              'Socket.io real-time events',
              'ARG_MAX protection',
              'Memory streaming',
              'Quota protection'
            ]
          });
          resolve();
        });

        // Graceful shutdown handling
        const gracefulShutdown = async (signal: string) => {
          this.logger.info(`Received ${signal}, shutting down gracefully`);
          
          try {
            // Close all services
            const { closeQueue } = await import('./queue');
            const { closeWorker } = await import('./worker');
            const { closeSocketIO } = await import('./events');
            
            await Promise.all([
              closeQueue(),
              closeWorker(),
              closeSocketIO()
            ]);
            
            server.close(() => {
              this.logger.info('All services closed gracefully');
              process.exit(0);
            });
          } catch (error) {
            this.logger.error('Error during graceful shutdown', { 
              error: error instanceof Error ? error.message : String(error) 
            });
            process.exit(1);
          }

          // Force close after 10 seconds
          setTimeout(() => {
            this.logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
          }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      });

    } catch (error) {
      this.logger.error('Failed to start server', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Gets the Express app instance (useful for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}

/**
 * Creates and configures the webhook server
 */
export function createWebhookServer(
  workspaceRoot: string = '/home/wes/coding-factory',
  config: Partial<WebhookServerConfig> = {}
): WebhookServer {
  const fullConfig: WebhookServerConfig = {
    port: parseInt(process.env.WEBHOOK_PORT || '5000'),
    path: process.env.WEBHOOK_PATH || '/webhook',
    secret: process.env.WEBHOOK_SECRET,
    cors: {
      origin: (process.env.CORS_ORIGINS || '*').split(',')
    },
    ...config
  };

  const orchestrator = new GeminiOrchestrator(workspaceRoot);
  return new WebhookServer(orchestrator, fullConfig);
} 