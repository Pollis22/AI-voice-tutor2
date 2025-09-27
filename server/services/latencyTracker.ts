// Latency tracking service for performance monitoring
interface TimingMetric {
  sessionId: string;
  turnId: string;
  timestamp: number;
  asr_start?: number;
  asr_end?: number;
  llm_start?: number;
  llm_first_token?: number;
  tts_start?: number;
  tts_first_audio?: number;
  total_latency?: number;
  fallback_used?: boolean;
  error_code?: string;
  model_used?: string;
}

class LatencyTracker {
  private metrics: Map<string, TimingMetric[]> = new Map();
  private readonly MAX_METRICS_PER_SESSION = 50;
  
  startTurn(sessionId: string): string {
    const turnId = `${sessionId}-${Date.now()}`;
    const metric: TimingMetric = {
      sessionId,
      turnId,
      timestamp: Date.now(),
      asr_start: Date.now()
    };
    
    this.addMetric(sessionId, metric);
    return turnId;
  }
  
  updateMetric(sessionId: string, turnId: string, updates: Partial<TimingMetric>) {
    const sessionMetrics = this.metrics.get(sessionId) || [];
    const metric = sessionMetrics.find(m => m.turnId === turnId);
    
    if (metric) {
      Object.assign(metric, updates);
      
      // Calculate total latency if we have all the data
      if (metric.asr_end && metric.tts_first_audio) {
        metric.total_latency = metric.tts_first_audio - metric.asr_end;
      }
    }
  }
  
  private addMetric(sessionId: string, metric: TimingMetric) {
    if (!this.metrics.has(sessionId)) {
      this.metrics.set(sessionId, []);
    }
    
    const sessionMetrics = this.metrics.get(sessionId)!;
    sessionMetrics.push(metric);
    
    // Keep only the last N metrics (ring buffer)
    if (sessionMetrics.length > this.MAX_METRICS_PER_SESSION) {
      sessionMetrics.shift();
    }
  }
  
  getSessionMetrics(sessionId: string): TimingMetric[] {
    return this.metrics.get(sessionId) || [];
  }
  
  getStats(sessionId: string) {
    const metrics = this.getSessionMetrics(sessionId);
    if (metrics.length === 0) return null;
    
    const validLatencies = metrics
      .filter(m => m.total_latency !== undefined)
      .map(m => m.total_latency!);
    
    if (validLatencies.length === 0) return null;
    
    // Calculate statistics
    validLatencies.sort((a, b) => a - b);
    const median = validLatencies[Math.floor(validLatencies.length / 2)];
    const avg = validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length;
    const min = Math.min(...validLatencies);
    const max = Math.max(...validLatencies);
    
    // Count fallbacks and errors
    const fallbackCount = metrics.filter(m => m.fallback_used).length;
    const errorCount = metrics.filter(m => m.error_code).length;
    
    return {
      sessionId,
      turnCount: metrics.length,
      validTurns: validLatencies.length,
      latency: {
        median,
        average: Math.round(avg),
        min,
        max
      },
      fallbacks: fallbackCount,
      errors: errorCount,
      recentMetrics: metrics.slice(-10) // Last 10 turns
    };
  }
  
  clearSession(sessionId: string) {
    this.metrics.delete(sessionId);
  }
}

export const latencyTracker = new LatencyTracker();