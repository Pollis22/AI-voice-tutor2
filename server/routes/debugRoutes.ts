import express from 'express';
import { debugLogger } from '../utils/debugLogger';
import { inputGatingService } from '../services/inputGating';
import { telemetryManager } from '../services/sessionTelemetry';

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

// Get current ASR profile configuration
router.get('/asr-profile', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const profile = inputGatingService.getCurrentProfile();
    const debugInfo = inputGatingService.getDebugInfo(req.query.sessionId as string || 'default');
    
    res.json({
      current: profile,
      debug: debugInfo,
      available: ['strict', 'balanced', 'aggressive'],
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Debug] Error fetching ASR profile:', error);
    res.status(500).json({ error: 'Failed to fetch ASR profile' });
  }
});

// Set ASR profile at runtime (with validation)
router.post('/asr-profile', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const { profile } = req.body;
    
    if (!['strict', 'balanced', 'aggressive'].includes(profile)) {
      return res.status(400).json({ 
        error: 'Invalid profile. Must be: strict, balanced, or aggressive' 
      });
    }
    
    const previousProfile = inputGatingService.getCurrentProfile();
    
    // Update environment variable for runtime switching
    process.env.ASR_PROFILE = profile;
    
    // Get updated profile info
    const updatedProfile = inputGatingService.getCurrentProfile();
    
    // Log telemetry
    if (process.env.DEBUG_TUTOR === '1') {
      console.log(`[ASR Profile] Changed from ${previousProfile.profile} to ${profile}`);
    }
    
    res.json({
      success: true,
      previous: previousProfile.profile,
      current: updatedProfile,
      message: `ASR profile switched to ${profile}`,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Debug] Error setting ASR profile:', error);
    res.status(500).json({ error: 'Failed to set ASR profile' });
  }
});

// Get comprehensive telemetry data
router.get('/telemetry', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const { sessionId } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const sessions = sessionId ? [sessionId as string] : telemetryManager.getUserSessions(userId).slice(0, 10);
    const telemetryData: any[] = [];
    
    for (const session of sessions) {
      const data = telemetryManager.getSessionTranscript(session);
      if (data) {
        telemetryData.push({
          sessionId: session,
          ...data,
          gatingInfo: inputGatingService.getDebugInfo(session)
        });
      }
    }
    
    res.json({
      telemetry: telemetryData,
      gatingMetrics: inputGatingService.getMetrics(),
      asrProfile: inputGatingService.getCurrentProfile(),
      debugEnabled: process.env.DEBUG_TUTOR === '1',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Debug] Error fetching telemetry:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
});

export { router as debugRoutes };