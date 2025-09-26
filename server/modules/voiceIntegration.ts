import { openaiService } from '../services/openai';
import { inputGatingService } from '../services/inputGating';
import { normalizeAnswer, parseSimpleMathExpression, mathAnswersEqual, levenshteinDistance } from '../utils/answerNormalization';

interface VoiceResponse {
  response: string;
  correct?: boolean;
  offTopic?: boolean;
  fallback?: boolean;
  cached?: boolean;
  llmMetrics?: {
    latency: number;
    usedFallback: boolean;
    usedCache: boolean;
    retryCount: number;
  };
}

interface DebugLog {
  timestamp: string;
  sessionId: string;
  message: string;
  response: string;
  correct?: boolean;
  answerMethod?: string;
  llmMetrics?: any;
}

class VoiceIntegration {
  private debugLogs: DebugLog[] = [];
  private maxDebugLogs = 100;

  // Main conversation handler
  async processConversation(params: {
    message: string;
    userId: string;
    sessionId: string;
    lessonPlan?: any;
    context?: any;
    speechDuration?: number;
    speechConfidence?: number;
  }): Promise<VoiceResponse> {
    const startTime = Date.now();
    
    try {
      // Input gating validation
      const gatingResult = inputGatingService.validate({
        message: params.message,
        speechDuration: params.speechDuration,
        speechConfidence: params.speechConfidence,
        sessionId: params.sessionId,
        endOfSpeech: true,
        timestamp: Date.now()
      });

      if (gatingResult.shouldGate) {
        throw new Error(`Input gated: ${gatingResult.reason}`);
      }

      // Generate enhanced response
      const enhancedResponse = await openaiService.generateEnhancedTutorResponse(
        params.message,
        {
          userId: params.userId,
          lessonId: params.lessonPlan?.lessonId || 'general',
          sessionId: params.sessionId,
          energyLevel: 'upbeat'
        },
        {
          duration: params.speechDuration,
          confidence: params.speechConfidence
        }
      );

      const latency = Date.now() - startTime;
      
      // Log debug information
      this.logDebug({
        timestamp: new Date().toISOString(),
        sessionId: params.sessionId,
        message: params.message,
        response: enhancedResponse.content,
        llmMetrics: {
          latency,
          usedFallback: enhancedResponse.usedFallback || false,
          usedCache: enhancedResponse.usedCache || false,
          retryCount: enhancedResponse.retryCount || 0
        }
      });

      return {
        response: enhancedResponse.content,
        fallback: enhancedResponse.usedFallback,
        cached: enhancedResponse.usedCache,
        llmMetrics: {
          latency,
          usedFallback: enhancedResponse.usedFallback || false,
          usedCache: enhancedResponse.usedCache || false,
          retryCount: enhancedResponse.retryCount || 0
        }
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      // Log error
      this.logDebug({
        timestamp: new Date().toISOString(),
        sessionId: params.sessionId,
        message: params.message,
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        llmMetrics: {
          latency,
          usedFallback: true,
          usedCache: false,
          retryCount: 0
        }
      });

      throw error;
    }
  }

  // Answer checking with comprehensive normalization
  checkAnswer(
    questionType: 'short' | 'mcq' | 'math' | 'open',
    studentAnswer: string,
    correctAnswer: string,
    options?: string[]
  ): { isCorrect: boolean; correction?: string; method: string } {
    const normalizedStudent = normalizeAnswer(studentAnswer);
    const normalizedCorrect = normalizeAnswer(correctAnswer);

    // Math expressions
    if (questionType === 'math') {
      try {
        const studentResult = parseSimpleMathExpression(normalizedStudent);
        const correctResult = parseSimpleMathExpression(normalizedCorrect);
        
        if (studentResult !== null && correctResult !== null) {
          const isCorrect = mathAnswersEqual(studentResult, correctResult);
          return {
            isCorrect,
            correction: isCorrect ? undefined : `Not quite! The answer is ${correctAnswer}.`,
            method: 'math_expression'
          };
        }
      } catch (error) {
        // Fall through to text comparison
      }
    }

    // MCQ handling
    if (questionType === 'mcq' && options) {
      // Check direct option match (a, b, c, etc.)
      const optionMatch = normalizedStudent.match(/^([a-z])\)?\s*$/);
      if (optionMatch) {
        const optionIndex = optionMatch[1].charCodeAt(0) - 97; // a=0, b=1, etc.
        if (optionIndex >= 0 && optionIndex < options.length) {
          const selectedOption = normalizeAnswer(options[optionIndex]);
          const isCorrect = selectedOption === normalizedCorrect;
          return {
            isCorrect,
            correction: isCorrect ? undefined : `That's option ${optionMatch[1]}, but the correct answer is ${correctAnswer}.`,
            method: 'mcq_letter'
          };
        }
      }

      // Check "option X" format
      const optionWordMatch = normalizedStudent.match(/option\s+([a-z])/);
      if (optionWordMatch) {
        const optionIndex = optionWordMatch[1].charCodeAt(0) - 97;
        if (optionIndex >= 0 && optionIndex < options.length) {
          const selectedOption = normalizeAnswer(options[optionIndex]);
          const isCorrect = selectedOption === normalizedCorrect;
          return {
            isCorrect,
            correction: isCorrect ? undefined : `You chose option ${optionWordMatch[1]}, but the correct answer is ${correctAnswer}.`,
            method: 'mcq_word'
          };
        }
      }

      // Check full option text match
      for (let i = 0; i < options.length; i++) {
        if (normalizeAnswer(options[i]) === normalizedStudent) {
          const isCorrect = normalizedStudent === normalizedCorrect;
          return {
            isCorrect,
            correction: isCorrect ? undefined : `You selected "${options[i]}", but the correct answer is ${correctAnswer}.`,
            method: 'mcq_full_text'
          };
        }
      }
    }

    // Exact match
    if (normalizedStudent === normalizedCorrect) {
      return { isCorrect: true, method: 'exact_match' };
    }

    // Fuzzy matching for short answers
    if (questionType === 'short') {
      const distance = levenshteinDistance(normalizedStudent, normalizedCorrect);
      const threshold = normalizedCorrect.length <= 5 ? 1 : 2;
      
      if (distance <= threshold) {
        return { 
          isCorrect: true, 
          method: 'fuzzy_match',
          correction: `Close enough! The exact answer is "${correctAnswer}".`
        };
      }
    }

    // Default to incorrect
    return {
      isCorrect: false,
      correction: `Not quite. The correct answer is ${correctAnswer}.`,
      method: 'no_match'
    };
  }

  // Stream TTS (placeholder for Azure integration)
  async streamTTS(text: string, ttsService: any, chunkCallback: (chunk: any) => void): Promise<void> {
    // This would integrate with the actual Azure TTS service
    const chunks = text.match(/.{1,100}/g) || [text];
    
    for (const chunk of chunks) {
      // Simulate streaming
      await new Promise(resolve => setTimeout(resolve, 100));
      chunkCallback(Buffer.from(chunk));
    }
  }

  // Debug logging
  private logDebug(log: DebugLog): void {
    if (process.env.DEBUG_TUTOR === '1') {
      this.debugLogs.push(log);
      
      // Keep only recent logs
      if (this.debugLogs.length > this.maxDebugLogs) {
        this.debugLogs.shift();
      }

      console.log('[VoiceIntegration Debug]', JSON.stringify(log));
    }
  }

  // Get debug logs for API endpoint
  getDebugLogs(count: number = 10, sessionId?: string): DebugLog[] {
    let logs = this.debugLogs;
    
    if (sessionId) {
      logs = logs.filter(log => log.sessionId === sessionId);
    }
    
    return logs.slice(-count);
  }
}

export const voiceIntegration = new VoiceIntegration();