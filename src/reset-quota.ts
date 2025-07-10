#!/usr/bin/env node

// Simple script to reset quota protection
import { GeminiOrchestrator } from './services/orchestrator';

console.log('🔧 Resetting quota protection...');

// Reset the quota protection
GeminiOrchestrator.resetQuotaProtection();

// Show current status
const status = GeminiOrchestrator.getQuotaStatus();
console.log('📊 Current status:', status);

console.log('✅ Quota protection has been reset!');
process.exit(0); 