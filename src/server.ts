#!/usr/bin/env node

import { createWebhookServer } from './services/webhook-server';
import { Logger } from './utils/logger';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Main entry point for the Gemini Coding Factory
 */
async function main() {
  const logger = Logger.create('Main');
  
  logger.info('🤖 Starting Gemini Coding Factory...');

  try {
    // Validate required environment variables
    const requiredEnvVars = ['GEMINI_API_KEY', 'GITHUB_TOKEN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Configuration
    const workspaceRoot = process.env.WORKSPACE_ROOT || '/home/wes/coding-factory';
    const port = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '5000');
    const webhookPath = process.env.WEBHOOK_PATH || '/webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET;
    
    logger.info('Configuration loaded', {
      workspaceRoot,
      port,
      webhookPath,
      hasSecret: !!webhookSecret,
      nodeEnv: process.env.NODE_ENV || 'development'
    });

    // Create and start the webhook server
    const server = createWebhookServer(workspaceRoot, {
      port,
      path: webhookPath,
      secret: webhookSecret,
      cors: {
        origin: (process.env.CORS_ORIGINS || '*').split(',')
      }
    });

    // Start the server
    await server.start();

    logger.info('🚀 Gemini Coding Factory is operational!', {
      port,
      webhook: `http://localhost:${port}${webhookPath}`,
      health: `http://localhost:${port}/health`,
      status: `http://localhost:${port}/status`
    });

    // Setup cleanup on shutdown
    const cleanup = async () => {
      logger.info('🛑 Shutting down Gemini Coding Factory...');
      // Add any cleanup logic here (close DB connections, etc.)
      logger.info('✅ Shutdown complete');
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start Gemini Coding Factory', { error: errorMessage });
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main }; 