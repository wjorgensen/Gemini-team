'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Job status from the server
export interface JobStatus {
  jobId: string;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'stalled';
  result?: {
    success: boolean;
    output: string;
    projectType: string;
    timestamp: string;
    commits: string[];
    duration: number;
  };
  error?: string;
  timestamp: string;
  metadata?: {
    repository?: string;
    user?: string;
    featureSpec?: string;
    projectType?: string;
  };
}

// Queue statistics
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  isPaused: boolean;
}

// Log line for real-time streaming
export interface LogLine {
  jobId: string;
  line: string;
  timestamp: string;
}

// Quota status
export interface QuotaStatus {
  message: string;
  resetTime?: string;
  timestamp: string;
}

export function useJobs() {
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
  const [queueStats, setQueueStats] = useState<QueueStats>({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    isPaused: false,
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';
    const newSocket = io(socketUrl);

    newSocket.on('connect', () => {
      console.log('Connected to Gemini Coding Factory');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    // Job status updates
    newSocket.on('job:waiting', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    newSocket.on('job:active', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    newSocket.on('job:completed', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    newSocket.on('job:failed', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    newSocket.on('job:stalled', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    newSocket.on('job:started', (data: JobStatus) => {
      setJobs(prev => ({ ...prev, [data.jobId]: data }));
    });

    // Queue statistics
    newSocket.on('queue:stats', (stats: QueueStats) => {
      setQueueStats(stats);
    });

    // Quota status
    newSocket.on('quota:exhausted', (data: QuotaStatus) => {
      console.warn('Quota exhausted:', data);
      // Could trigger a toast notification here
    });

    newSocket.on('quota:restored', (data: QuotaStatus) => {
      console.info('Quota restored:', data);
      // Could trigger a success notification here
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Function to tail a specific job's logs
  const tailJob = (jobId: string) => {
    if (socket) {
      socket.emit('tail', jobId);
    }
  };

  return {
    jobs: Object.values(jobs).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ),
    queueStats,
    connected,
    tailJob,
    socket,
  };
}

// Hook for streaming job logs
export function useJobLogs(jobId: string) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';
    const newSocket = io(socketUrl);

    newSocket.on('connect', () => {
      // Join the job room for real-time logs
      newSocket.emit('tail', jobId);
    });

    // Listen for stdout/stderr from this specific job
    newSocket.on('job:stdout', (data: LogLine) => {
      if (data.jobId === jobId) {
        setLogs(prev => [...prev, { ...data, line: `[OUT] ${data.line}` }]);
      }
    });

    newSocket.on('job:stderr', (data: LogLine) => {
      if (data.jobId === jobId) {
        setLogs(prev => [...prev, { ...data, line: `[ERR] ${data.line}` }]);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [jobId]);

  return { logs, socket };
} 