import express from 'express';
import { debugLogger } from '../utils/debugLogger';

const router = express.Router();

// Get recent turn logs (auth-gated)
router.get('/last-turns', async (req, res) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Get count from query param or default to 50
  const count = parseInt(req.query.count as string) || 50;
  
  // Get recent logs
  const logs = debugLogger.getRecentLogs(count);
  const summary = debugLogger.getSummary();
  
  res.json({
    summary,
    logs,
    debugEnabled: process.env.DEBUG_TUTOR === '1',
    timestamp: Date.now()
  });
});

// Clear debug logs (admin only)
router.post('/clear-logs', async (req, res) => {
  // Check if user is authenticated and is admin
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For now, any authenticated user can clear logs
  // In production, you'd check for admin role
  debugLogger.clearLogs();
  
  res.json({ message: 'Debug logs cleared successfully' });
});

// Get current rate limit status
router.get('/rate-limit-status', async (req, res) => {
  const { rateLimitTracker } = await import('../utils/rateLimitHandler');
  
  res.json({
    isPaused: rateLimitTracker.isPaused(),
    remainingPauseTime: rateLimitTracker.getRemainingPauseTime(),
    timestamp: Date.now()
  });
});

export default router;