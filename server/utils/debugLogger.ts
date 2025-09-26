// Debug logger with memory buffer for monitoring
interface TurnLog {
  timestamp: number;
  lessonId: string;
  subject: string;
  userInput: string;
  tutorResponse: string;
  usedFallback: boolean;
  retryCount: number;
  asrGated: boolean;
  durationMs: number;
  tokensUsed: number;
  speechDuration?: number;
  speechConfidence?: number;
  error?: string;
}

export class DebugLogger {
  private logs: TurnLog[] = [];
  private maxLogs = 50;
  private enabled: boolean = false;
  
  constructor() {
    this.enabled = process.env.DEBUG_TUTOR === '1';
  }
  
  logTurn(data: Omit<TurnLog, 'timestamp'>) {
    if (!this.enabled) return;
    
    const log: TurnLog = {
      ...data,
      timestamp: Date.now()
    };
    
    // Add to memory buffer
    this.logs.push(log);
    
    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console log in structured format
    console.log('[TUTOR_DEBUG]', JSON.stringify({
      ...log,
      time: new Date(log.timestamp).toISOString()
    }, null, 2));
  }
  
  getRecentLogs(count: number = 50): TurnLog[] {
    return this.logs.slice(-count);
  }
  
  clearLogs() {
    this.logs = [];
  }
  
  getSummary() {
    const totalTurns = this.logs.length;
    const fallbackCount = this.logs.filter(l => l.usedFallback).length;
    const gatedCount = this.logs.filter(l => l.asrGated).length;
    const errorCount = this.logs.filter(l => l.error).length;
    const avgDuration = this.logs.reduce((sum, l) => sum + l.durationMs, 0) / (totalTurns || 1);
    const avgTokens = this.logs.reduce((sum, l) => sum + l.tokensUsed, 0) / (totalTurns || 1);
    
    return {
      totalTurns,
      fallbackCount,
      gatedCount,
      errorCount,
      avgDurationMs: Math.round(avgDuration),
      avgTokensUsed: Math.round(avgTokens),
      oldestLog: this.logs[0]?.timestamp,
      newestLog: this.logs[this.logs.length - 1]?.timestamp
    };
  }
}

export const debugLogger = new DebugLogger();