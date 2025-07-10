'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Use environment variable or fallback to server IP
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://192.168.1.75:5000';

class SocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log('Connecting to socket server at:', SOCKET_URL);
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from socket server:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

const socketManager = new SocketManager();

// Job status from the server
export interface JobStatus {
  id: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  repository?: string;
  user?: string;
  timestamp: string;
}

// Queue statistics from the server
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  isPaused: boolean;
}

// Hook for real-time connection to the Gemini Coding Factory
export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats>({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    isPaused: false,
  });

  useEffect(() => {
    const newSocket = socketManager.connect();
    setSocket(newSocket);

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
      console.log('Job waiting:', data);
    });

    newSocket.on('job:active', (data: JobStatus) => {
      console.log('Job started:', data);
    });

    newSocket.on('job:completed', (data: JobStatus) => {
      console.log('Job completed:', data);
      // Could trigger a success notification here
    });

    newSocket.on('job:failed', (data: JobStatus) => {
      console.log('Job failed:', data);
      // Could trigger an error notification here
    });

    // Queue statistics updates
    newSocket.on('queue:stats', (stats: QueueStats) => {
      setQueueStats(stats);
    });

    // Quota management
    newSocket.on('quota:exhausted', (data: { resetTime: string }) => {
      console.warn('API quota exhausted, queue paused until:', data.resetTime);
      // Could trigger a warning notification here
    });

    newSocket.on('quota:restored', () => {
      console.log('API quota restored, queue resumed');
      // Could trigger a success notification here
    });

    return () => {
      socketManager.disconnect();
    };
  }, []);

  return {
    socket,
    connected,
    queueStats,
  };
}

// Hook for tailing specific job logs
export function useJobLogs(jobId: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<Array<{ type: 'stdout' | 'stderr'; line: string; timestamp: string }>>([]);

  useEffect(() => {
    if (!jobId) return;

    const newSocket = socketManager.connect();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      // Join the job-specific room for log streaming
      newSocket.emit('tail', jobId);
    });

    newSocket.on('job:stdout', (data: { jobId: string; line: string; timestamp: string }) => {
      if (data.jobId === jobId) {
        setLogs(prev => [...prev, { type: 'stdout', line: data.line, timestamp: data.timestamp }]);
      }
    });

    newSocket.on('job:stderr', (data: { jobId: string; line: string; timestamp: string }) => {
      if (data.jobId === jobId) {
        setLogs(prev => [...prev, { type: 'stderr', line: data.line, timestamp: data.timestamp }]);
      }
    });

    return () => {
      socketManager.disconnect();
    };
  }, [jobId]);

  return {
    socket,
    logs,
    clearLogs: () => setLogs([]),
  };
} 