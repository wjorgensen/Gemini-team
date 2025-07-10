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
    const { payload, env, jobId } = job.data;
    const orchestrator = new GeminiOrchestrator(env.WORKSPACE_PATH || '/workspace');
    const startTime = Date.now();

    logger.info('Starting Gemini job', { jobId });
    emitJobStdout(jobId, 'Starting Gemini job processing...');

    try {
        const result = await orchestrator.processWebhook(payload);

        const duration = Date.now() - startTime;
        emitJobStdout(jobId, `Workflow completed with status: ${result.success ? 'Success' : 'Failure'}`);
        
        return { ...result, duration };

    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof QuotaExceededError || (error instanceof Error && error.message.includes('429'))) {
            logger.warn('Caught QuotaExceededError, pausing queue and rescheduling job', { jobId });
            emitJobStdout(jobId, 'API quota limit reached. Pausing queue and rescheduling job.');

            const resumeAt = new Date(Date.now() + 3600 * 1000);
            await pauseQueueForQuota(resumeAt);
            emitQuotaExhausted(resumeAt);

            await geminiQueue.add('process-gemini', job.data, {
                delay: 3600 * 1000,
                jobId: `${job.id}-requeued`,
            });
            
            const err = new Error('Quota exceeded, job rescheduled.');
            throw err;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Unhandled error in Gemini worker', { jobId, error: errorMessage });
        emitJobStdout(jobId, `Error: ${errorMessage}`);
        throw error;
    }
}, {
    concurrency: 2,
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
    }
});

worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`, {
        jobId: job?.id,
        error: err.stack
    });
});

export function closeWorker(): Promise<void> {
    return worker.close();
} 