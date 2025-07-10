import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { queueEvents, getQueueStats } from './queue';
import { Logger } from '../utils/logger';

// Logger for events
const logger = new Logger('SocketEvents');

// Socket.io server instance
let io: SocketIOServer | null = null;

/**
 * Initialize Socket.io server and wire up BullMQ events
 */
export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.DASHBOARD_URL || "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
  });

  logger.info('Socket.io server initialized');

  // Handle client connections
  io.on('connection', (socket) => {
    logger.info('Dashboard client connected', { socketId: socket.id });

    // Send current queue stats on connection
    sendQueueStats(socket);

    // Handle client requesting to tail a specific job
    socket.on('tail', (jobId: string) => {
      socket.join(`job:${jobId}`);
      logger.debug('Client joined job room', { socketId: socket.id, jobId });
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
      logger.debug('Dashboard client disconnected', { socketId: socket.id });
    });

    // Send queue stats every 5 seconds to this client
    const statsInterval = setInterval(async () => {
      try {
        const stats = await getQueueStats();
        socket.emit('queue:stats', stats);
      } catch (error) {
        logger.error('Failed to send queue stats', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }, 5000);

    // Clean up interval on disconnect
    socket.on('disconnect', () => {
      clearInterval(statsInterval);
    });
  });

  // Wire up BullMQ events to Socket.io broadcasts
  wireQueueEvents();

  return io;
}

/**
 * Wire BullMQ queue events to Socket.io broadcasts
 */
function wireQueueEvents(): void {
  if (!io) {
    logger.error('Socket.io not initialized - cannot wire queue events');
    return;
  }

  logger.info('Wiring BullMQ events to Socket.io broadcasts');

  // Job waiting in queue
  queueEvents.on('waiting', ({ jobId }) => {
    logger.debug('Job waiting', { jobId });
    io!.emit('job:waiting', { 
      jobId, 
      status: 'waiting',
      timestamp: new Date().toISOString()
    });
  });

  // Job started processing
  queueEvents.on('active', ({ jobId }) => {
    logger.debug('Job active', { jobId });
    io!.emit('job:active', { 
      jobId, 
      status: 'running',
      timestamp: new Date().toISOString()
    });
  });

  // Job completed successfully
  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.info('Job completed', { jobId });
    io!.emit('job:completed', { 
      jobId, 
      status: 'completed',
      result: returnvalue,
      timestamp: new Date().toISOString()
    });
    
    // Broadcast updated queue stats
    broadcastQueueStats();
  });

  // Job failed
  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error('Job failed', { jobId, error: failedReason });
    io!.emit('job:failed', { 
      jobId, 
      status: 'failed',
      error: failedReason,
      timestamp: new Date().toISOString()
    });
    
    // Broadcast updated queue stats
    broadcastQueueStats();
  });

  // Job stalled (needs intervention)
  queueEvents.on('stalled', ({ jobId }) => {
    logger.warn('Job stalled', { jobId });
    io!.emit('job:stalled', { 
      jobId, 
      status: 'stalled',
      timestamp: new Date().toISOString()
    });
  });

  // Job progress (if supported)
  queueEvents.on('progress', ({ jobId, data }) => {
    logger.debug('Job progress', { jobId, progress: data });
    io!.emit('job:progress', { 
      jobId, 
      progress: data,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Send current queue statistics to a specific socket
 */
async function sendQueueStats(socket: any): Promise<void> {
  try {
    const stats = await getQueueStats();
    socket.emit('queue:stats', stats);
    logger.debug('Sent queue stats to client', { socketId: socket.id, stats });
  } catch (error) {
    logger.error('Failed to send queue stats', { 
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Broadcast queue statistics to all connected clients
 */
async function broadcastQueueStats(): Promise<void> {
  if (!io) return;
  
  try {
    const stats = await getQueueStats();
    io.emit('queue:stats', stats);
    logger.debug('Broadcasted queue stats', { stats });
  } catch (error) {
    logger.error('Failed to broadcast queue stats', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Emit stdout line for a specific job
 */
export function emitJobStdout(jobId: string, line: string): void {
  if (!io) return;
  
  io.to(`job:${jobId}`).emit('job:stdout', { 
    jobId, 
    line,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('Emitted stdout line', { jobId, lineLength: line.length });
}

/**
 * Emit stderr line for a specific job
 */
export function emitJobStderr(jobId: string, line: string): void {
  if (!io) return;
  
  io.to(`job:${jobId}`).emit('job:stderr', { 
    jobId, 
    line,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('Emitted stderr line', { jobId, lineLength: line.length });
}

/**
 * Emit job started event with metadata
 */
export function emitJobStarted(jobId: string, metadata: any): void {
  if (!io) return;
  
  io.emit('job:started', { 
    jobId,
    metadata,
    timestamp: new Date().toISOString()
  });
  
  logger.info('Emitted job started event', { jobId, repository: metadata.repository });
}

/**
 * Emit quota exhaustion warning to all clients
 */
export function emitQuotaExhausted(resetTime: Date): void {
  if (!io) return;
  
  io.emit('quota:exhausted', { 
    message: 'API quota exhausted - queue paused',
    resetTime: resetTime.toISOString(),
    timestamp: new Date().toISOString()
  });
  
  logger.warn('Emitted quota exhaustion warning', { resetTime });
}

/**
 * Emit quota restored notification to all clients
 */
export function emitQuotaRestored(): void {
  if (!io) return;
  
  io.emit('quota:restored', { 
    message: 'API quota restored - queue resumed',
    timestamp: new Date().toISOString()
  });
  
  logger.info('Emitted quota restored notification');
}

/**
 * Get the Socket.io server instance
 */
export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Close Socket.io server
 */
export function closeSocketIO(): void {
  if (io) {
    logger.info('Closing Socket.io server...');
    io.close();
    io = null;
    logger.info('Socket.io server closed');
  }
} 