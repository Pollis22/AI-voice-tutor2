interface InputValidationResult {
  isValid: boolean;
  reason?: string;
  shouldGate: boolean;
  normalizedInput?: string;
  vadSilenceDetected?: boolean;
  gatingMetadata?: {
    duration?: number;
    confidence?: number;
    profile?: string;
    endOfSpeech?: boolean;
  };
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

  // ASR Profile Configuration
  private readonly asrProfiles = {
    strict: { minDurationMs: 300, minConfidence: 0.6 },
    balanced: { minDurationMs: 250, minConfidence: 0.5 },
    aggressive: { minDurationMs: 150, minConfidence: 0.3 }
  };

  // Environment-based configuration with aggressive defaults for faster response
  private readonly vadSilenceMs = parseInt(process.env.VAD_SILENCE_MS || '250'); // Reduced from 300ms
  private readonly maxUtteranceMs = parseInt(process.env.MAX_UTTERANCE_MS || '6000'); // Reduced from 8000ms
  private readonly asrProfile = (process.env.ASR_PROFILE as 'strict'|'balanced'|'aggressive') || 'aggressive';
  
  private readonly minDurationMs = parseInt(process.env.ASR_MIN_MS || '200'); // Direct env var, reduced from 250ms
  private readonly minConfidence = parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.30'); // Direct env var, reduced from 0.5

  // VAD state tracking for silence detection
  private vadState: Map<string, { lastSpeechTime: number; silenceStartTime?: number }> = new Map();

  validate(input: {
    message?: string;
    speechDuration?: number;
    speechConfidence?: number;
    timestamp?: number;
    sessionId?: string;
    endOfSpeech?: boolean;
  }): InputValidationResult {
    this.metrics.totalInputs++;

    const { message, speechDuration, speechConfidence, sessionId = 'default', endOfSpeech = false } = input;
    
    // VAD Silence Detection - only commit utterance on end-of-speech
    const vadSilenceDetected = this.detectVadSilence(sessionId, endOfSpeech, input.timestamp);
    
    // Only process if we have end-of-speech or sufficient silence detected
    if (!endOfSpeech && !vadSilenceDetected) {
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Waiting for end-of-speech or VAD silence detection',
        vadSilenceDetected: false,
        gatingMetadata: {
          duration: speechDuration,
          confidence: speechConfidence,
          profile: this.asrProfile,
          endOfSpeech
        }
      };
    }
    
    // Clean and normalize the message
    const trimmedMessage = message?.trim() || '';
    const normalizedInput = this.normalizeInput(trimmedMessage);

    // EXACT REQUIREMENT: Only enqueue if text.trim() > 0 OR (asr.durationMs >= ASR_MIN_MS AND asr.confidence >= ASR_MIN_CONFIDENCE)
    const hasValidText = normalizedInput && normalizedInput.length > 0;
    const hasValidSpeech = speechDuration !== undefined && speechConfidence !== undefined &&
                           speechDuration >= this.minDurationMs && speechConfidence >= this.minConfidence;

    // Check utterance length limits
    if (speechDuration && speechDuration > this.maxUtteranceMs) {
      this.recordGating('utterance_too_long');
      return {
        isValid: false,
        shouldGate: true,
        reason: `Utterance too long: ${speechDuration}ms > ${this.maxUtteranceMs}ms`,
        vadSilenceDetected,
        gatingMetadata: {
          duration: speechDuration,
          confidence: speechConfidence,
          profile: this.asrProfile,
          endOfSpeech
        }
      };
    }

    // Must satisfy at least one condition
    if (!hasValidText && !hasValidSpeech) {
      // Determine the specific reason for gating
      if (!normalizedInput || normalizedInput.length === 0) {
        this.recordGating('empty_text');
        return {
          isValid: false,
          shouldGate: true,
          reason: 'Empty text input',
          vadSilenceDetected,
          gatingMetadata: {
            duration: speechDuration,
            confidence: speechConfidence,
            profile: this.asrProfile,
            endOfSpeech
          }
        };
      }
      
      if (speechDuration !== undefined && speechDuration < this.minDurationMs) {
        this.recordGating('speech_too_short');
        return {
          isValid: false,
          shouldGate: true,
          reason: `Speech too short: ${speechDuration}ms < ${this.minDurationMs}ms`,
          vadSilenceDetected,
          gatingMetadata: {
            duration: speechDuration,
            confidence: speechConfidence,
            profile: this.asrProfile,
            endOfSpeech
          }
        };
      }
      
      if (speechConfidence !== undefined && speechConfidence < this.minConfidence) {
        this.recordGating('low_confidence');
        return {
          isValid: false,
          shouldGate: true,
          reason: `Low confidence: ${speechConfidence} < ${this.minConfidence}`,
          vadSilenceDetected,
          gatingMetadata: {
            duration: speechDuration,
            confidence: speechConfidence,
            profile: this.asrProfile,
            endOfSpeech
          }
        };
      }
      
      this.recordGating('insufficient_input');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Insufficient input quality',
        vadSilenceDetected,
        gatingMetadata: {
          duration: speechDuration,
          confidence: speechConfidence,
          profile: this.asrProfile,
          endOfSpeech
        }
      };
    }

    // Additional quality checks for valid inputs
    
    // Gate: Gibberish or non-meaningful input (only if we have text)
    if (hasValidText && this.isGibberish(normalizedInput)) {
      this.recordGating('gibberish');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Input appears to be gibberish or non-meaningful',
        vadSilenceDetected,
        gatingMetadata: {
          duration: speechDuration,
          confidence: speechConfidence,
          profile: this.asrProfile,
          endOfSpeech
        }
      };
    }

    // Gate: Repetitive input (check against recent inputs)
    if (hasValidText && this.isRepetitive(normalizedInput)) {
      this.recordGating('repetitive');
      return {
        isValid: false,
        shouldGate: true,
        reason: 'Input is repetitive or identical to recent input',
        vadSilenceDetected,
        gatingMetadata: {
          duration: speechDuration,
          confidence: speechConfidence,
          profile: this.asrProfile,
          endOfSpeech
        }
      };
    }

    // Input passed all gates
    this.metrics.validInputs++;
    this.updateMetrics();

    return {
      isValid: true,
      shouldGate: false,
      normalizedInput: normalizedInput || `[speech:${speechDuration}ms,conf:${speechConfidence}]`,
      vadSilenceDetected,
      gatingMetadata: {
        duration: speechDuration,
        confidence: speechConfidence,
        profile: this.asrProfile,
        endOfSpeech
      }
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

  // VAD Silence Detection - tracks silence periods to detect end-of-speech
  private detectVadSilence(sessionId: string, endOfSpeech: boolean, timestamp?: number): boolean {
    const now = timestamp || Date.now();
    const vadKey = `vad_${sessionId}`;
    
    let vadState = this.vadState.get(vadKey);
    if (!vadState) {
      vadState = { lastSpeechTime: now };
      this.vadState.set(vadKey, vadState);
    }

    // If explicitly marked as end of speech, return true
    if (endOfSpeech) {
      vadState.lastSpeechTime = now;
      vadState.silenceStartTime = undefined;
      return true;
    }

    // If we detect speech, reset silence timer
    if (timestamp && timestamp > vadState.lastSpeechTime) {
      vadState.lastSpeechTime = timestamp;
      vadState.silenceStartTime = undefined;
      return false;
    }

    // If we haven't started tracking silence, start now
    if (!vadState.silenceStartTime) {
      vadState.silenceStartTime = now;
      return false;
    }

    // Check if silence duration exceeds threshold
    const silenceDuration = now - vadState.silenceStartTime;
    return silenceDuration >= this.vadSilenceMs;
  }

  // Get current ASR profile configuration
  getCurrentProfile(): { profile: string; minDurationMs: number; minConfidence: number; vadSilenceMs: number; maxUtteranceMs: number } {
    return {
      profile: this.asrProfile,
      minDurationMs: this.minDurationMs,
      minConfidence: this.minConfidence,
      vadSilenceMs: this.vadSilenceMs,
      maxUtteranceMs: this.maxUtteranceMs
    };
  }

  // Debug information for live ASR HUD
  getDebugInfo(sessionId: string): { vadState?: any; profile: string; thresholds: any } {
    return {
      vadState: this.vadState.get(`vad_${sessionId}`),
      profile: this.asrProfile,
      thresholds: {
        minDurationMs: this.minDurationMs,
        minConfidence: this.minConfidence,
        vadSilenceMs: this.vadSilenceMs,
        maxUtteranceMs: this.maxUtteranceMs
      }
    };
  }
}

// Global input gating service
export const inputGatingService = new InputGatingService();