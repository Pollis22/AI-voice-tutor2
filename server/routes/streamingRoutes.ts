import express from 'express';
import { getAzureTTSService } from '../services/azureTTS';
import { openaiService } from '../services/openai';
import { lessonService } from '../services/lessonService';
import { PassThrough } from 'stream';

const router = express.Router();

// Server-sent events for streaming TTS with barge-in capability
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
  
  // Abort controller for cancellation
  const abortController = new AbortController();
  
  // Handle client disconnect (barge-in)
  req.on('close', () => {
    console.log('[Streaming] Client disconnected, aborting TTS');
    abortController.abort();
    res.end();
  });
  
  try {
    // Load lesson context
    let lessonContext;
    if (lessonId) {
      lessonContext = await lessonService.getLessonContext(lessonId as string);
    }
    
    // Generate AI response
    const response = await openaiService.generateEnhancedTutorResponse(message as string, {
      userId,
      lessonId: lessonId as string,
      sessionId: sessionId as string,
      lessonContext: lessonContext || undefined,
    });
    
    // Split response into sentences for streaming
    const sentences = response.content.split(/(?<=[.!?])\s+/).filter(s => s.length > 0);
    
    // Stream each sentence
    for (let i = 0; i < sentences.length; i++) {
      if (abortController.signal.aborted) {
        console.log('[Streaming] Aborted at sentence', i);
        break;
      }
      
      const sentence = sentences[i];
      
      // Send sentence text first
      res.write(`data: ${JSON.stringify({ type: 'text', content: sentence, index: i })}\n\n`);
      
      // Generate and send audio if not in test mode
      if (process.env.VOICE_TEST_MODE !== '1') {
        try {
          const azureTTS = getAzureTTSService();
          // Use current energy level from environment
          const energyLevel = (process.env.ENERGY_LEVEL || 'upbeat') as any;
          const audioBuffer = await azureTTS.synthesizeSpeech(sentence, energyLevel);
          
          if (!abortController.signal.aborted) {
            // Send audio data as base64
            res.write(`data: ${JSON.stringify({ 
              type: 'audio', 
              content: audioBuffer.toString('base64'), 
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
    
    // Send completion event
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'complete', plan: response.plan })}\n\n`);
    }
  } catch (error) {
    console.error('[Streaming] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;