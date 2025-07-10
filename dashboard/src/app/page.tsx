'use client';

import { useSocket } from '@/lib/socket';
import { QueueStats } from '@/components/QueueStats';
import { Activity, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { connected, queueStats } = useSocket();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Gemini Coding Factory
                </h1>
                <p className="text-sm text-gray-500">
                  Real-time job monitoring dashboard
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="flex items-center gap-2 text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Live</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Reconnecting...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Queue Statistics */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Queue Overview
          </h2>
          <QueueStats stats={queueStats} connected={connected} />
        </div>

        {/* Welcome Message */}
        <div className="text-center py-12">
          <Activity className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Gemini Coding Factory Dashboard
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Monitor your queue status above. Jobs will be processed when GitHub webhooks trigger Gemini processing.
            Make sure your webhook server is running and configured.
          </p>
          <div className="mt-6 space-y-2 text-sm text-gray-600">
            <p><strong>Backend API:</strong> http://192.168.1.75:5000</p>
            <p><strong>Webhook URL:</strong> http://your-ngrok-url.ngrok-free.app/webhook</p>
            <p><strong>Health Check:</strong> http://192.168.1.75:5000/health</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-sm text-gray-500">
            <p>
              Gemini Coding Factory Dashboard - 
              <span className="ml-1">
                Built with Next.js, Socket.io, and BullMQ
              </span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
