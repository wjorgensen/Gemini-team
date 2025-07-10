'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatus } from "@/lib/socket";
import { Clock, User, GitBranch, Folder, Eye } from "lucide-react";
import Link from "next/link";

interface JobCardProps {
  job: JobStatus;
}

export function JobCard({ job }: JobCardProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'running':
        return 'info';
      case 'waiting':
        return 'warning';
      case 'stalled':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'running':
        return '🚀';
      case 'waiting':
        return '⏳';
      case 'stalled':
        return '⚠️';
      default:
        return '📋';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="text-xl">{getStatusIcon(job.status)}</span>
            <span className="truncate">{job.jobId}</span>
          </CardTitle>
          <Badge variant={getStatusVariant(job.status)}>
            {job.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Repository Info */}
        {job.metadata?.repository && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span className="truncate">{job.metadata.repository}</span>
          </div>
        )}

        {/* User Info */}
        {job.metadata?.user && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{job.metadata.user}</span>
          </div>
        )}

        {/* Project Type */}
        {job.metadata?.projectType && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Folder className="h-4 w-4" />
            <span>{job.metadata.projectType}</span>
          </div>
        )}

        {/* Feature Specification */}
        {job.metadata?.featureSpec && (
          <div className="text-sm bg-muted p-2 rounded">
            <p className="line-clamp-3">{job.metadata.featureSpec}</p>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTime(job.timestamp)}</span>
        </div>

        {/* Error Message */}
        {job.error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded border-l-4 border-red-500">
            <p className="line-clamp-2">{job.error}</p>
          </div>
        )}

        {/* Success Result Summary */}
        {job.status === 'completed' && job.result && (
          <div className="text-sm text-green-600 bg-green-50 p-2 rounded border-l-4 border-green-500">
            <p>✅ Job completed successfully</p>
            {job.result.duration && (
              <p className="text-xs">Duration: {Math.round(job.result.duration / 1000)}s</p>
            )}
          </div>
        )}

        {/* View Logs Button */}
        <div className="pt-2">
          <Link 
            href={`/job/${job.jobId}`}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <Eye className="h-4 w-4" />
            View Live Logs
          </Link>
        </div>
      </CardContent>
    </Card>
  );
} 