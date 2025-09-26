interface InputValidationResult {
  isValid: boolean;
  reason?: string;
  shouldGate: boolean;
  normalizedInput?: string;
}

interface GatingMetrics {
  totalInputs: number;
  gatedInputs: number;
  validInputs: number;
  gatingRate: number;
  reasonCounts: Record<string, number>;
}

export class InputGatingService {
  private metrics: GatingMetrics = {
    totalInputs: 0,
    gatedInputs: 0,
    validInputs: 0,
    gatingRate: 0,
    reasonCounts: {}
  };

  private readonly minDurationMs = parseInt(process.env.ASR_MIN_MS || '350');
  private readonly minConfidence = parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.5');

  validate(input: {
    message?: string;
    speechDuration?: number;
    speechConfidence?: number;
    timestamp?: number;
  }): InputValidationResult {
    this.metrics.totalInputs++;

    const { message, speechDuration = 0, speechConfidence = 0 } = input;
    
    // Clean and normalize the message
    const trimmedMessage = message?.trim() || '';
    const normalizedInput = this.normalizeInput(trimmedMessage);

    // Gate 1: Empty or too short text content
    if (!normalizedInput || normalizedInput.length < 2) {
      this.recordGating('empty_or_too_short');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Empty or too short input'
      };
    }

    // Gate 2: Gibberish or non-meaningful input
    if (this.isGibberish(normalizedInput)) {
      this.recordGating('gibberish');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Input appears to be gibberish or non-meaningful'
      };
    }

    // Gate 3: Speech duration too short (if provided)
    if (speechDuration > 0 && speechDuration < this.minDurationMs) {
      this.recordGating('speech_too_short');
      return {
        isValid: false,
        shouldGate: true,
        reason: `Speech duration ${speechDuration}ms below minimum ${this.minDurationMs}ms`
      };
    }

    // Gate 4: Speech confidence too low (if provided)
    if (speechConfidence > 0 && speechConfidence < this.minConfidence) {
      this.recordGating('low_confidence');
      return {
        isValid: false,
        shouldGate: true,
        reason: `Speech confidence ${speechConfidence.toFixed(2)} below minimum ${this.minConfidence}`
      };
    }

    // Gate 5: Repetitive input (check against recent inputs)
    if (this.isRepetitive(normalizedInput)) {
      this.recordGating('repetitive');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Input is repetitive or identical to recent input'
      };
    }

    // Input passed all gates
    this.metrics.validInputs++;
    this.updateMetrics();

    return {
      isValid: true,
      shouldGate: false,
      normalizedInput
    };
  }

  private normalizeInput(input: string): string {
    return input
      .toLowerCase()
      .trim()
      // Remove excessive punctuation
      .replace(/[!]{2,}/g, '!')
      .replace(/[?]{2,}/g, '?')
      .replace(/[.]{2,}/g, '.')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove trailing punctuation repetition
      .replace(/[!?.]+$/, '')
      .trim();
  }

  private isGibberish(input: string): boolean {
    // Check for patterns that indicate gibberish
    const gibberishPatterns = [
      /^[a-z]{1,2}$/i,           // Single/double letters (except common words)
      /(.)\1{4,}/,               // Repeated characters (aaaaa)
      /^[^aeiou\s]+$/i,          // No vowels (except some valid cases)
      /^\d+$/,                   // Pure numbers (might be valid in math context)
      /^[^a-zA-Z\s]*$/,          // No letters at all
    ];

    // Exception for common valid short inputs
    const validShortInputs = new Set([
      'no', 'yes', 'ok', 'hi', 'bye', 'one', 'two', 'three', 'four', 'five',
      'six', 'seven', 'eight', 'nine', 'ten', 'a', 'i', 'me', 'my', 'we', 'you'
    ]);

    if (input.length <= 3 && validShortInputs.has(input)) {
      return false;
    }

    return gibberishPatterns.some(pattern => pattern.test(input));
  }

  // Simple repetition detection (in production, this would be more sophisticated)
  private recentInputs: string[] = [];
  private readonly maxRecentInputs = 5;

  private isRepetitive(input: string): boolean {
    const isRepeat = this.recentInputs.includes(input);
    
    // Update recent inputs
    this.recentInputs.push(input);
    if (this.recentInputs.length > this.maxRecentInputs) {
      this.recentInputs.shift();
    }

    return isRepeat;
  }

  private recordGating(reason: string): void {
    this.metrics.gatedInputs++;
    this.metrics.reasonCounts[reason] = (this.metrics.reasonCounts[reason] || 0) + 1;
    this.updateMetrics();

    console.log(`[InputGating] Input gated - reason: ${reason}, total gated: ${this.metrics.gatedInputs}`);
  }

  private updateMetrics(): void {
    this.metrics.gatingRate = this.metrics.totalInputs > 0 
      ? (this.metrics.gatedInputs / this.metrics.totalInputs) * 100 
      : 0;
  }

  getMetrics(): GatingMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalInputs: 0,
      gatedInputs: 0,
      validInputs: 0,
      gatingRate: 0,
      reasonCounts: {}
    };
    this.recentInputs = [];
    console.log('[InputGating] Metrics reset');
  }

  // Adjust thresholds dynamically based on user feedback
  adjustThresholds(minDurationMs?: number, minConfidence?: number): void {
    if (minDurationMs !== undefined) {
      (this as any).minDurationMs = minDurationMs;
    }
    if (minConfidence !== undefined) {
      (this as any).minConfidence = minConfidence;
    }
    
    console.log(`[InputGating] Thresholds adjusted - duration: ${(this as any).minDurationMs}ms, confidence: ${(this as any).minConfidence}`);
  }
}

// Global input gating service
export const inputGatingService = new InputGatingService();