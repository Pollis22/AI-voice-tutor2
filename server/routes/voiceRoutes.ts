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

const router = express.Router();

// Generate voice response with lesson grounding and turn gating
router.post('/generate-response', async (req, res) => {
  try {
    const { message, lessonId, sessionId, energyLevel, speechDuration, speechConfidence } = req.body;
    
    // Get user and session identifiers
    const userId = req.user?.id || 'anonymous';
    const effectiveSessionId = sessionId || `${userId}-default`;
    
    // Cancel any in-flight operations for this session (barge-in)
    userQueueManager.cancelInFlightForSession(effectiveSessionId);
    
    // TURN GATING: Use proper input gating service that implements OR logic (text OR sufficient ASR)
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

    // Get user queue for this session (ensures concurrency = 1 per user)
    const userQueue = userQueueManager.getQueue(effectiveSessionId);
    
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
    
    // Extract lessonId and sessionId from request body for fallback
    const { lessonId, sessionId } = req.body;
    
    // Return a lesson-specific fallback response instead of generic error
    const subject = lessonId ? lessonId.split('-')[0] : 'general';
    
    const fallbackResponses: Record<string, string[]> = {
      math: [
        "Let's work through this step by step. What number comes after 2?",
        "Great effort! If you have 2 apples and get 1 more, how many total?",
        "That's a good question about numbers! What comes after 3 when counting?",
        "Let's practice addition. What's 1 plus 1?"
      ],
      english: [
        "Let's explore words together! Can you tell me a word that names something?",
        "Good effort! What's your favorite word that describes an action?",
        "Let's think about sentences. Can you make a simple sentence with the word 'cat'?",
        "Great question! Can you think of a word that rhymes with 'bat'?"
      ],
      spanish: [
        "¡Muy bien! Can you say 'hola' for me?",
        "Good try! Do you know how to say 'thank you' in Spanish?",
        "Let's practice greetings! How would you say 'good morning'?",
        "Excellent! Can you count from uno to tres in Spanish?"
      ],
      general: [
        "Let's explore this topic together! What would you like to learn first?",
        "That's interesting! Can you tell me what you already know about this?",
        "Good question! Let's start with the basics. What part interests you most?",
        "I'm here to help you learn! What specific area should we focus on?"
      ]
    };
    
    const responses = fallbackResponses[subject] || fallbackResponses.general;
    // Use improved session-based anti-repetition system
    const sessionKey = `recent_responses_${sessionId || 'default'}`;
    const recentResponses = (req.session as any)[sessionKey] || [];
    
    // Find responses not recently used
    const availableResponses = responses.filter(response => 
      !recentResponses.includes(response)
    );
    
    let selectedResponse = '';
    if (availableResponses.length > 0) {
      // Pick randomly from available responses
      selectedResponse = availableResponses[Math.floor(Math.random() * availableResponses.length)];
    } else {
      // If all responses were recently used, clear history and pick randomly
      console.log(`[Voice API] All fallback responses used, clearing history for session: ${sessionId}`);
      (req.session as any)[sessionKey] = [];
      selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    }
    
    // CRITICAL: Apply phrase guards to prevent ableist content
    selectedResponse = hardBlockIfBanned(selectedResponse);
    selectedResponse = guardrails.sanitizeTutorQuestion(selectedResponse);
    selectedResponse = guardrails.avoidRepeat(sessionId || 'default', selectedResponse, subject);
    selectedResponse = guardrails.enforceFormat(selectedResponse);
    
    // Track this response (keep only last 3 responses for better variety)
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

export default router;