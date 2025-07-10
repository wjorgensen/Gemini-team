'use client';

import React, { use } from 'react';
import { LogStream } from '@/components/LogStream';
import { useJobs } from '@/lib/socket';
import { ArrowLeft, Activity, Clock, User, GitBranch, Folder } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JobPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function JobPage({ params }: JobPageProps) {
  const { jobs } = useJobs();
  const { id: jobId } = use(params);
  const job = jobs.find(j => j.jobId === jobId);

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
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </Link>
              
              <div className="w-px h-6 bg-gray-300"></div>
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Job Details
                  </h1>
                                     <p className="text-sm text-gray-500">
                     {jobId}
                   </p>
                </div>
              </div>
            </div>

            {job && (
              <Badge variant={getStatusVariant(job.status)}>
                <span className="mr-1">{getStatusIcon(job.status)}</span>
                {job.status.toUpperCase()}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Job Metadata */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {job ? (
                  <>
                    {/* Repository */}
                    {job.metadata?.repository && (
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium">Repository</p>
                          <p className="text-sm text-gray-600 break-all">
                            {job.metadata.repository}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* User */}
                    {job.metadata?.user && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium">Triggered by</p>
                          <p className="text-sm text-gray-600">
                            {job.metadata.user}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Project Type */}
                    {job.metadata?.projectType && (
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium">Project Type</p>
                          <p className="text-sm text-gray-600">
                            {job.metadata.projectType}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium">Started</p>
                        <p className="text-sm text-gray-600">
                          {formatTime(job.timestamp)}
                        </p>
                      </div>
                    </div>

                    {/* Feature Specification */}
                    {job.metadata?.featureSpec && (
                      <div>
                        <p className="text-sm font-medium mb-2">Feature Request</p>
                        <div className="text-sm bg-gray-50 p-3 rounded border">
                          {job.metadata.featureSpec}
                        </div>
                      </div>
                    )}

                    {/* Error Details */}
                    {job.error && (
                      <div>
                        <p className="text-sm font-medium mb-2 text-red-600">Error</p>
                        <div className="text-sm bg-red-50 p-3 rounded border border-red-200 text-red-700">
                          {job.error}
                        </div>
                      </div>
                    )}

                    {/* Success Details */}
                    {job.status === 'completed' && job.result && (
                      <div>
                        <p className="text-sm font-medium mb-2 text-green-600">Result</p>
                        <div className="text-sm bg-green-50 p-3 rounded border border-green-200 text-green-700">
                          ✅ Job completed successfully
                          {job.result.duration && (
                            <p className="mt-1">
                              Duration: {Math.round(job.result.duration / 1000)}s
                            </p>
                          )}
                          {job.result.commits && job.result.commits.length > 0 && (
                            <p className="mt-1">
                              Commits: {job.result.commits.length}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">
                      Job not found or still loading...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

                     {/* Live Logs */}
           <div className="lg:col-span-2">
             <div className="h-[600px] lg:h-[700px]">
               {jobId && <LogStream jobId={jobId} />}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
} 