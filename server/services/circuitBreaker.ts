import { EventEmitter } from 'events';

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
  resetTimeoutMs: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerMetrics {
  requests: number;
  failures: number;
  successes: number;
  timeouts: number;
  rejectedRequests: number;
  lastFailureTime?: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitBreakerMetrics = {
    requests: 0,
    failures: 0,
    successes: 0,
    timeouts: 0,
    rejectedRequests: 0
  };
  
  private resetTimeoutId: NodeJS.Timeout | null = null;

  constructor(private config: CircuitBreakerConfig) {
    super();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      this.metrics.rejectedRequests++;
      this.emit('reject', this.metrics);
      throw new Error('Circuit breaker is OPEN - request rejected');
    }

    this.metrics.requests++;

    // Retry pattern: 250ms, 500ms, 1s, 2s (max 4 attempts)
    const retryDelays = [250, 500, 1000, 2000];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryDelays.length + 1; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          this.timeoutPromise()
        ]);

        this.onSuccess();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // If this is the last attempt, don't retry
        if (attempt === retryDelays.length) {
          break;
        }

        console.log(`[CircuitBreaker] Attempt ${attempt + 1} failed, retrying in ${retryDelays[attempt]}ms:`, lastError.message);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }

    // All retries failed
    this.onFailure(lastError);
    throw lastError || new Error('All retry attempts failed');
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Operation timeout'));
      }, this.config.timeoutMs);
    });
  }

  private onSuccess(): void {
    this.metrics.successes++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.emit('close', this.metrics);
      console.log('[CircuitBreaker] State changed to CLOSED after successful request');
    }
  }

  private onFailure(error: any): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    if (error?.message === 'Operation timeout') {
      this.metrics.timeouts++;
    }

    // Check if we should open the circuit
    const failureRate = this.metrics.failures / this.metrics.requests;
    const shouldOpen = (
      this.state === CircuitState.CLOSED &&
      this.metrics.requests >= 5 && // Minimum requests before considering failure rate
      failureRate >= (this.config.failureThreshold / 100)
    ) || (
      // Also open on specific error patterns (429, 5xx)
      this.isFailureError(error) && this.metrics.failures >= 3
    );

    if (shouldOpen) {
      this.open();
    }
  }

  private isFailureError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const status = error?.status || error?.response?.status;
    
    return (
      message.includes('429') ||
      message.includes('quota') ||
      message.includes('rate limit') ||
      (status >= 500 && status < 600) ||
      status === 429
    );
  }

  private open(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.emit('open', this.metrics);
      console.log(`[CircuitBreaker] Circuit opened - failure rate: ${(this.metrics.failures / this.metrics.requests * 100).toFixed(1)}%`);
      
      // Schedule transition to half-open
      if (this.resetTimeoutId) {
        clearTimeout(this.resetTimeoutId);
      }
      
      this.resetTimeoutId = setTimeout(() => {
        this.state = CircuitState.HALF_OPEN;
        this.emit('halfOpen', this.metrics);
        console.log('[CircuitBreaker] State changed to HALF_OPEN - testing if service recovered');
      }, this.config.resetTimeoutMs);
    }
  }

  // Public API
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  getState(): string {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics & { state: string } {
    return { ...this.metrics, state: this.state };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      timeouts: 0,
      rejectedRequests: 0
    };
    
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    
    this.emit('reset', this.metrics);
    console.log('[CircuitBreaker] Circuit breaker reset');
  }
}

// Global circuit breaker instance for OpenAI
const openaiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 50, // 50% failure rate triggers opening
  timeoutMs: 30000, // 30 second timeout
  resetTimeoutMs: parseInt(process.env.CIRCUIT_COOLDOWN_MS || '45000') // 45 second cooldown
});

export { openaiCircuitBreaker };