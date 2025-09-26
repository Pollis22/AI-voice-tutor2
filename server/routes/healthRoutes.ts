import express from 'express';
import { getAzureTTSService } from '../services/azureTTS';

const router = express.Router();

// Health check endpoint for TTS services
router.get('/health', async (req, res) => {
  try {
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    const useRealtimeAPI = process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1';
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      testMode,
      useRealtime: useRealtimeAPI,
      ttsEnabled: true, // Always true in test mode or with Azure TTS
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasAzureTTS: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
      services: {
        openai: process.env.OPENAI_API_KEY ? 'available' : 'missing',
        azureTTS: (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) ? 'available' : 'missing',
        database: 'available', // Using in-memory for development
        cache: 'available'
      }
    };

    // Test TTS service if available and not in test mode
    if (!testMode && health.hasAzureTTS) {
      try {
        const azureTTS = getAzureTTSService();
        const ttsTest = await azureTTS.testSynthesis();
        health.services.azureTTS = ttsTest ? 'healthy' : 'error';
      } catch (error) {
        health.services.azureTTS = 'error';
      }
    }

    res.json(health);
  } catch (error) {
    console.error('[Health] Error checking system health:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as healthRoutes };