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
    res.status(500).json({ 
      error: 'Failed to generate voice response',
      testMode: true 
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