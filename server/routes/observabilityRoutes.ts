import express from 'express';
import { openaiCircuitBreaker } from '../services/circuitBreaker';
import { userQueueManager } from '../services/userQueueManager';
import { semanticCache } from '../services/semanticCache';
import { inputGatingService } from '../services/inputGating';
import { debugLogger } from '../utils/debugLogger';

const router = express.Router();

// Debug/observability routes (auth-gated)
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user || (req.user as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get comprehensive system metrics
router.get('/metrics', requireAuth, (req, res) => {
  try {
    const queueMetrics = userQueueManager.getGlobalMetrics();
    const cacheMetrics = semanticCache.getMetrics();
    const circuitMetrics = openaiCircuitBreaker.getMetrics();
    const gatingMetrics = inputGatingService.getMetrics();
    
    const systemMetrics = {
      timestamp: new Date().toISOString(),
      
      // Queue system
      queues: {
        activeSessions: queueMetrics.activeSessions,
        totalOperations: queueMetrics.totalOperations,
        totalCancellations: queueMetrics.totalCancellations,
        totalErrors: queueMetrics.totalErrors,
        totalQueueDepth: queueMetrics.totalQueueDepth,
        maxQueueDepth: queueMetrics.maxQueueDepth,
        avgQueueDepth: Math.round(queueMetrics.avgQueueDepth * 100) / 100
      },
      
      // Semantic cache
      cache: {
        enabled: true,
        size: cacheMetrics.totalEntries,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        hitRate: Math.round(cacheMetrics.hitRate * 100) / 100,
        memoryUsageKB: Math.round(cacheMetrics.memoryUsage * 100) / 100
      },
      
      // Circuit breaker
      circuitBreaker: {
        state: circuitMetrics.state,
        requests: circuitMetrics.requests,
        failures: circuitMetrics.failures,
        successes: circuitMetrics.successes,
        timeouts: circuitMetrics.timeouts,
        rejectedRequests: circuitMetrics.rejectedRequests,
        failureRate: circuitMetrics.requests > 0 
          ? Math.round((circuitMetrics.failures / circuitMetrics.requests) * 10000) / 100 
          : 0,
        lastFailureTime: circuitMetrics.lastFailureTime 
          ? new Date(circuitMetrics.lastFailureTime).toISOString() 
          : null
      },
      
      // Input gating
      inputGating: {
        totalInputs: gatingMetrics.totalInputs,
        gatedInputs: gatingMetrics.gatedInputs,
        validInputs: gatingMetrics.validInputs,
        gatingRate: Math.round(gatingMetrics.gatingRate * 100) / 100,
        reasonCounts: gatingMetrics.reasonCounts
      },
      
      // System status
      system: {
        useRealtime: process.env.USE_REALTIME === 'true',
        debugMode: process.env.DEBUG_TUTOR === '1',
        environment: process.env.NODE_ENV || 'development',
        maxConcurrentUsers: parseInt(process.env.MAX_CONCURRENT_USERS || '1000'),
        cacheEnabled: true,
        uptime: process.uptime()
      }
    };
    
    res.json(systemMetrics);
  } catch (error) {
    console.error('[Observability] Error getting metrics:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// Production-ready system health endpoint
router.get('/health', (req, res) => {
  try {
    const queueMetrics = userQueueManager.getGlobalMetrics();
    const cacheMetrics = semanticCache.getMetrics();
    const circuitMetrics = openaiCircuitBreaker.getMetrics();
    const gatingMetrics = inputGatingService.getMetrics();
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryMetrics = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsedPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    // OpenAI service health
    const openaiServiceHealth = {
      healthy: circuitMetrics.state !== 'OPEN',
      circuitState: circuitMetrics.state,
      failureRate: circuitMetrics.requests > 0 
        ? Math.round((circuitMetrics.failures / circuitMetrics.requests) * 100) 
        : 0,
      recentFailures: circuitMetrics.failures,
      lastFailure: circuitMetrics.lastFailureTime 
        ? new Date(circuitMetrics.lastFailureTime).toISOString() 
        : null
    };
    
    // Determine overall health
    const isHealthy = openaiServiceHealth.healthy && 
                     memoryMetrics.heapUsedPercent < 90 &&
                     queueMetrics.totalErrors < 100; // Reasonable error threshold
    
    const status = isHealthy ? 'healthy' : 'degraded';
    const httpStatus = isHealthy ? 200 : 503;
    
    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      system: {
        memory: memoryMetrics,
        openaiService: openaiServiceHealth,
        circuitBreaker: {
          state: circuitMetrics.state,
          requests: circuitMetrics.requests,
          failures: circuitMetrics.failures,
          rejectedRequests: circuitMetrics.rejectedRequests
        },
        queues: {
          activeSessions: queueMetrics.activeSessions,
          totalOperations: queueMetrics.totalOperations,
          totalErrors: queueMetrics.totalErrors,
          avgQueueDepth: Math.round(queueMetrics.avgQueueDepth * 100) / 100
        },
        cache: {
          size: cacheMetrics.totalEntries,
          hitRate: Math.round(cacheMetrics.hitRate * 100) / 100,
          memoryUsageKB: Math.round(cacheMetrics.memoryUsage)
        }
      },
      flags: {
        useRealtime: process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1',
        voiceTestMode: process.env.VOICE_TEST_MODE !== '0',
        cacheTtlMin: parseInt(process.env.CACHE_TTL_MIN || '1440'),
        asrMinMs: parseInt(process.env.ASR_MIN_MS || '350'),
        asrMinConfidence: parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.5')
      }
    });
  } catch (error) {
    console.error('[Observability] Health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get last N conversation turns for debugging
router.get('/last-turns', requireAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const turns = debugLogger.getRecentTurns(limit);
    
    res.json({
      turns,
      count: turns.length,
      query: { limit }
    });
  } catch (error) {
    console.error('[Observability] Error getting last turns:', error);
    res.status(500).json({ error: 'Failed to retrieve conversation turns' });
  }
});

// Get specific session details
router.get('/session/:sessionId', requireAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get queue metrics for this session
    const queue = userQueueManager.getQueue(sessionId);
    const queueMetrics = queue.getMetrics();
    
    // Get conversation turns for this session
    const turns = debugLogger.getRecentTurns(100).filter((turn: any) => 
      turn.sessionId === sessionId || turn.userId === sessionId
    );
    
    res.json({
      sessionId,
      queue: {
        depth: queue.getQueueDepth(),
        metrics: queueMetrics
      },
      conversationTurns: turns,
      turnCount: turns.length
    });
  } catch (error) {
    console.error('[Observability] Error getting session details:', error);
    res.status(500).json({ error: 'Failed to retrieve session details' });
  }
});

// Reset specific metrics (for testing)
router.post('/reset', requireAuth, (req, res) => {
  try {
    const { component } = req.body;
    
    switch (component) {
      case 'circuit':
        openaiCircuitBreaker.reset();
        break;
      case 'cache':
        semanticCache.clear();
        break;
      case 'gating':
        inputGatingService.resetMetrics();
        break;
      case 'queues':
        userQueueManager.cleanup();
        break;
      case 'all':
        openaiCircuitBreaker.reset();
        semanticCache.clear();
        inputGatingService.resetMetrics();
        userQueueManager.cleanup();
        break;
      default:
        return res.status(400).json({ error: 'Invalid component. Use: circuit, cache, gating, queues, or all' });
    }
    
    res.json({ 
      success: true, 
      message: `Reset ${component} metrics`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Observability] Error resetting metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        circuitBreaker: openaiCircuitBreaker.getState(),
        cache: semanticCache.getStatus(),
        queues: {
          active: userQueueManager.getGlobalMetrics().activeSessions,
          healthy: true
        },
        inputGating: {
          healthy: true,
          totalProcessed: inputGatingService.getMetrics().totalInputs
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        useRealtime: process.env.USE_REALTIME === 'true',
        debugMode: process.env.DEBUG_TUTOR === '1'
      }
    };
    
    // Determine overall health
    const circuitOpen = openaiCircuitBreaker.isOpen();
    const highFailureRate = openaiCircuitBreaker.getMetrics().requests > 10 && 
      (openaiCircuitBreaker.getMetrics().failures / openaiCircuitBreaker.getMetrics().requests) > 0.5;
    
    if (circuitOpen || highFailureRate) {
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[Observability] Error in health check:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Performance monitoring endpoint
router.get('/performance', requireAuth, (req, res) => {
  try {
    const queueMetrics = userQueueManager.getGlobalMetrics();
    const cacheMetrics = semanticCache.getMetrics();
    const recentTurns = debugLogger.getRecentTurns(50);
    
    // Calculate performance stats
    const latencies = recentTurns
      .filter((turn: any) => turn.durationMs && turn.durationMs > 0)
      .map((turn: any) => turn.durationMs!);
    
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((sum: number, lat: number) => sum + lat, 0) / latencies.length 
      : 0;
    
    const p95Latency = latencies.length > 0 
      ? latencies.sort((a: number, b: number) => a - b)[Math.floor(latencies.length * 0.95)] 
      : 0;
    
    const performance = {
      timestamp: new Date().toISOString(),
      latency: {
        avgMs: Math.round(avgLatency),
        p95Ms: Math.round(p95Latency),
        sampleSize: latencies.length
      },
      throughput: {
        activeSessions: queueMetrics.activeSessions,
        totalOperations: queueMetrics.totalOperations,
        operationsPerMinute: Math.round(queueMetrics.totalOperations / (process.uptime() / 60))
      },
      efficiency: {
        cacheHitRate: Math.round(cacheMetrics.hitRate * 100) / 100,
        fallbackRate: recentTurns.length > 0 
          ? Math.round((recentTurns.filter((t: any) => t.usedFallback).length / recentTurns.length) * 10000) / 100
          : 0,
        gatingRate: inputGatingService.getMetrics().gatingRate
      },
      resources: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        cacheMemoryKB: Math.round(cacheMetrics.memoryUsage * 100) / 100
      }
    };
    
    res.json(performance);
  } catch (error) {
    console.error('[Observability] Error getting performance metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve performance metrics' });
  }
});

export default router;