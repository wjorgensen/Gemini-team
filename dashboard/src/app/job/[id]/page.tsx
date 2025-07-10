'use client';

import React, { use } from 'react';
import { LogStream } from '@/components/LogStream';
import { ArrowLeft, Activity } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface JobPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function JobPage({ params }: JobPageProps) {
  const { id: jobId } = use(params);

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
                    Job Logs
                  </h1>
                  <p className="text-sm text-gray-500">
                    {jobId}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Job Info */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Job ID</p>
                  <p className="text-sm text-gray-600 break-all font-mono">
                    {jobId}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-sm text-gray-600">
                    Check logs for current status
                  </p>
                </div>
                <div className="text-xs text-gray-500 border-t pt-4">
                  Live logs will stream automatically as the job processes.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Logs */}
          <div className="lg:col-span-3">
            <div className="h-[600px] lg:h-[700px]">
              <LogStream jobId={jobId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 