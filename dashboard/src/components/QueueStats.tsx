'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueueStats as QueueStatsType } from "@/lib/socket";
import { Activity, Clock, CheckCircle, XCircle, Pause } from "lucide-react";

interface QueueStatsProps {
  stats: QueueStatsType;
  connected: boolean;
}

export function QueueStats({ stats, connected }: QueueStatsProps) {
  const total = stats.waiting + stats.active + stats.completed + stats.failed;

  const getConnectionStatus = () => {
    if (!connected) {
      return { color: 'destructive', text: 'DISCONNECTED', icon: '🔴' };
    }
    if (stats.isPaused) {
      return { color: 'warning', text: 'PAUSED', icon: '⏸️' };
    }
    return { color: 'success', text: 'ACTIVE', icon: '🟢' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Overall Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{connectionStatus.icon}</span>
            <div>
                             <Badge variant={connectionStatus.color as 'destructive' | 'warning' | 'success'}>
                {connectionStatus.text}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {connected ? 'Real-time connection active' : 'Connection lost'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Metrics */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
          <p className="text-xs text-muted-foreground">
            {stats.waiting} waiting in queue
          </p>
          {stats.waiting > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Queue progress</span>
                <span>{stats.active}/{stats.active + stats.waiting}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                  style={{ 
                    width: `${stats.active + stats.waiting > 0 ? (stats.active / (stats.active + stats.waiting)) * 100 : 0}%` 
                  }}
                ></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Success Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {total > 0 ? Math.round((stats.completed / total) * 100) : 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.completed} completed, {stats.failed} failed
          </p>
          {total > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-green-600">Success</span>
                <span className="text-red-600">Failed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="flex h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-green-500 transition-all duration-300" 
                    style={{ width: `${(stats.completed / total) * 100}%` }}
                  ></div>
                  <div 
                    className="bg-red-500 transition-all duration-300" 
                    style={{ width: `${(stats.failed / total) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Stats */}
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-lg">Queue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <Clock className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
              <div className="text-2xl font-bold text-yellow-700">{stats.waiting}</div>
              <div className="text-sm text-yellow-600">Waiting</div>
            </div>
            
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Activity className="h-6 w-6 mx-auto mb-2 text-blue-600" />
              <div className="text-2xl font-bold text-blue-700">{stats.active}</div>
              <div className="text-sm text-blue-600">Running</div>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
              <div className="text-sm text-green-600">Completed</div>
            </div>
            
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <XCircle className="h-6 w-6 mx-auto mb-2 text-red-600" />
              <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
          </div>

          {stats.isPaused && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 text-orange-700">
                <Pause className="h-5 w-5" />
                <span className="font-semibold">Queue Paused</span>
              </div>
              <p className="text-sm text-orange-600 mt-1">
                The queue has been paused, likely due to API quota exhaustion. 
                It will resume automatically when the quota resets.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 