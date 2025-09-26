import express from 'express';
import { voiceService } from '../services/voice';
import { openaiService } from '../services/openai';
import { getAzureTTSService } from '../services/azureTTS';
import { getCurrentEnergyLevel, type EnergyLevel } from '../llm/voiceConfig';
import { telemetryManager } from '../services/sessionTelemetry';
import { conversationManager } from '../services/conversationManager';

const router = express.Router();

// Generate voice response with lesson grounding and turn gating
router.post('/generate-response', async (req, res) => {
  try {
    const { message, lessonId, sessionId, energyLevel, speechDuration, speechConfidence } = req.body;
    
    // TURN GATING: Validate actual user input
    const trimmedMessage = message?.trim() || '';
    const duration = speechDuration || 0;
    const confidence = speechConfidence || 0;
    
    // Check if input meets thresholds
    const minDuration = parseInt(process.env.ASR_MIN_MS || "300");
    const minConfidence = parseFloat(process.env.ASR_MIN_CONFIDENCE || "0.5");
    
    if (!trimmedMessage || trimmedMessage.length < 2) {
      console.log(`[Voice API] Gated: Empty or too short input: "${message}"`);
      return res.status(400).json({ error: 'No valid user input provided' });
    }
    
    if (duration > 0 && duration < minDuration) {
      console.log(`[Voice API] Gated: Speech too short (${duration}ms < ${minDuration}ms)`);
      return res.status(400).json({ error: 'Speech too brief, please speak more clearly' });
    }
    
    if (confidence > 0 && confidence < minConfidence) {
      console.log(`[Voice API] Gated: Low confidence (${confidence} < ${minConfidence})`);
      return res.status(400).json({ error: 'Could not understand clearly, please repeat' });
    }
    
    // Get energy level from request body, session, or default to environment/upbeat
    const effectiveEnergyLevel = energyLevel || (req.session as any).energyLevel || process.env.ENERGY_LEVEL || 'upbeat';
    const userId = req.user?.id || 'anonymous';

    console.log(`[Voice API] Processing valid input for user: ${userId}, lesson: ${lessonId}, message length: ${trimmedMessage.length}`);

    // Generate enhanced AI response with conversation management
    const enhancedResponse = await openaiService.generateEnhancedTutorResponse(message, {
      userId,
      lessonId: lessonId || 'general',
      sessionId,
      energyLevel: effectiveEnergyLevel
    });

    // Also get chunks for voice synthesis
    const chunks = await openaiService.generateVoiceResponse(message, { userId, lessonId, sessionId }).then(r => r.chunks);

    // Check if we should use Azure TTS or test mode
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    
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
        if (sessionId) {
          // Initialize session telemetry if needed
          if (!telemetryManager.getSessionSummary(sessionId)) {
            telemetryManager.startSession(sessionId, userId);
          }

          telemetryManager.addTranscriptEntry(sessionId, {
            speaker: 'user',
            content: message,
            topic: enhancedResponse.topic,
            energyLevel: effectiveEnergyLevel
          });

          telemetryManager.addTranscriptEntry(sessionId, {
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
          repairMove: enhancedResponse.repairMove
        });
      } catch (error) {
        console.error('[Voice API] Azure TTS failed, falling back to test mode:', error);
        // Fall through to test mode response
      }
    }

    // Test mode response (browser TTS will handle synthesis)
    // Add telemetry entries for transcript
    if (sessionId) {
      // Initialize session telemetry if needed
      if (!telemetryManager.getSessionSummary(sessionId)) {
        telemetryManager.startSession(sessionId, userId);
      }

      telemetryManager.addTranscriptEntry(sessionId, {
        speaker: 'user',
        content: message,
        topic: enhancedResponse.topic,
        energyLevel: effectiveEnergyLevel
      });

      telemetryManager.addTranscriptEntry(sessionId, {
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
      repairMove: enhancedResponse.repairMove
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
        "Good thinking! Can you count from 1 to 5 for me?",
        "That's a great question about numbers! How many fingers do you have on one hand?",
        "Let's practice counting together. Can you show me three fingers?"
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
    // Use session to track recent responses and avoid repetition
    const sessionKey = `recent_responses_${sessionId}`;
    const recentResponses = (req.session as any)[sessionKey] || [];
    
    // Find a response not recently used
    let selectedResponse = '';
    for (const response of responses) {
      if (!recentResponses.includes(response)) {
        selectedResponse = response;
        break;
      }
    }
    
    // If all responses were recently used, clear history and pick randomly
    if (!selectedResponse) {
      (req.session as any)[sessionKey] = [];
      selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Track this response
    (req.session as any)[sessionKey] = [...recentResponses.slice(-2), selectedResponse];
    
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

// Get current voice configuration
router.get('/config', (req, res) => {
  const config = {
    testMode: process.env.VOICE_TEST_MODE !== '0',
    energyLevel: getCurrentEnergyLevel(),
    voiceName: process.env.AZURE_VOICE_NAME || 'en-US-EmmaMultilingualNeural',
    hasAzureTTS: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    hasOpenAI: !!process.env.OPENAI_API_KEY
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