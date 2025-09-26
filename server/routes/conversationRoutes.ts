import { Router } from 'express';
import { conversationManager } from '../services/conversationManager';
import { telemetryManager } from '../services/sessionTelemetry';
import { topicRouter } from '../services/topicRouter';

const router = Router();

// Get conversation state
router.get('/state/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = conversationManager.getContext(sessionId);
  
  if (!context) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    state: context.state,
    topic: context.topic,
    currentPlan: context.currentPlan,
    previousPlans: context.previousPlans.length
  });
});

// Update conversation state
router.post('/state/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { state } = req.body;

  const success = conversationManager.updateState(sessionId, state);
  
  if (!success) {
    return res.status(400).json({ error: 'Invalid state transition' });
  }

  res.json({ success: true, newState: state });
});

// Get session transcript
router.get('/transcript/:sessionId', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.params;
  const transcript = telemetryManager.getTranscript(sessionId);
  
  res.json({ transcript });
});

// Generate shareable transcript token
router.post('/transcript/:sessionId/share', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.params;
  const shareToken = telemetryManager.generateShareToken(sessionId);
  
  if (!shareToken) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ 
    shareToken,
    shareUrl: `${req.protocol}://${req.get('host')}/api/conversation/shared/${sessionId}?token=${shareToken}`,
    expiresIn: '24 hours'
  });
});

// Public shareable transcript view (requires token)
router.get('/shared/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Share token required' });
  }
  
  const shareableTranscript = telemetryManager.generateShareableTranscript(sessionId, token);
  
  if (!shareableTranscript) {
    return res.status(404).json({ error: 'Transcript not found, expired, or invalid token' });
  }

  // Return as plain text or HTML
  const format = req.query.format || 'markdown';
  
  if (format === 'html') {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Tutor Session Transcript</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <pre>${shareableTranscript}</pre>
    </body>
    </html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } else {
    res.setHeader('Content-Type', 'text/plain');
    res.send(shareableTranscript);
  }
});

// Classify topic
router.post('/classify-topic', (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const classification = topicRouter.classifyTopic(text);
  res.json(classification);
});

// Get session summary
router.get('/summary/:sessionId', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.params;
  const summary = telemetryManager.getSessionSummary(sessionId);
  
  if (!summary) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(summary);
});

export default router;