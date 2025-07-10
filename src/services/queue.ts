import { Queue, QueueEvents } from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';
import { Logger } from '../utils/logger';

// Redis connection configuration
const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
};

// Create Redis instance for queue management
export const redis = new Redis(redisConnection);

// Gemini job queue with rate limiting to prevent quota exhaustion
export const geminiQueue = new Queue('gemini-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,   // Keep last 50 completed jobs for dashboard
    removeOnFail: 100,      // Keep last 100 failed jobs for debugging
    attempts: 3,            // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 60000,         // Start with 1 minute delay
    },
  }
});

// Rate limiting configuration - prevents quota exhaustion
export const rateLimiter = {
  max: 50,                  // Max 50 requests per duration
  duration: 60_000,         // Per 60 seconds (1 minute)
};

// Note: Rate limiting is now handled by Express middleware instead of queue-based limiting

// Queue events for real-time monitoring
export const queueEvents = new QueueEvents('gemini-jobs', {
  connection: redisConnection,
});

// Logger for queue operations
const logger = new Logger('GeminiQueue');

// Queue event handlers for observability
queueEvents.on('waiting', ({ jobId }) => {
  logger.info('Job waiting in queue', { jobId });
});

queueEvents.on('active', ({ jobId }) => {
  logger.info('Job started processing', { jobId });
});

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info('Job completed successfully', { 
    jobId, 
    result: returnvalue
  });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error('Job failed', { jobId, error: failedReason });
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn('Job stalled - may need intervention', { jobId });
});

// Pause queue when quota is exhausted
export async function pauseQueueForQuota(resumeAt: Date): Promise<void> {
  await geminiQueue.pause();
  const pauseDuration = resumeAt.getTime() - Date.now();
  
  logger.warn('Queue paused due to quota exhaustion', {
    resumeAt: resumeAt.toISOString(),
    pauseDurationMs: pauseDuration
  });
  
  // Auto-resume when quota resets
  setTimeout(async () => {
    await geminiQueue.resume();
    logger.info('Queue resumed - quota should be reset');
  }, pauseDuration);
}

// Get queue statistics for dashboard
export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    geminiQueue.getWaiting(),
    geminiQueue.getActive(),
    geminiQueue.getCompleted(),
    geminiQueue.getFailed(),
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    isPaused: await geminiQueue.isPaused(),
  };
}

// Job data interface
export interface GeminiJobData {
  repoPath: string;
  promptFile: string;
  projectConfig: any;
  payload: any;
  env: Record<string, string | undefined>;
  jobId: string;
  timestamp: string;
}

// Job result interface
export interface GeminiJobResult {
  success: boolean;
  output: string;
  projectType: string;
  timestamp: string;
  commits: string[];
  duration: number;
}

// Add job to queue with proper typing
export async function addGeminiJob(data: Omit<GeminiJobData, 'jobId' | 'timestamp'>): Promise<string> {
  const jobId = `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const jobData: GeminiJobData = {
    ...data,
    jobId,
    timestamp: new Date().toISOString(),
  };

  const job = await geminiQueue.add('process-gemini', jobData, {
    jobId,
    // Apply rate limiting
    ...rateLimiter,
  });

  logger.info('Gemini job queued', {
    jobId,
    repository: data.payload?.repository?.full_name,
    queuePosition: await geminiQueue.getWaiting().then(jobs => jobs.length)
  });

  return jobId;
}

// Graceful shutdown
export async function closeQueue(): Promise<void> {
  logger.info('Closing queue connections...');
  await queueEvents.close();
  await geminiQueue.close();
  await redis.quit();
  logger.info('Queue connections closed');
}

// Initialize queue on startup
export async function initializeQueue(): Promise<void> {
  try {
    // Test Redis connection
    await redis.ping();
    logger.info('Connected to Redis successfully');
    
    // Test queue functionality
    const stats = await getQueueStats();
    logger.info('Queue initialized', stats);
    
  } catch (error) {
    logger.error('Failed to initialize queue', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
} 