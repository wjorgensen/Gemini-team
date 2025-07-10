import { Job, Worker } from 'bullmq';
import { GeminiOrchestrator } from './orchestrator';
import { GeminiJobData, GeminiJobResult, pauseQueueForQuota, geminiQueue } from './queue';
import { Logger } from '../utils/logger';
import { emitJobStdout, emitQuotaExhausted } from './events';

const logger = new Logger('GeminiWorker');

class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

const worker = new Worker('gemini-jobs', async (job: Job<GeminiJobData, GeminiJobResult>): Promise<GeminiJobResult> => {
    const startTime = Date.now();
    
    // Extract job data with validation
    const { repoPath, promptFile, projectConfig, payload, env, jobId } = job.data;
    
    // Validate required job data
    if (!jobId) {
        logger.error('Job missing jobId', { jobData: job.data });
        throw new Error('Job missing required jobId');
    }
    
    if (!projectConfig || !projectConfig.type) {
        logger.error('Job missing projectConfig', { jobId, jobData: job.data });
        return {
            success: false,
            output: 'Job missing required project configuration',
            projectType: 'unknown',
            timestamp: new Date().toISOString(),
            commits: [],
            duration: Date.now() - startTime
        };
    }
    
    if (!repoPath || !promptFile) {
        logger.error('Job missing required paths', { jobId, repoPath, promptFile });
        return {
            success: false,
            output: 'Job missing required repository path or prompt file',
            projectType: projectConfig.type,
            timestamp: new Date().toISOString(),
            commits: [],
            duration: Date.now() - startTime
        };
    }

    logger.info('Starting Gemini job', { jobId, repoPath, projectType: projectConfig.type });
    emitJobStdout(jobId, 'Starting Gemini CLI execution...');

    try {
        // Create orchestrator with proper workspace path
        const orchestrator = new GeminiOrchestrator(env.WORKSPACE_PATH || '/workspace');
        
        // Read the prompt from the file
        const fs = await import('fs/promises');
        const prompt = await fs.readFile(promptFile, 'utf-8');
        
        emitJobStdout(jobId, `Executing Gemini CLI for ${payload.repository.full_name}`);
        emitJobStdout(jobId, `Project Type: ${projectConfig.type}`);
        emitJobStdout(jobId, `Working Directory: ${repoPath}`);
        
        // Execute Gemini CLI
        const output = await orchestrator.executeGemini(repoPath, prompt, jobId);
        
        const duration = Date.now() - startTime;
        emitJobStdout(jobId, `✅ Gemini CLI completed successfully in ${duration}ms`);
        
        return {
            success: true,
            output,
            projectType: projectConfig.type,
            timestamp: new Date().toISOString(),
            commits: [], // TODO: Extract commits from git log if needed
            duration
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof QuotaExceededError || (error instanceof Error && error.message.includes('429'))) {
            logger.warn('Caught QuotaExceededError, pausing queue and rescheduling job', { jobId });
            emitJobStdout(jobId, 'API quota limit reached. Pausing queue and rescheduling job.');

            const resumeAt = new Date(Date.now() + 3600 * 1000);
            await pauseQueueForQuota(resumeAt);
            emitQuotaExhausted(resumeAt);

            // Don't reschedule job - let quota protection handle this
            logger.info('Job not rescheduled - quota protection active', { jobId, resumeAt });
            
            return {
                success: false,
                output: 'API quota exhausted - job paused until quota resets',
                projectType: projectConfig.type,
                timestamp: new Date().toISOString(),
                commits: [],
                duration
            };
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Gemini CLI execution failed', { jobId, error: errorMessage });
        emitJobStdout(jobId, `❌ Error: ${errorMessage}`);
        
        return {
            success: false,
            output: errorMessage,
            projectType: projectConfig.type,
            timestamp: new Date().toISOString(),
            commits: [],
            duration
        };
    }
}, {
    concurrency: 2,
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
    }
});

// Add startup logging
logger.info('🔄 Gemini Worker initialized and ready to process jobs', {
    concurrency: 2,
    queueName: 'gemini-jobs',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379')
});

worker.on('ready', () => {
    logger.info('✅ Gemini Worker connected to Redis and ready to process jobs');
});

worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`, {
        jobId: job?.id,
        error: err.stack
    });
});

worker.on('error', (err) => {
    logger.error('Worker error:', err);
});

export function closeWorker(): Promise<void> {
    return worker.close();
} 