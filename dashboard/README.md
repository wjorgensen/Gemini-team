# 🚀 Gemini Coding Factory Dashboard

Real-time monitoring dashboard for the Gemini Coding Factory job queue system.

## ✨ Features

- **Real-time Job Monitoring**: Live updates via Socket.io
- **Queue Statistics**: Active, waiting, completed, and failed job counts
- **Live Log Streaming**: View job output in real-time
- **Job Details**: Repository info, user, project type, and feature specs
- **Responsive Design**: Works on desktop and mobile
- **Download Logs**: Export job logs as text files

## 🏗️ Architecture

```
Dashboard (Next.js) ←── Socket.io ←── Backend Server
     ↓                                      ↓
  React Hooks                          BullMQ Queue
  (useJobs, useJobLogs)                     ↓
     ↓                                 Redis + Workers
  Components                               ↓
  (JobCard, LogStream, QueueStats)    Gemini CLI
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Running Gemini Coding Factory backend
- Redis server (for the backend)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure connection** (optional)
   ```bash
   # Create .env.local if backend is not on localhost:3000
   echo "NEXT_PUBLIC_WS_URL=http://your-backend:3000" > .env.local
   ```

3. **Start the dashboard**
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

4. **Open dashboard**
   - Navigate to http://localhost:3001
   - Dashboard will show connection status in top-right

## 📱 Dashboard Features

### Main Dashboard (`/`)
- **Queue Overview**: Real-time statistics and health indicators
- **Recent Jobs**: Grid of job cards with status, metadata, and quick actions
- **Connection Status**: Live indicator showing Socket.io connection health

### Job Details (`/job/[id]`)
- **Job Metadata**: Repository, user, project type, timestamps
- **Live Logs**: Real-time stdout/stderr streaming with color coding
- **Log Export**: Download full job logs as text file
- **Auto-scroll**: Automatically scrolls to latest log entries

## 🎨 Components

### JobCard
- Status indicators with emojis and color coding
- Repository and user information
- Feature specification preview
- Error messages and success summaries
- "View Live Logs" navigation

### LogStream
- Terminal-style log viewer with dark theme
- Real-time streaming via Socket.io
- Timestamp prefixes for each log line
- Color-coded stdout (green) and stderr (red)
- Download functionality

### QueueStats
- Overall queue status and connection health
- Active job count with progress indicators
- Success rate calculation and visualization
- Detailed breakdown by job status
- Pause indicators for quota protection

## 🔧 Configuration

### Environment Variables

```bash
# Required: Backend Socket.io URL
NEXT_PUBLIC_WS_URL=http://localhost:3000

# Optional: Dashboard title
NEXT_PUBLIC_DASHBOARD_TITLE="Gemini Coding Factory"
```

### Real-time Events

The dashboard listens for these Socket.io events:

- `job:waiting` - Job added to queue
- `job:active` - Job started processing  
- `job:completed` - Job finished successfully
- `job:failed` - Job failed with error
- `job:stalled` - Job needs intervention
- `job:stdout` - Live stdout line
- `job:stderr` - Live stderr line
- `queue:stats` - Queue statistics update
- `quota:exhausted` - API quota warnings
- `quota:restored` - API quota restored

## 🎯 Usage Scenarios

### Monitoring Active Jobs
1. Open dashboard to see queue overview
2. Watch jobs move from "Waiting" → "Running" → "Completed"
3. Click any job card to view live logs

### Debugging Failed Jobs  
1. Look for red error badges in job grid
2. Click failed job to see error details
3. View live logs to see where job failed
4. Download logs for detailed analysis

### Quota Management
1. Watch for orange "PAUSED" status indicators
2. Queue automatically pauses on quota exhaustion
3. Dashboard shows quota warnings in real-time
4. Jobs resume when quota resets

## 🔗 Integration

### With Backend
```typescript
// Backend emits events that dashboard consumes
io.emit('job:started', { jobId, metadata });
io.emit('job:stdout', { jobId, line });
io.emit('queue:stats', { waiting, active, completed, failed });
```

### With Webhooks
1. GitHub webhook triggers backend
2. Backend creates BullMQ job
3. Worker processes job with Gemini CLI
4. Dashboard shows real-time progress
5. Logs stream to dashboard as job runs

## 🎨 Styling

- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Component library
- **Lucide React**: Icon system
- **Dark terminal theme**: For log viewing
- **Responsive grid layouts**: Works on all screen sizes

## 📊 Performance

- **Socket.io**: Efficient real-time updates
- **React optimizations**: Memoized components and hooks
- **Build optimization**: Next.js production build
- **Memory management**: Bounded log history (1000 lines)

## 🚀 Next Steps

This dashboard provides complete visibility into your Gemini Coding Factory operations. You can now:

- ✅ Monitor all job processing in real-time
- ✅ Debug issues immediately with live logs  
- ✅ Track success rates and queue health
- ✅ Manage quota usage proactively
- ✅ Download logs for external analysis

Perfect for production monitoring, debugging, and ensuring your AI coding factory runs smoothly! 🎯
