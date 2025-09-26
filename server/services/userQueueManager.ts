import { EventEmitter } from 'events';

interface QueueItem {
  id: string;
  sessionId: string;
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  aborted?: boolean;
}

interface QueueMetrics {
  processed: number;
  cancelled: number;
  errors: number;
  avgProcessingTime: number;
  currentQueueDepth: number;
}

export class UserQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private processing = false;
  private metrics: QueueMetrics = {
    processed: 0,
    cancelled: 0,
    errors: 0,
    avgProcessingTime: 0,
    currentQueueDepth: 0
  };

  constructor(private sessionId: string) {
    super();
  }

  async enqueue<T>(operation: () => Promise<T>, enableBargein = true): Promise<T> {
    return new Promise((resolve, reject) => {
      // If barge-in enabled, cancel previous pending operations
      if (enableBargein && this.queue.length > 0) {
        this.cancelPendingOperations();
      }

      const item: QueueItem = {
        id: `${this.sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: this.sessionId,
        operation,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(item);
      this.metrics.currentQueueDepth = this.queue.length;
      
      console.log(`[UserQueue:${this.sessionId}] Enqueued operation ${item.id}, queue depth: ${this.queue.length}`);
      this.emit('enqueue', { sessionId: this.sessionId, queueDepth: this.queue.length });

      this.processNext();
    });
  }

  cancelPendingOperations(): void {
    const pendingItems = this.queue.filter(item => !item.aborted);
    
    for (const item of pendingItems) {
      item.aborted = true;
      item.reject(new Error('Operation cancelled due to barge-in'));
      this.metrics.cancelled++;
    }
    
    this.queue = this.queue.filter(item => !item.aborted);
    
    if (pendingItems.length > 0) {
      console.log(`[UserQueue:${this.sessionId}] Cancelled ${pendingItems.length} pending operations`);
      this.emit('bargein', { sessionId: this.sessionId, cancelledCount: pendingItems.length });
    }
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const item = this.queue.shift();
    
    if (!item || item.aborted) {
      this.processing = false;
      this.metrics.currentQueueDepth = this.queue.length;
      this.processNext(); // Process next item
      return;
    }

    const startTime = Date.now();
    
    try {
      console.log(`[UserQueue:${this.sessionId}] Processing operation ${item.id}`);
      const result = await item.operation();
      
      if (!item.aborted) {
        item.resolve(result);
        this.metrics.processed++;
        
        const processingTime = Date.now() - startTime;
        this.updateAvgProcessingTime(processingTime);
        
        this.emit('processed', { 
          sessionId: this.sessionId, 
          operationId: item.id,
          processingTime 
        });
      }
    } catch (error) {
      if (!item.aborted) {
        item.reject(error);
        this.metrics.errors++;
        
        this.emit('error', { 
          sessionId: this.sessionId, 
          operationId: item.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } finally {
      this.processing = false;
      this.metrics.currentQueueDepth = this.queue.length;
      
      // Process next item if any
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  private updateAvgProcessingTime(newTime: number): void {
    const totalProcessed = this.metrics.processed;
    if (totalProcessed === 1) {
      this.metrics.avgProcessingTime = newTime;
    } else {
      this.metrics.avgProcessingTime = 
        (this.metrics.avgProcessingTime * (totalProcessed - 1) + newTime) / totalProcessed;
    }
  }

  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  clear(): void {
    this.cancelPendingOperations();
    this.queue = [];
    this.metrics.currentQueueDepth = 0;
    console.log(`[UserQueue:${this.sessionId}] Queue cleared`);
  }
}

// Global queue manager for all user sessions
class UserQueueManager {
  private queues = new Map<string, UserQueue>();
  private globalMetrics = {
    totalSessions: 0,
    totalOperations: 0,
    totalCancellations: 0,
    totalErrors: 0
  };

  getQueue(sessionId: string): UserQueue {
    if (!this.queues.has(sessionId)) {
      const queue = new UserQueue(sessionId);
      
      // Track metrics
      queue.on('enqueue', () => this.globalMetrics.totalOperations++);
      queue.on('bargein', (data) => this.globalMetrics.totalCancellations += data.cancelledCount);
      queue.on('error', () => this.globalMetrics.totalErrors++);
      
      this.queues.set(sessionId, queue);
      this.globalMetrics.totalSessions++;
      
      console.log(`[UserQueueManager] Created queue for session ${sessionId}, total sessions: ${this.globalMetrics.totalSessions}`);
    }
    
    return this.queues.get(sessionId)!;
  }

  removeQueue(sessionId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.clear();
      queue.removeAllListeners();
      this.queues.delete(sessionId);
      console.log(`[UserQueueManager] Removed queue for session ${sessionId}`);
    }
  }

  getGlobalMetrics() {
    const currentQueueDepths = Array.from(this.queues.values()).map(q => q.getQueueDepth());
    const totalQueueDepth = currentQueueDepths.reduce((sum, depth) => sum + depth, 0);
    const activeSessions = this.queues.size;
    
    return {
      ...this.globalMetrics,
      activeSessions,
      totalQueueDepth,
      maxQueueDepth: Math.max(...currentQueueDepths, 0),
      avgQueueDepth: activeSessions > 0 ? totalQueueDepth / activeSessions : 0
    };
  }

  cancelInFlightForSession(sessionId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.cancelPendingOperations();
      console.log(`[UserQueueManager] Cancelled in-flight operations for session ${sessionId}`);
    }
  }

  cleanup(): void {
    this.queues.forEach((queue, sessionId) => {
      queue.clear();
      queue.removeAllListeners();
    });
    this.queues.clear();
    console.log('[UserQueueManager] All queues cleared');
  }
}

export const userQueueManager = new UserQueueManager();