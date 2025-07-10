# 🚀 Gemini Coding Factory

**Enterprise-grade AI development infrastructure** that transforms GitHub comments into automated feature development. Comment `@gemini` on any GitHub repository to trigger intelligent code generation with **real-time monitoring**.

![Gemini Coding Factory Dashboard](https://img.shields.io/badge/Dashboard-Live%20Monitoring-blue) ![Queue System](https://img.shields.io/badge/Queue-BullMQ%20%2B%20Redis-red) ![Real-time](https://img.shields.io/badge/Real--time-Socket.io-green)

## ✨ **What You Get**

- 🤖 **AI-Powered Development**: Comment `@gemini` to trigger automated feature development
- 📊 **Real-time Dashboard**: Monitor jobs, view live logs, track queue health
- 🔄 **Reliable Queue System**: BullMQ + Redis for robust job processing
- 🛡️ **Quota Protection**: Automatic API quota management and recovery
- 📱 **Professional UI**: Modern dashboard with live log streaming
- 🏗️ **Multi-Repository**: Works with any project type (Next.js, React, Node.js, Python, Rust, etc.)

## 🎯 **Installation**

### **Automated Install (Recommended for Linux)**

This script automates the entire setup process, including dependency installation, Redis setup, and systemd service configuration for the backend.

```bash
# Clone the repository
git clone https://github.com/wjorgensen/Gemini-team.git
cd Gemini-team

# Make the script executable and run it
chmod +x deploy/install-arch.sh
./deploy/install-arch.sh
```

Follow the on-screen prompts. The script will ask for your Gemini API key and GitHub token, and create a `start-gemini-factory.sh` script to manage the services.

### **Starting the Service (after automated install)**

After the script completes, you can manage the service with the generated scripts or `systemctl`:
```bash
# Start all services (backend, dashboard, ngrok)
./start-gemini-factory.sh

# Stop all services
./stop-gemini-factory.sh

# Or control the backend service directly
sudo systemctl status gemini-coding-factory.service
sudo journalctl -u gemini-coding-factory.service -f
```

### **Manual Installation (for macOS, Windows, or non-systemd Linux)**

**1. Prerequisites**
- Node.js 18+
- Git
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free)
- A [GitHub token](https://github.com/settings/tokens) with repo access
- Redis server installed and running

**2. Clone & Install Dependencies**
```bash
# Clone the repository
git clone https://github.com/wjorgensen/Gemini-team.git
cd Gemini-team

# Install backend dependencies
npm install

# Install dashboard dependencies
cd dashboard && npm install && cd ..
```

**3. Configure Environment**
```bash
# Create environment file
cat > .env << EOF
# Required: Get from https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Required: Get from https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here

# Optional: Webhook security
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Optional: Authorized users (comma-separated)
AUTHORIZED_USERS=your_github_username
EOF

# Edit with your actual values
nano .env
```

**4. Build and Start Manually**
```bash
# Build the backend
npm run build

# Start the backend (in one terminal)
npm start

# Start the dashboard (in another terminal)
cd dashboard && npm run dev
```

### **Access Your System**
- 🖥️ **Backend API**: http://localhost:5000
- 📊 **Dashboard**: http://localhost:3000
- ✅ **Health Check**: http://localhost:5000/health

**That's it!** 🎉 Your Gemini Coding Factory is running.

---

## 🔗 **GitHub Integration**

### **Setup Webhooks**

1. **Go to your repository** → **Settings** → **Webhooks** → **Add webhook**

2. **Configure webhook**:
   - **Payload URL**: `http://your-server:5000/webhook` 
   - **Content type**: `application/json`
   - **Secret**: Use the `WEBHOOK_SECRET` from your `.env` file
   - **Events**: Select **"Issue comments"** only

3. **For local testing**, use [ngrok](https://ngrok.com):
   ```bash
   # Install and setup ngrok
   npm install -g ngrok
   ngrok http 5000
   
   # Use the generated URL: https://abc123.ngrok.io/webhook
   ```

### **Test It Out**

1. **Create a pull request** in any repository
2. **Comment**: `@gemini Add user authentication with login and signup`
3. **Watch the magic** in your dashboard at http://localhost:3000

---

## 📊 **Dashboard Features**

### **Real-time Monitoring**
- 🟢 **Live connection status** - See if your system is connected
- 📈 **Queue statistics** - Active, waiting, completed, and failed jobs
- 🃏 **Job overview cards** - Status, repository, user, and progress
- ⚡ **Instant updates** - Everything updates in real-time

### **Live Log Streaming**  
- 💻 **Terminal viewer** - Dark theme with syntax highlighting
- 🔴🟢 **Color-coded logs** - Green for stdout, red for stderr
- 📥 **Download logs** - Export complete job logs
- 🔄 **Auto-scroll** - Automatically follows latest output

### **Queue Health**
- 📊 **Success rates** - Visual progress bars and percentages
- ⏳ **Processing times** - Track job durations
- 🚦 **Quota monitoring** - Automatic pause/resume on API limits
- 📈 **Historical data** - Track performance over time

---

## 🛠️ **Development**

### **Start in Development Mode**
```bash
# Backend with hot reload
npm run dev

# Dashboard with hot reload (separate terminal)
cd dashboard && npm run dev
```

### **Project Structure**
```
gemini/
├── src/                     # Backend source
│   ├── services/           
│   │   ├── queue.ts        # BullMQ job queue
│   │   ├── worker.ts       # Job processing
│   │   ├── events.ts       # Socket.io events
│   │   └── webhook-server.ts # Express server
│   └── types/              # TypeScript types
├── dashboard/              # Next.js dashboard
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities & hooks
│   └── public/            # Static assets
└── deploy/                # Deployment scripts
```

### **Available Scripts**

**Backend**:
```bash
npm run dev          # Development with hot reload
npm run build        # Production build
npm start            # Start production server
npm run test         # Run tests
```

**Dashboard**:
```bash
npm run dev          # Development server (port 3000)
npm run build        # Production build  
npm start            # Start production server
npm run lint         # Lint code
```

---

## 🚀 **Production Deployment**

### **Docker Deployment**
```bash
# Build and run with Docker Compose
docker-compose up --build

# Or build individual services
docker build -t gemini-backend .
docker build -t gemini-dashboard ./dashboard
```

### **Traditional Server Deployment**
```bash
# Install PM2 for process management
npm install -g pm2

# Start backend with PM2
pm2 start npm --name "gemini-backend" -- start

# Start dashboard with PM2  
cd dashboard && pm2 start npm --name "gemini-dashboard" -- start

# Save PM2 configuration
pm2 save && pm2 startup
```

### **Environment Variables**
```bash
# Production environment
NODE_ENV=production
WEBHOOK_PORT=5000
REDIS_HOST=localhost
REDIS_PORT=6379

# Dashboard configuration  
NEXT_PUBLIC_WS_URL=http://your-server:5000
```

---

## 🔧 **Troubleshooting**

### **Common Issues**

**❌ Redis connection failed**
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Start Redis if not running
redis-server
```

**❌ Dashboard shows "Disconnected"**
```bash
# Check backend is running
curl http://localhost:5000/health

# Check Socket.io connection
curl http://localhost:5000/socket.io/
```

**❌ Jobs stuck in "Waiting"**
```bash
# Check worker is running
npm run build && node dist/services/worker.js

# Check Redis queue
redis-cli LLEN bull:gemini-jobs:waiting
```

**❌ Webhook not working**
```bash
# Test webhook endpoint
curl -X POST http://localhost:5000/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check logs
npm run build && npm start
```

### **Debug Mode**
```bash
# Enable debug logging
DEBUG=* npm start

# Check queue status
curl http://localhost:5000/status
```

### **Reset Everything**
```bash
# Clear Redis data
redis-cli FLUSHALL

# Restart services
npm run build && npm start
cd dashboard && npm run build && npm start
```

---

## 📖 **How It Works**

### **Architecture Overview**
```
GitHub Comment → Webhook → Express Server → BullMQ Queue → Worker → Gemini CLI
                                    ↓
                            Socket.io Events  
                                    ↓
                            Dashboard Updates (Real-time)
```

### **Job Processing Flow**

1. **Webhook Reception**: GitHub comment triggers webhook
2. **Job Creation**: System creates BullMQ job with metadata
3. **Queue Processing**: Worker picks up job from Redis queue  
4. **Repository Setup**: Clone/fetch repository and checkout PR branch
5. **Project Detection**: Automatically detect project type (Next.js, React, etc.)
6. **Prompt Building**: Create project-specific prompts
7. **Gemini Execution**: Run Gemini CLI with proper arguments
8. **Live Streaming**: Stream logs in real-time to dashboard
9. **Result Posting**: Post results back to GitHub PR

### **Quota Protection System**

- **Automatic Detection**: Monitors API responses for quota errors
- **Intelligent Pausing**: Pauses queue when quota exhausted  
- **Auto-Resume**: Automatically resumes when quota resets
- **Dashboard Alerts**: Real-time notifications of quota status

---

## 🎯 **Usage Examples**

### **Frontend Development**
```
@gemini Create a responsive user dashboard with:
- User profile management  
- Dark mode toggle
- Real-time notifications
- Mobile-first Tailwind CSS design
```

### **Backend APIs**
```
@gemini Implement user authentication API:
- JWT token handling
- Password hashing with bcrypt
- Input validation
- Comprehensive test coverage
```

### **UI Components**
```
@gemini Build a reusable component library:
- Button, Input, Modal components
- TypeScript interfaces
- Storybook documentation  
- Jest unit tests
```

### **Database Integration**
```
@gemini Add PostgreSQL integration:
- Database schema design
- Prisma ORM setup
- Migration scripts
- Connection pooling
```

---

## 🏆 **Enterprise Features**

- ✅ **Reliable Queue System**: BullMQ with Redis for job persistence
- ✅ **Real-time Monitoring**: Professional dashboard with live updates
- ✅ **Automatic Recovery**: Queue pauses and resumes on API limits
- ✅ **Memory Safety**: Bounded log streaming prevents crashes
- ✅ **Rate Limiting**: Express middleware prevents abuse
- ✅ **Error Handling**: Comprehensive error tracking and reporting
- ✅ **Scalable Architecture**: Horizontal scaling with Redis
- ✅ **Production Ready**: PM2 integration and Docker support

---

## 📞 **Support**

- 📚 **Documentation**: Check the `/dashboard` README for dashboard details
- 🐛 **Issues**: Report bugs on [GitHub Issues](https://github.com/wjorgensen/Gemini-team/issues)  
- 💬 **Discussions**: Join [GitHub Discussions](https://github.com/wjorgensen/Gemini-team/discussions)

---

**Ready to transform your development workflow?** 🚀

Get started in 5 minutes and watch your GitHub comments become production-ready features! 