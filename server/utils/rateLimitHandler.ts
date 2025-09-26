// Rate limit handler with exponential backoff for API calls
export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: any) => void;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public requestId?: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxRetries = 4,
    baseDelay = 250,
    maxDelay = 2000,
    onRetry
  } = config;

  const delays = [250, 500, 1000, 2000]; // Fixed delays as per requirements
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimitError = 
        error?.status === 429 || 
        error?.statusCode === 429 ||
        error?.code === 'rate_limit_exceeded' ||
        error?.code === 'insufficient_quota';
      
      const isLastAttempt = attempt === maxRetries;
      
      if (!isRateLimitError || isLastAttempt) {
        // Log final error details when DEBUG_TUTOR is enabled
        if (process.env.DEBUG_TUTOR === '1') {
          console.error('[RateLimit] Failed after retries:', {
            attempt,
            error: error?.message || error,
            statusCode: error?.status || error?.statusCode,
            requestId: error?.requestID || error?.headers?.['x-request-id'],
            code: error?.code
          });
        }
        throw error;
      }
      
      // Calculate delay for this retry
      const delay = delays[Math.min(attempt, delays.length - 1)];
      
      // Log retry attempt when debugging
      if (process.env.DEBUG_TUTOR === '1') {
        console.log('[RateLimit] Retrying after delay:', {
          attempt: attempt + 1,
          delay,
          statusCode: error?.status || error?.statusCode,
          requestId: error?.requestID || error?.headers?.['x-request-id']
        });
      }
      
      // Notify callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached due to the throw in the loop
  throw new Error('Unexpected retry logic error');
}

// Helper to check if we're currently rate limited
export class RateLimitTracker {
  private pausedUntil: number = 0;
  private consecutiveErrors: number = 0;
  
  isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }
  
  recordError(): void {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= 3) {
      // Pause for 30 seconds after 3 consecutive rate limit errors
      this.pausedUntil = Date.now() + 30000;
      console.log('[RateLimit] Pausing API calls for 30 seconds due to repeated rate limits');
    }
  }
  
  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }
  
  getRemainingPauseTime(): number {
    return Math.max(0, this.pausedUntil - Date.now());
  }
}

export const rateLimitTracker = new RateLimitTracker();