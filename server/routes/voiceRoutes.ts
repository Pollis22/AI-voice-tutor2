import express from 'express';
import { voiceService } from '../services/voice';
import { openaiService } from '../services/openai';
import { getAzureTTSService } from '../services/azureTTS';
import { getCurrentEnergyLevel, type EnergyLevel } from '../llm/voiceConfig';
import { telemetryManager } from '../services/sessionTelemetry';
import { conversationManager } from '../services/conversationManager';
import { userQueueManager } from '../services/userQueueManager';
import { inputGatingService } from '../services/inputGating';
import { guardrails } from '../services/guardrails';
import { hardBlockIfBanned } from '../services/phraseGuard';
import { answerChecker } from '../services/answerChecker';
import { latencyTracker } from '../services/latencyTracker';
import { latencyConfig, microAckPool, fallbackPools, getRandomFromPool } from '../config/latencyConfig';
import { answerFeedbackService } from '../services/answerFeedback';

const router = express.Router();

// Helper function to extract expected answer from a math question
const extractExpectedAnswer = (question: string): string | null => {
  // Extract answer from math questions - expanded patterns
  const patterns = [
    /what(?:'s|\s+is)\s+(\d+)\s*([+\-*\/])\s*(\d+)/i,  // "What's 1 + 1?"
    /if you have (\d+) .+ and get (\d+) more/i,  // "If you have 2 apples and get 1 more"
    /what comes after (\d+)/i,  // "What comes after 2?"
    /(\d+)\s*plus\s*(\d+)/i,  // "2 plus 2"
    /(\d+)\s*minus\s*(\d+)/i,  // "5 minus 2"
    /(\d+)\s*times\s*(\d+)/i,  // "3 times 4"
    /(\d+)\s*multiplied\s+by\s*(\d+)/i,  // "3 multiplied by 4"
    /can you solve.*?(\d+)\s*([+\-*\/])\s*(\d+)/i,  // "Can you solve 3 + 3?"
    /try this one.*?(\d+)\s*([+\-*\/])\s*(\d+)/i  // "Try this one. What's 5 minus 2?"
  ];
  
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      if (pattern === patterns[0] || pattern === patterns[3]) {
        // Math operation: "What's X + Y" or "X plus Y"
        const a = parseInt(match[1]);
        const op = match[2] || 'plus';
        const b = parseInt(match[3]);
        if (op === '+' || op === 'plus') return String(a + b);
        if (op === '-' || op === 'minus') return String(a - b);
        if (op === '*') return String(a * b);
        if (op === '/') return String(a / b);
      } else if (pattern === patterns[1]) {
        // Story problem: "If you have X and get Y more"
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        return String(a + b);
      } else if (pattern === patterns[2]) {
        // Sequence: "What comes after X?"
        const num = parseInt(match[1]);
        return String(num + 1);
      } else if (pattern === patterns[4]) {
        // Subtraction: "X minus Y"
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        return String(a - b);
      } else if (pattern === patterns[5] || pattern === patterns[6]) {
        // Multiplication: "X times Y" or "X multiplied by Y"
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        return String(a * b);
      } else if (pattern === patterns[7] || pattern === patterns[8]) {
        // Complex patterns: "Can you solve X + Y?" or "Try this one"
        const a = parseInt(match[1]);
        const op = match[2];
        const b = parseInt(match[3]);
        if (op === '+') return String(a + b);
        if (op === '-') return String(a - b);
        if (op === '*') return String(a * b);
        if (op === '/' && b !== 0) return String(Math.floor(a / b));
      }
    }
  }
  
  return null;
};

// Generate voice response with lesson grounding and turn gating
router.post('/generate-response', async (req, res) => {
  try {
    const { message, lessonId, sessionId, energyLevel, speechDuration, speechConfidence } = req.body;
    
    // Get user and session identifiers
    const userId = req.user?.id || 'anonymous';
    const effectiveSessionId = sessionId || `${userId}-default`;
    
    // Start timing for this turn
    const turnId = latencyTracker.startTurn(effectiveSessionId);
    const requestStartTime = Date.now();
    
    // Cancel any in-flight operations for this session (barge-in)
    userQueueManager.cancelInFlightForSession(effectiveSessionId);
    
    // Record ASR completion time
    latencyTracker.updateMetric(effectiveSessionId, turnId, { asr_end: Date.now() });
    
    // TURN GATING: Use proper input gating service with new aggressive thresholds
    const gatingResult = inputGatingService.validate({
      message: message || '',
      speechDuration: speechDuration,
      speechConfidence: speechConfidence,
      sessionId: effectiveSessionId,
      endOfSpeech: true,
      timestamp: Date.now()
    });
    
    if (gatingResult.shouldGate) {
      console.log(`[Voice API] Input gated: ${gatingResult.reason}, message: "${message?.substring(0, 50)}..."`);
      return res.status(400).json({ 
        error: gatingResult.reason,
        gated: true,
        reason: gatingResult.reason
      });
    }
    
    // Use the normalized input from gating service
    const normalizedInput = gatingResult.normalizedInput || message || '';
    
    // Get energy level from request body, session, or default to environment/upbeat
    const effectiveEnergyLevel = energyLevel || (req.session as any).energyLevel || process.env.ENERGY_LEVEL || 'upbeat';

    console.log(`[Voice API] Processing valid input for user: ${userId}, session: ${effectiveSessionId}, lesson: ${lessonId}, message length: ${normalizedInput.length}`);
    
    // Send micro-acknowledgement immediately for better UX
    const microAck = answerFeedbackService.generateMicroAck();
    console.log(`[Voice API] Sending micro-ack: "${microAck}" for session: ${effectiveSessionId}`);

    // Get user queue for this session (ensures concurrency = 1 per user)
    const userQueue = userQueueManager.getQueue(effectiveSessionId);
    
    // Record LLM start time
    latencyTracker.updateMetric(effectiveSessionId, turnId, { llm_start: Date.now() });
    
    // Enqueue the voice response generation to ensure exactly ONE LLM call per user turn
    const result = await userQueue.enqueue(async () => {
      // Generate enhanced AI response with conversation management
      const enhancedResponse = await openaiService.generateEnhancedTutorResponse(normalizedInput || message || '', {
        userId,
        lessonId: lessonId || 'general',
        sessionId: effectiveSessionId,
        energyLevel: effectiveEnergyLevel
      }, {
        duration: speechDuration,
        confidence: speechConfidence
      });

      // Record LLM completion time
      latencyTracker.updateMetric(effectiveSessionId, turnId, { 
        llm_first_token: Date.now(),
        model_used: process.env.LLM_MODEL || 'gpt-4o-mini'
      });
      
      return enhancedResponse;
    }, true); // Enable barge-in capability

    // Use the enhanced response from the queue
    const enhancedResponse = result;

    // Generate voice chunks for synthesis from the enhanced response
    const chunks = [enhancedResponse.content]; // Use the single response content for voice

    // Check USE_REALTIME flag to determine voice pipeline  
    const useRealtimeAPI = process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1';
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    
    if (useRealtimeAPI && !testMode) {
      // Use OpenAI Realtime API for voice synthesis and conversation
      try {
        const realtimeConfig = voiceService.getRealtimeConfig();
        
        return res.json({
          content: enhancedResponse.content,
          chunks,
          useRealtime: true,
          realtimeConfig,
          testMode: false,
          energyLevel: effectiveEnergyLevel,
          plan: enhancedResponse.plan,
          topic: enhancedResponse.topic,
          repairMove: enhancedResponse.repairMove,
          usedFallback: enhancedResponse.usedFallback,
          retryCount: enhancedResponse.retryCount,
          tokensUsed: enhancedResponse.tokensUsed,
          model: enhancedResponse.model,
          banner: enhancedResponse.banner,
          queueDepth: enhancedResponse.queueDepth,
          usedCache: enhancedResponse.usedCache,
          breakerOpen: enhancedResponse.breakerOpen
        });
      } catch (error) {
        console.error('[Voice API] Realtime API error, falling back to Azure TTS:', error);
        // Fall through to Azure TTS
      }
    }
    
    if (!testMode) {
      try {
        // Use Azure TTS for production voice synthesis
        const azureTTS = getAzureTTSService();
        const audioChunks: string[] = [];
        
        // Set energy level if provided
        // Set Azure TTS energy level for synthesis
        azureTTS.setEnergyLevel(effectiveEnergyLevel as EnergyLevel);

        // Generate audio for each chunk (for streaming TTS)
        for (const chunk of chunks) {
          const audioData = await azureTTS.synthesizeSpeech(chunk);
          // Convert ArrayBuffer to base64 for transmission
          const base64Audio = Buffer.from(audioData).toString('base64');
          audioChunks.push(base64Audio);
        }

        // Add telemetry entries for transcript
        if (effectiveSessionId) {
          // Initialize session telemetry if needed
          if (!telemetryManager.getSessionSummary(effectiveSessionId)) {
            telemetryManager.startSession(effectiveSessionId, userId);
          }

          telemetryManager.addTranscriptEntry(effectiveSessionId, {
            speaker: 'user',
            content: message,
            topic: enhancedResponse.topic,
            energyLevel: effectiveEnergyLevel
          });

          telemetryManager.addTranscriptEntry(effectiveSessionId, {
            speaker: 'tutor',
            content: enhancedResponse.content,
            topic: enhancedResponse.topic,
            energyLevel: effectiveEnergyLevel
          });
        }

        return res.json({
          content: enhancedResponse.content,
          chunks,
          audioChunks,
          testMode: false,
          energyLevel: effectiveEnergyLevel,
          topic: enhancedResponse.topic,
          repairMove: enhancedResponse.repairMove,
          usedFallback: enhancedResponse.usedFallback,
          usedCache: enhancedResponse.usedCache,
          breakerOpen: enhancedResponse.breakerOpen,
          queueDepth: enhancedResponse.queueDepth,
          banner: enhancedResponse.banner,
          retryCount: enhancedResponse.retryCount,
          plan: enhancedResponse.plan
        });
      } catch (error) {
        console.error('[Voice API] Azure TTS failed, falling back to test mode:', error);
        // Fall through to test mode response
      }
    }

    // Test mode response (browser TTS will handle synthesis)
    // Add telemetry entries for transcript
    if (effectiveSessionId) {
      // Initialize session telemetry if needed
      if (!telemetryManager.getSessionSummary(effectiveSessionId)) {
        telemetryManager.startSession(effectiveSessionId, userId);
      }

      telemetryManager.addTranscriptEntry(effectiveSessionId, {
        speaker: 'user',
        content: message,
        topic: enhancedResponse.topic,
        energyLevel: effectiveEnergyLevel
      });

      telemetryManager.addTranscriptEntry(effectiveSessionId, {
        speaker: 'tutor',
        content: enhancedResponse.content,
        topic: enhancedResponse.topic,
        energyLevel: effectiveEnergyLevel
      });
    }

    res.json({
      content: enhancedResponse.content,
      chunks,
      testMode: true,
      energyLevel: effectiveEnergyLevel,
      topic: enhancedResponse.topic,
      repairMove: enhancedResponse.repairMove,
      usedFallback: enhancedResponse.usedFallback,
      usedCache: enhancedResponse.usedCache,
      breakerOpen: enhancedResponse.breakerOpen,
      queueDepth: enhancedResponse.queueDepth,
      banner: enhancedResponse.banner,
      retryCount: enhancedResponse.retryCount,
      plan: enhancedResponse.plan
    });

  } catch (error) {
    console.error('[Voice API] Error generating response:', error);
    
    // Extract lessonId, sessionId and message from request body for fallback
    const { lessonId, sessionId, message } = req.body;
    const effectiveSessionId = sessionId || `${req.user?.id || 'anonymous'}-default`;
    const turnId = latencyTracker.startTurn(effectiveSessionId);
    
    // Record fallback usage
    latencyTracker.updateMetric(effectiveSessionId, turnId, { 
      fallback_used: true,
      error_code: error instanceof Error ? error.message.substring(0, 50) : 'unknown'
    });
    
    // Return a lesson-specific fallback response instead of generic error
    const subject = lessonId ? lessonId.split('-')[0] : 'general';
    
    // CRITICAL: Check if user provided an answer to a previous question
    let answerFeedback = '';
    // Get last question from session state
    const lastQuestionKey = `last_question_${sessionId || 'default'}`;
    const lastQuestion = (req.session as any)[lastQuestionKey] as string | undefined;
    
    if (lastQuestion && message && message.length > 0 && subject === 'math') {
      // For math, check if this is an answer to a math problem
      const expectedAnswer = extractExpectedAnswer(lastQuestion);
      if (expectedAnswer) {
        const checkResult = answerChecker.checkAnswer(expectedAnswer, message, 'math');
        console.log(`[Voice API Fallback] Answer check - Expected: ${expectedAnswer}, Got: ${message}, Result: ${checkResult.ok}`);
        answerFeedback = checkResult.msg + ' ';
      }
    }
    
    // Use centralized fallback pools from config
    const fallbackSubject = (subject === 'math' || subject === 'english' || subject === 'spanish') 
      ? subject : 'math'; // Default to math if unknown subject
    
    // Get fallback question using the centralized feedback service
    let selectedResponse = answerFeedbackService.getFallbackQuestion(fallbackSubject);
    
    // CRITICAL: Add answer feedback before the new question
    selectedResponse = answerFeedback + selectedResponse;
    
    // CRITICAL: Apply phrase guards to prevent ableist content
    selectedResponse = hardBlockIfBanned(selectedResponse);
    selectedResponse = guardrails.sanitizeTutorQuestion(selectedResponse);
    selectedResponse = guardrails.avoidRepeat(sessionId || 'default', selectedResponse, subject);
    selectedResponse = guardrails.enforceFormat(selectedResponse);
    
    // Store the new question for next answer checking
    if (selectedResponse.includes('?')) {
      const lastQuestionKey = `last_question_${sessionId || 'default'}`;
      (req.session as any)[lastQuestionKey] = selectedResponse;
    }
    
    // Track this response (keep only last 3 responses for better variety)
    const sessionKey = `recent_responses_${sessionId || 'default'}`;
    const recentResponses = (req.session as any)[sessionKey] || [];
    const updatedHistory = [...recentResponses.slice(-2), selectedResponse];
    (req.session as any)[sessionKey] = updatedHistory;
    
    console.log(`[Voice API] Selected fallback response for ${subject}: "${selectedResponse.substring(0, 50)}..."`);
    console.log(`[Voice API] Recent responses history length: ${updatedHistory.length}`);
    
    res.json({ 
      content: selectedResponse,
      chunks: [selectedResponse],
      testMode: true,
      energyLevel: process.env.ENERGY_LEVEL || 'upbeat',
      plan: {
        state: 'teach',
        goal: `Continue ${subject} lesson`,
        plan: ['Engage with current topic', 'Ask guiding questions'],
        next_prompt: selectedResponse
      }
    });
  }
});

// Generate live token for OpenAI Realtime API
router.get('/live-token', async (req, res) => {
  try {
    const useRealtimeAPI = process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1';
    
    if (!useRealtimeAPI) {
      // Return test mode config when Realtime API is disabled
      return res.json({
        token: 'realtime_disabled',
        config: {
          testMode: true,
          realtimeEnabled: false,
          message: 'OpenAI Realtime API disabled - using Azure TTS mode'
        }
      });
    }
    
    const userId = req.user?.id || 'anonymous';
    const token = await voiceService.generateLiveToken(userId);
    
    res.json({ 
      token,
      config: voiceService.getRealtimeConfig(),
      realtimeEnabled: true
    });
  } catch (error) {
    console.error('Error generating live token:', error);
    res.status(500).json({ error: 'Failed to generate live token' });
  }
});

// Get current voice configuration
router.get('/config', (req, res) => {
  const useRealtimeAPI = process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1';
  
  const config = {
    testMode: process.env.VOICE_TEST_MODE !== '0',
    useRealtime: useRealtimeAPI,
    energyLevel: getCurrentEnergyLevel(),
    voiceName: process.env.AZURE_VOICE_NAME || 'en-US-EmmaMultilingualNeural',
    hasAzureTTS: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    realtimeEnabled: useRealtimeAPI && !!process.env.OPENAI_API_KEY
  };

  res.json(config);
});

// Update session energy level
router.post('/set-energy', async (req, res) => {
  try {
    const { energyLevel } = req.body;
    const sessionId = req.session?.id;

    if (!sessionId) {
      return res.status(401).json({ error: 'No active session' });
    }

    // Store energy level in session for consistency
    (req.session as any).energyLevel = energyLevel;

    console.log(`[Voice API] Energy level set to: ${energyLevel} for session: ${sessionId}`);

    res.json({ 
      success: true, 
      energyLevel,
      sessionId 
    });
  } catch (error) {
    console.error('[Voice API] Error setting energy level:', error);
    res.status(500).json({ error: 'Failed to set energy level' });
  }
});

// Test Azure TTS connection
router.get('/test-tts', async (req, res) => {
  try {
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    
    if (testMode) {
      return res.json({ 
        success: true, 
        testMode: true,
        message: 'Running in test mode - Azure TTS not tested' 
      });
    }

    const azureTTS = getAzureTTSService();
    const success = await azureTTS.testSynthesis();

    res.json({
      success,
      testMode: false,
      message: success ? 'Azure TTS connection successful' : 'Azure TTS test failed'
    });
  } catch (error) {
    console.error('[Voice API] TTS test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'TTS test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug endpoint for latency metrics (auth-gated)
router.get('/debug/latency', (req, res) => {
  const sessionId = req.query.sessionId as string || `${req.user?.id || 'anonymous'}-default`;
  const stats = latencyTracker.getStats(sessionId);
  
  if (!stats) {
    return res.status(404).json({ error: 'No metrics found for session' });
  }
  
  // Add current configuration info
  const config = {
    asr: {
      minDurationMs: latencyConfig.asr.minDurationMs,
      minConfidence: latencyConfig.asr.minConfidence
    },
    vad: {
      silenceMs: latencyConfig.vad.silenceMs,
      maxUtteranceMs: latencyConfig.vad.maxUtteranceMs
    },
    llm: {
      model: latencyConfig.llm.model,
      timeoutMs: latencyConfig.llm.timeoutMs,
      targetFirstTokenMs: latencyConfig.llm.targetFirstTokenMs
    },
    inputGating: inputGatingService.getCurrentProfile()
  };
  
  res.json({
    sessionId,
    stats,
    config,
    timestamp: Date.now()
  });
});

export default router;