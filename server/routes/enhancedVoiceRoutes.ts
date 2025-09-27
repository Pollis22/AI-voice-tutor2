import express from 'express';
import { openaiService } from '../services/openai';
import { getAzureTTSService } from '../services/azureTTS';
import { telemetryManager } from '../services/sessionTelemetry';
import { conversationManager } from '../services/conversationManager';
import { debugLogger } from '../utils/debugLogger';
import { rateLimitTracker } from '../utils/rateLimitHandler';
import { type EnergyStyle } from '../utils/ssmlGenerator';

const router = express.Router();

// Enhanced voice response with comprehensive gating, rate limiting, and monitoring
router.post('/generate-response', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { message, lessonId, sessionId, energyLevel, speechDuration, speechConfidence } = req.body;
    const userId = req.user?.id || 'anonymous';
    
    // 1. RATE LIMIT CHECK
    if (rateLimitTracker.isPaused()) {
      const remainingPause = rateLimitTracker.getRemainingPauseTime();
      console.log(`[Voice API] Rate limited, paused for ${remainingPause}ms`);
      
      // Return banner message for UI
      return res.json({
        content: "We're pausing briefly due to high traffic. Please wait a moment.",
        rateLimited: true,
        retryAfter: Math.ceil(remainingPause / 1000),
        banner: true
      });
    }
    
    // 2. INPUT GATING - Comprehensive validation
    const trimmedMessage = message?.trim() || '';
    const hasValidText = trimmedMessage.length > 0;
    
    // ASR thresholds from environment (defaults per requirements)
    const minDuration = parseInt(process.env.ASR_MIN_MS || '300');
    const minConfidence = parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.5');
    
    // Check ASR metrics if provided
    const asrMetricsProvided = speechDuration !== undefined || speechConfidence !== undefined;
    const passesASRThresholds = !asrMetricsProvided || (
      (speechDuration === undefined || speechDuration >= minDuration) &&
      (speechConfidence === undefined || speechConfidence >= minConfidence)
    );
    
    // Gate: Need either valid text OR passing ASR metrics
    if (!hasValidText && !passesASRThresholds) {
      console.log(`[Voice API] Input gated: text="${trimmedMessage}", duration=${speechDuration}ms, confidence=${speechConfidence}`);
      
      debugLogger.logTurn({
        lessonId: lessonId || 'general',
        subject: lessonId ? lessonId.split('-')[0] : 'general',
        userInput: message || '',
        tutorResponse: '',
        usedFallback: false,
        retryCount: 0,
        asrGated: true,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        speechDuration,
        speechConfidence,
        error: 'Input gated - no valid input'
      });
      
      // Don't append "You" messages, just reject silently
      return res.status(400).json({ 
        error: 'No valid user input provided',
        gated: true,
        reason: !hasValidText ? 'empty_text' : 'asr_thresholds'
      });
    }
    
    // Log successful gate pass
    console.log(`[Voice API] Processing input: user=${userId}, lesson=${lessonId}, length=${trimmedMessage.length}`);
    
    // 3. LESSON CONTEXT MANAGEMENT
    // Clear context on lesson switch to prevent cross-contamination
    if (sessionId && lessonId) {
      const currentContext = conversationManager.getContext(sessionId);
      if (currentContext && currentContext.topic !== lessonId) {
        console.log(`[Voice API] Lesson switch detected: ${currentContext.topic} -> ${lessonId}`);
        conversationManager.clearContext(sessionId);
        conversationManager.initializeContext(sessionId, userId);
        conversationManager.setTopic(sessionId, lessonId);
      } else if (!currentContext) {
        conversationManager.initializeContext(sessionId, userId);
        conversationManager.setTopic(sessionId, lessonId);
      }
    }
    
    // 4. ENERGY LEVEL CONFIGURATION
    const effectiveEnergyLevel = (energyLevel || 
                                 (req.session as any).energyLevel || 
                                 process.env.ENERGY_LEVEL || 
                                 'upbeat') as EnergyStyle;
    
    // 5. GENERATE AI RESPONSE
    let enhancedResponse;
    let usedFallback = false;
    let retryCount = 0;
    
    try {
      enhancedResponse = await openaiService.generateEnhancedTutorResponse(message, {
        userId,
        lessonId: lessonId || 'general',
        sessionId,
        energyLevel: effectiveEnergyLevel
      });
      
      // Extract retry count from response if available
      retryCount = (enhancedResponse as any).retryCount || 0;
      
    } catch (error: any) {
      console.error('[Voice API] Failed to generate AI response:', error);
      
      // Use lesson-specific fallback
      const subject = lessonId ? lessonId.split('-')[0] : 'general';
      const fallbackResponses = getLessonFallbacks(subject);
      
      // Track recent responses in session to avoid repetition
      const recentKey = `recent_fallbacks_${sessionId}`;
      const recentFallbacks = (req.session as any)[recentKey] || [];
      
      // Find non-recent response
      let fallbackContent = '';
      for (const response of fallbackResponses) {
        if (!recentFallbacks.includes(response)) {
          fallbackContent = response;
          break;
        }
      }
      
      // If all were used, reset and pick randomly
      if (!fallbackContent) {
        (req.session as any)[recentKey] = [];
        fallbackContent = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      }
      
      // Track this fallback
      (req.session as any)[recentKey] = [...recentFallbacks.slice(-2), fallbackContent];
      
      enhancedResponse = {
        content: fallbackContent,
        topic: lessonId || 'general',
        repairMove: false
      };
      
      usedFallback = true;
      
      // Log the fallback usage
      debugLogger.logTurn({
        lessonId: lessonId || 'general',
        subject,
        userInput: message,
        tutorResponse: fallbackContent,
        usedFallback: true,
        retryCount: 0,
        asrGated: false,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        speechDuration,
        speechConfidence,
        error: error.message
      });
    }
    
    // 6. PREPARE RESPONSE FOR TTS
    const chunks = enhancedResponse.content
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);
    
    // 7. AZURE TTS SYNTHESIS (if not in test mode)
    let audioChunks: string[] = [];
    const testMode = process.env.VOICE_TEST_MODE === '1';
    
    if (!testMode && process.env.AZURE_SPEECH_KEY) {
      try {
        const azureTTS = getAzureTTSService();
        azureTTS.setEnergyLevel(effectiveEnergyLevel);
        
        // Generate audio for each sentence
        for (const chunk of chunks) {
          const audioData = await azureTTS.synthesizeSpeech(chunk, effectiveEnergyLevel);
          const base64Audio = Buffer.from(audioData).toString('base64');
          audioChunks.push(base64Audio);
        }
      } catch (ttsError) {
        console.error('[Voice API] TTS synthesis failed:', ttsError);
        // Continue without audio
      }
    }
    
    // 8. LOG SUCCESSFUL TURN (if not already logged as fallback)
    if (!usedFallback) {
      debugLogger.logTurn({
        lessonId: lessonId || 'general',
        subject: lessonId ? lessonId.split('-')[0] : 'general',
        userInput: message,
        tutorResponse: enhancedResponse.content,
        usedFallback: false,
        retryCount,
        asrGated: false,
        durationMs: Date.now() - startTime,
        tokensUsed: 0, // Would need to extract from OpenAI response
        speechDuration,
        speechConfidence
      });
    }
    
    // 9. SEND RESPONSE
    res.json({
      content: enhancedResponse.content,
      chunks,
      audioChunks: audioChunks.length > 0 ? audioChunks : undefined,
      testMode,
      energyLevel: effectiveEnergyLevel,
      topic: enhancedResponse.topic,
      repairMove: enhancedResponse.repairMove,
      usedFallback
    });
    
  } catch (error: any) {
    console.error('[Voice API] Unexpected error:', error);
    
    // Log the error
    debugLogger.logTurn({
      lessonId: req.body.lessonId || 'general',
      subject: req.body.lessonId ? req.body.lessonId.split('-')[0] : 'general',
      userInput: req.body.message || '',
      tutorResponse: '',
      usedFallback: false,
      retryCount: 0,
      asrGated: false,
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
      speechDuration: req.body.speechDuration,
      speechConfidence: req.body.speechConfidence,
      error: error.message
    });
    
    res.status(500).json({ 
      error: 'Failed to generate voice response',
      testMode: true 
    });
  }
});

// Helper function for lesson-specific fallbacks
function getLessonFallbacks(subject: string): string[] {
  const fallbacks: Record<string, string[]> = {
    math: [
      "Let's work through this step by step. What number comes after 2?",
      "Great effort! If you have 2 apples and get 1 more, how many total?",
      "That's a good question about numbers! What comes after 3 when counting?",
      "Let's practice addition together. What's 2 plus 2?",
      "Excellent effort with math! What's 1 plus 1?"
    ],
    english: [
      "Let's explore words together! Can you tell me a word that names something?",
      "Good effort! What's your favorite word that describes an action?",
      "Let's think about sentences. Can you make a simple sentence with the word 'cat'?",
      "Great question! Can you think of a word that rhymes with 'bat'?",
      "Nice work with English! What letter does your name start with?"
    ],
    spanish: [
      "¡Muy bien! Can you say 'hola' for me?",
      "Good try! Do you know how to say 'thank you' in Spanish?",
      "Let's practice greetings! How would you say 'good morning'?",
      "Excellent! Can you count from uno to tres in Spanish?",
      "¡Fantástico! What color is 'rojo' in English?"
    ],
    general: [
      "Let's explore this topic together! What would you like to learn first?",
      "That's interesting! Can you tell me what you already know about this?",
      "Good question! Let's start with the basics. What part interests you most?",
      "I'm here to help you learn! What specific area should we focus on?",
      "Great thinking! What made you curious about this topic?"
    ]
  };
  
  return fallbacks[subject] || fallbacks.general;
}

// Stream response with Server-Sent Events for barge-in support
router.get('/stream-response', async (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  const { message, lessonId, sessionId } = req.query as any;
  const userId = req.user?.id || 'anonymous';
  const startTime = Date.now();
  
  // Abort controller for barge-in
  const abortController = new AbortController();
  
  // Handle client disconnect (barge-in)
  req.on('close', () => {
    console.log('[Streaming] Client disconnected (barge-in), aborting TTS');
    abortController.abort();
    res.end();
  });
  
  try {
    // Generate AI response
    const response = await openaiService.generateEnhancedTutorResponse(message as string, {
      userId,
      lessonId: lessonId as string,
      sessionId: sessionId as string,
    });
    
    // Split into sentences for streaming
    const sentences = response.content.split(/(?<=[.!?])\s+/).filter(s => s.length > 0);
    
    // Stream each sentence
    for (let i = 0; i < sentences.length; i++) {
      if (abortController.signal.aborted) {
        console.log('[Streaming] Aborted at sentence', i);
        break;
      }
      
      const sentence = sentences[i];
      
      // Send text first
      res.write(`data: ${JSON.stringify({ 
        type: 'text', 
        content: sentence, 
        index: i,
        total: sentences.length 
      })}\n\n`);
      
      // Generate audio if available
      if (process.env.VOICE_TEST_MODE !== '1' && process.env.AZURE_SPEECH_KEY) {
        try {
          const azureTTS = getAzureTTSService();
          const audioBuffer = await azureTTS.synthesizeSpeech(
            sentence, 
            (process.env.ENERGY_LEVEL as EnergyStyle) || 'upbeat'
          );
          
          if (!abortController.signal.aborted) {
            res.write(`data: ${JSON.stringify({ 
              type: 'audio', 
              content: Buffer.from(audioBuffer).toString('base64'), 
              index: i 
            })}\n\n`);
          }
        } catch (error) {
          console.error('[Streaming] TTS error for sentence', i, error);
        }
      }
      
      // Small delay between sentences
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }
    
    // Send completion
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        durationMs: Date.now() - startTime
      })}\n\n`);
    }
    
  } catch (error) {
    console.error('[Streaming] Error:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      message: 'Failed to generate response' 
    })}\n\n`);
  } finally {
    res.end();
  }
});

// Get current voice configuration
router.get('/config', (req, res) => {
  const config = {
    testMode: process.env.VOICE_TEST_MODE === '1',
    energyLevel: process.env.ENERGY_LEVEL || 'upbeat',
    voiceName: process.env.AZURE_VOICE_NAME || 'en-US-EmmaMultilingualNeural',
    hasAzureTTS: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    asrThresholds: {
      minDuration: parseInt(process.env.ASR_MIN_MS || '300'),
      minConfidence: parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.5')
    },
    rateLimited: rateLimitTracker.isPaused(),
    debugMode: process.env.DEBUG_TUTOR === '1'
  };
  
  res.json(config);
});

// Update session energy level
router.post('/set-energy', async (req, res) => {
  try {
    const { energyLevel } = req.body;
    const sessionId = req.session?.id;
    
    if (!['calm', 'neutral', 'upbeat'].includes(energyLevel)) {
      return res.status(400).json({ error: 'Invalid energy level' });
    }
    
    // Store in session
    if (req.session) {
      (req.session as any).energyLevel = energyLevel;
    }
    
    // Update Azure TTS if available
    if (process.env.AZURE_SPEECH_KEY) {
      const azureTTS = getAzureTTSService();
      azureTTS.setEnergyLevel(energyLevel as EnergyStyle);
    }
    
    console.log(`[Voice API] Energy level updated to ${energyLevel} for session ${sessionId}`);
    
    res.json({ 
      success: true, 
      energyLevel,
      sessionId 
    });
  } catch (error) {
    console.error('[Voice API] Error setting energy level:', error);
    res.status(500).json({ error: 'Failed to update energy level' });
  }
});

export default router;