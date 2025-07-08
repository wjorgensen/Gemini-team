import express from 'express';
import crypto from 'crypto';
import { GeminiOrchestrator } from './orchestrator';
import { GitHubWebhookPayload, WebhookServerConfig } from '../types';
import { Logger } from '../utils/logger';

export class WebhookServer {
  private app: express.Application;
  private orchestrator: GeminiOrchestrator;
  private logger: Logger;
  private config: WebhookServerConfig;

  constructor(orchestrator: GeminiOrchestrator, config: WebhookServerConfig) {
    this.orchestrator = orchestrator;
    this.config = config;
    this.logger = new Logger('WebhookServer');
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Sets up Express middleware
   */
  private setupMiddleware(): void {
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

    // Status endpoint with workspace information
    this.app.get('/status', async (req, res) => {
      try {
        // Get workspace stats from repository manager
        const stats = await this.orchestrator['repositoryManager'].getWorkspaceStats();
        
        res.json({
          status: 'operational',
          timestamp: new Date().toISOString(),
          workspace: stats,
          server: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            version: process.env.npm_package_version || 'unknown'
          }
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

        // Validate payload structure
        if (!this.isValidWebhookPayload(payload)) {
          this.logger.warn('Invalid webhook payload structure');
          return res.status(400).json({ error: 'Invalid payload structure' });
        }

        // Process the webhook asynchronously
        this.processWebhookAsync(payload, req.headers['x-github-delivery'] as string);

        // Respond immediately to GitHub
        res.status(200).json({ 
          message: 'Webhook received and queued for processing',
          delivery: req.headers['x-github-delivery']
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
   * Processes webhook asynchronously to avoid blocking the response
   */
  private async processWebhookAsync(payload: GitHubWebhookPayload, deliveryId: string): Promise<void> {
    const operation = this.logger.operation('ProcessWebhook');
    
    try {
      operation.info('Starting webhook processing', {
        repository: payload.repository.full_name,
        delivery: deliveryId,
        user: payload.comment?.user.login
      });

      const result = await this.orchestrator.processWebhook(payload);

      operation.complete(`Webhook processed successfully for ${payload.repository.full_name}`);
      
      this.logger.info('Workflow completed', {
        repository: payload.repository.full_name,
        delivery: deliveryId,
        success: result.success,
        projectType: result.projectType,
        commits: result.commits.length
      });

    } catch (error) {
      operation.fail('Webhook processing failed', error instanceof Error ? error : new Error(String(error)));
      
      this.logger.error('Workflow failed', {
        repository: payload.repository.full_name,
        delivery: deliveryId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Starts the webhook server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.config.port, () => {
        this.logger.info(`Webhook server started`, {
          port: this.config.port,
          path: this.config.path,
          cors: this.config.cors.origin
        });
        resolve();
      });

      // Graceful shutdown handling
      const gracefulShutdown = (signal: string) => {
        this.logger.info(`Received ${signal}, shutting down gracefully`);
        
        server.close(() => {
          this.logger.info('HTTP server closed');
          process.exit(0);
        });

        // Force close after 10 seconds
        setTimeout(() => {
          this.logger.error('Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 10000);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    });
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
    port: parseInt(process.env.WEBHOOK_PORT || '3000'),
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