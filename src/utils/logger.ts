import { LogLevel, LogEntry } from '../types';

export class Logger {
  private service: string;
  private logLevel: LogLevel;

  constructor(service: string, logLevel: LogLevel = 'info') {
    this.service = service;
    this.logLevel = logLevel;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: Error | Record<string, any>): void {
    let metadata: Record<string, any> = {};
    
    if (error instanceof Error) {
      metadata = {
        error: error.message,
        stack: error.stack,
        name: error.name
      };
    } else if (error && typeof error === 'object') {
      metadata = error;
    }

    this.log('error', message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      metadata
    };

    const formattedMessage = this.formatMessage(entry);
    
    // Output to appropriate stream
    if (level === 'error' || level === 'warn') {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // In production, you might want to send logs to a service like:
    // - File system
    // - Syslog
    // - External logging service (e.g., Winston, Pino)
    // - Centralized logging (e.g., ELK stack, Grafana Loki)
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(entry: LogEntry): string {
    const { timestamp, level, service, message, metadata } = entry;
    
    const levelUpper = level.toUpperCase().padEnd(5);
    const serviceFormatted = `[${service}]`.padEnd(20);
    
    let formatted = `${timestamp} ${levelUpper} ${serviceFormatted} ${message}`;
    
    if (metadata && Object.keys(metadata).length > 0) {
      formatted += ` ${JSON.stringify(metadata)}`;
    }

    return formatted;
  }

  // Static method to create logger with environment-based log level
  static create(service: string): Logger {
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    return new Logger(service, logLevel);
  }

  // Performance timing utilities
  time(label: string): () => void {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      this.info(`Timer [${label}] completed`, { duration: `${duration}ms` });
    };
  }

  // Context-aware logging for operations
  operation(operationName: string) {
    const operationId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();
    
    const operationLogger = {
      debug: (message: string, metadata?: Record<string, any>) => {
        this.debug(`[${operationName}:${operationId}] ${message}`, metadata);
      },
      info: (message: string, metadata?: Record<string, any>) => {
        this.info(`[${operationName}:${operationId}] ${message}`, metadata);
      },
      warn: (message: string, metadata?: Record<string, any>) => {
        this.warn(`[${operationName}:${operationId}] ${message}`, metadata);
      },
      error: (message: string, error?: Error | Record<string, any>) => {
        this.error(`[${operationName}:${operationId}] ${message}`, error);
      },
      complete: (message?: string) => {
        const duration = Date.now() - startTime;
        this.info(`[${operationName}:${operationId}] ${message || 'Operation completed'}`, {
          duration: `${duration}ms`,
          operationId
        });
      },
      fail: (message: string, error?: Error) => {
        const duration = Date.now() - startTime;
        this.error(`[${operationName}:${operationId}] ${message}`, {
          duration: `${duration}ms`,
          operationId,
          ...(error && { error: error.message, stack: error.stack })
        });
      }
    };

    operationLogger.info('Operation started');
    return operationLogger;
  }
} 