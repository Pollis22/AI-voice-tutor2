import express from 'express';
import { voiceService } from '../services/voice';
import { openaiService } from '../services/openai';
import { getAzureTTSService } from '../services/azureTTS';
import { getCurrentEnergyLevel, type EnergyLevel } from '../llm/voiceConfig';

const router = express.Router();

// Generate voice response with enhanced AI and Azure TTS
router.post('/generate-response', async (req, res) => {
  try {
    const { message, lessonId, sessionId, energyLevel } = req.body;
    const userId = req.user?.id || 'anonymous';

    console.log(`[Voice API] Generating response for user: ${userId}, lesson: ${lessonId}`);

    // Generate enhanced AI response
    const context = { userId, lessonId, sessionId };
    const { content, chunks } = await openaiService.generateVoiceResponse(message, context);

    // Check if we should use Azure TTS or test mode
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    
    if (!testMode) {
      try {
        // Use Azure TTS for production voice synthesis
        const azureTTS = getAzureTTSService();
        const audioChunks: string[] = [];
        
        // Set energy level if provided
        if (energyLevel) {
          azureTTS.setEnergyLevel(energyLevel as EnergyLevel);
        }

        // Generate audio for each chunk (for streaming TTS)
        for (const chunk of chunks) {
          const audioData = await azureTTS.synthesizeSpeech(chunk);
          // Convert ArrayBuffer to base64 for transmission
          const base64Audio = Buffer.from(audioData).toString('base64');
          audioChunks.push(base64Audio);
        }

        return res.json({
          content,
          chunks,
          audioChunks,
          testMode: false,
          energyLevel: energyLevel || getCurrentEnergyLevel()
        });
      } catch (error) {
        console.error('[Voice API] Azure TTS failed, falling back to test mode:', error);
        // Fall through to test mode response
      }
    }

    // Test mode response (browser TTS will handle synthesis)
    res.json({
      content,
      chunks,
      testMode: true,
      energyLevel: energyLevel || getCurrentEnergyLevel()
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