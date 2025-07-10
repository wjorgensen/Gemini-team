'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatus } from "@/lib/socket";
import { Clock, User, GitBranch, Eye } from "lucide-react";
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
            <span className="truncate">{job.id}</span>
          </CardTitle>
          <Badge variant={getStatusVariant(job.status)}>
            {job.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Repository Info */}
        {job.repository && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span className="truncate">{job.repository}</span>
          </div>
        )}

        {/* User Info */}
        {job.user && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{job.user}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTime(job.timestamp)}</span>
        </div>

        {/* View Logs Button */}
        <div className="pt-2">
          <Link 
            href={`/job/${job.id}`}
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