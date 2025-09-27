// OpenAI-specific retry handler with exponential backoff for 429/5xx errors
import OpenAI from 'openai';

interface RetryConfig {
  delays: number[];
  maxRetries: number;
}

interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: Error;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  delays: [250, 500, 1000, 2000], // 250ms, 500ms, 1s, 2s
  maxRetries: 4
};

// Faster retry config for voice interactions (needs quick response)
export const VOICE_RETRY_CONFIG: RetryConfig = {
  delays: [100, 200, 400], // 100ms, 200ms, 400ms
  maxRetries: 2 // Max 3 attempts total
};

export interface OpenAIRetryResult<T> {
  result?: T;
  usedFallback: boolean;
  retryCount: number;
  error?: Error;
}

export async function retryOpenAICall<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (context: RetryContext) => void,
  timeout: number = 30000 // Default 30s timeout
): Promise<OpenAIRetryResult<T>> {
  let lastError: Error | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Add timeout wrapper around operation
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeout);
      });
      
      const result = await Promise.race([
        operation(),
        timeoutPromise
      ]);
      return {
        result,
        usedFallback: false,
        retryCount: attempt
      };
    } catch (error: any) {
      lastError = error;
      retryCount = attempt;

      // Check if this is a retryable error
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || attempt >= config.maxRetries) {
        // Don't retry, return error result
        return {
          usedFallback: true,
          retryCount,
          error: lastError
        };
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          totalAttempts: config.maxRetries + 1,
          lastError
        });
      }

      // Wait before retry
      const delay = config.delays[Math.min(attempt, config.delays.length - 1)];
      console.log(`[OpenAI Retry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed, retrying in ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  return {
    usedFallback: true,
    retryCount,
    error: lastError
  };
}

function isRetryableError(error: any): boolean {
  // Retry on 429 (rate limit) and 5xx server errors
  if (error?.status === 429) return true;
  if (error?.status >= 500 && error?.status < 600) return true;
  
  // Also retry on specific error codes
  if (error?.code === 'rate_limit_exceeded') return true;
  if (error?.code === 'server_error') return true;
  if (error?.code === 'timeout') return true;
  
  // Network errors
  if (error?.message?.includes('ECONNRESET')) return true;
  if (error?.message?.includes('ETIMEDOUT')) return true;
  if (error?.message?.includes('ENOTFOUND')) return true;
  
  return false;
}

// Helper to extract org ID for logging (redacted)
export function getRedactedOrgId(): string {
  const orgId = process.env.OPENAI_ORG_ID || 'unknown';
  if (orgId === 'unknown' || orgId.length < 8) {
    return 'org-****';
  }
  return `${orgId.substring(0, 4)}****${orgId.substring(orgId.length - 4)}`;
}

// Helper to validate and log API key status
export function validateAndLogOpenAIKey(): { hasKey: boolean; source: string } {
  const editorKey = process.env.OPENAI_API_KEY;
  const deployKey = process.env.OPENAI_API_KEY_ENV_VAR;
  
  let hasKey = false;
  let source = 'none';
  let keyPreview = 'none';
  
  if (editorKey && editorKey !== 'default_key') {
    hasKey = true;
    source = 'editor_secrets';
    keyPreview = `sk-****${editorKey.substring(editorKey.length - 4)}`;
  } else if (deployKey && deployKey !== 'default_key') {
    hasKey = true;
    source = 'deploy_env';
    keyPreview = `sk-****${deployKey.substring(deployKey.length - 4)}`;
  }
  
  // One-line startup log (redacted)
  console.log(`[OpenAI Init] API key: ${hasKey ? 'available' : 'missing'} (source: ${source}, preview: ${keyPreview})`);
  
  return { hasKey, source };
}