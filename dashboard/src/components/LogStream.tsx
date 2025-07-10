'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useJobLogs } from '@/lib/socket';
import { Terminal, Download } from 'lucide-react';

interface LogStreamProps {
  jobId: string;
}

export function LogStream({ jobId }: LogStreamProps) {
  const { logs } = useJobLogs(jobId);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLineColor = (line: string) => {
    if (line.startsWith('[ERR]')) {
      return 'text-red-400';
    }
    if (line.startsWith('[OUT]')) {
      return 'text-green-300';
    }
    return 'text-gray-300';
  };

  const downloadLogs = () => {
    const logText = logs
      .map(log => `[${formatTimestamp(log.timestamp)}] ${log.line}`)
      .join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-job-${jobId}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Live Logs - {jobId}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {logs.length} lines
            </span>
            <button
              onClick={downloadLogs}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
              disabled={logs.length === 0}
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="h-full bg-gray-900 text-gray-100 font-mono text-sm overflow-y-auto">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Waiting for logs...</p>
                <p className="text-xs mt-2">Job logs will appear here in real-time</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <span className="text-gray-500 text-xs shrink-0 mt-0.5 w-20">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={`${getLineColor(log.line)} break-all`}>
                    {log.line}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 