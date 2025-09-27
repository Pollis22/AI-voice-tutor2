import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { voiceService } from "./services/voice";
import { lessonsService } from "./services/lessons";
import { openaiService } from "./services/openai";
import voiceRoutes from "./routes/voiceRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import streamingRoutes from "./routes/streamingRoutes";
import { debugRoutes } from "./routes/debugRoutes";
import { setupSecurityHeaders, setupCORS } from "./middleware/security";
import Stripe from "stripe";
import { z } from "zod";

// Temporary bypass for development and testing - will use provided secrets once configured
if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

// Use provided Stripe key or disable Stripe functionality in development
const stripeKey = process.env.STRIPE_SECRET_KEY;
const isStripeEnabled = !!stripeKey;

const stripe = isStripeEnabled ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply security middleware
  app.use(setupCORS);
  app.use(setupSecurityHeaders);
  
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    const hasAzureTTS = !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
    
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      voiceTestMode: testMode,
      ttsEnabled: testMode || hasAzureTTS, // Always true in test mode or with Azure TTS
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      multiAgent: true, // Flag indicating multi-agent ConvAI system is active
      hasAzureTTS: hasAzureTTS,
      useRealtime: process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1',
      debugMode: process.env.DEBUG_TUTOR === '1',
      // ElevenLabs ConvAI status
      convai: true, // Multi-agent system - agents are hardcoded in frontend
      useConvai: process.env.USE_CONVAI !== 'false'
    });
  });

  // Setup authentication
  setupAuth(app);

  // Enhanced voice API routes (use existing voiceRoutes but add enhancedVoiceRoutes functionality if needed)
  app.use("/api/voice", voiceRoutes);
  
  // Conversation management routes
  app.use("/api/conversation", conversationRoutes);
  app.use("/api/streaming", streamingRoutes);
  
  // Debug routes for monitoring and troubleshooting
  app.use("/api/debug", debugRoutes);
  

  // Legacy voice API routes (for compatibility)
  // Note: live-token endpoint is now handled in voiceRoutes

  app.post("/api/voice/narrate", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { text, style = 'cheerful' } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      const audioUrl = await voiceService.generateNarration(text, style);
      res.json({ audioUrl });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating narration: " + error.message });
    }
  });

  // Lessons API routes
  app.get("/api/lessons", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const lessons = await lessonsService.getUserLessons(user.id);
      res.json(lessons);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching lessons: " + error.message });
    }
  });

  app.get("/api/lessons/:lessonId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const lesson = await lessonsService.getLessonWithProgress(lessonId, user.id);
      res.json(lesson);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching lesson: " + error.message });
    }
  });

  app.post("/api/lessons/:lessonId/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const { progressPercentage, status } = req.body;

      const progress = await storage.updateUserProgress(user.id, lessonId, {
        progressPercentage,
        status,
        lastAccessed: new Date(),
      });

      res.json(progress);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating progress: " + error.message });
    }
  });

  // Learning sessions API
  app.post("/api/sessions/start", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { lessonId, sessionType } = req.body;

      // Check usage limits for voice sessions
      if (sessionType === 'voice') {
        const canUseVoice = await storage.canUserUseVoice(user.id);
        if (!canUseVoice) {
          return res.status(429).json({ 
            message: "Weekly voice limit exceeded",
            fallbackMode: "text"
          });
        }
      }

      const session = await storage.createLearningSession({
        userId: user.id,
        lessonId,
        sessionType,
      });

      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: "Error starting session: " + error.message });
    }
  });

  app.put("/api/sessions/:sessionId/end", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { sessionId } = req.params;
      const user = req.user as any;
      const { transcript, voiceMinutesUsed = 0 } = req.body;

      const session = await storage.endLearningSession(sessionId, user.id, {
        transcript,
        voiceMinutesUsed,
        endedAt: new Date(),
        isCompleted: true,
      });

      // Update user's weekly voice usage
      if (voiceMinutesUsed > 0) {
        await storage.updateUserVoiceUsage(user.id, voiceMinutesUsed);
      }

      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: "Error ending session: " + error.message });
    }
  });

  // Quiz API routes
  app.post("/api/quiz/:lessonId/submit", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const { answers, sessionId, timeSpent } = req.body;

      const result = await lessonsService.submitQuiz(user.id, lessonId, {
        answers,
        sessionId,
        timeSpent,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Error submitting quiz: " + error.message });
    }
  });

  // Dashboard API
  app.get("/api/dashboard", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const dashboard = await storage.getUserDashboard(user.id);
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching dashboard: " + error.message });
    }
  });

  // Resume session API
  app.get("/api/resume", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const resumeData = await storage.getResumeSession(user.id);
      res.json(resumeData);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching resume data: " + error.message });
    }
  });

  // Stripe subscription routes
  app.post('/api/get-or-create-subscription', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!isStripeEnabled) {
      return res.status(503).json({ message: "Subscription service temporarily unavailable - Stripe not configured" });
    }

    let user = req.user as any;
    const { plan = 'all' } = req.body; // 'single' or 'all'

    if (user.stripeSubscriptionId) {
      const subscription = await stripe!.subscriptions.retrieve(user.stripeSubscriptionId);
      
      const latestInvoice = subscription.latest_invoice;
      const clientSecret = latestInvoice && typeof latestInvoice === 'object' 
        ? (latestInvoice as any).payment_intent?.client_secret 
        : undefined;

      res.send({
        subscriptionId: subscription.id,
        clientSecret,
      });

      return;
    }
    
    if (!user.email) {
      throw new Error('No user email on file');
    }

    try {
      const customer = await stripe!.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim() || user.username,
      });

      user = await storage.updateUserStripeInfo(user.id, customer.id, null);

      // Get price ID based on plan
      const priceId = plan === 'single' 
        ? process.env.STRIPE_SINGLE_PRICE_ID 
        : process.env.STRIPE_ALL_PRICE_ID;

      if (!priceId) {
        throw new Error(`Missing Stripe price ID for ${plan} plan`);
      }

      const subscription = await stripe!.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      await storage.updateUserStripeInfo(user.id, customer.id, subscription.id);
      await storage.updateUserSubscription(user.id, plan, 'active');

      const latestInvoice = subscription.latest_invoice;
      const clientSecret = latestInvoice && typeof latestInvoice === 'object' 
        ? (latestInvoice as any).payment_intent?.client_secret 
        : undefined;

      res.send({
        subscriptionId: subscription.id,
        clientSecret,
      });
    } catch (error: any) {
      return res.status(400).send({ error: { message: error.message } });
    }
  });

  // Stripe customer portal
  app.post('/api/customer-portal', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!isStripeEnabled) {
      return res.status(503).json({ message: "Customer portal temporarily unavailable - Stripe not configured" });
    }

    const user = req.user as any;
    
    if (!user.stripeCustomerId) {
      return res.status(400).json({ message: "No Stripe customer found" });
    }

    try {
      const session = await stripe!.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${req.protocol}://${req.get('host')}/settings`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ message: "Error creating portal session: " + error.message });
    }
  });

  // Admin routes
  app.get("/api/admin/users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as any;
    if (!user.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      const users = await storage.getAdminUsers({
        page: Number(page),
        limit: Number(limit),
        search: String(search),
      });
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching users: " + error.message });
    }
  });

  app.get("/api/admin/stats", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as any;
    if (!user.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching stats: " + error.message });
    }
  });

  app.get("/api/admin/export", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as any;
    if (!user.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const csvData = await storage.exportUsersCSV();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
      res.send(csvData);
    } catch (error: any) {
      res.status(500).json({ message: "Error exporting data: " + error.message });
    }
  });

  // AI tutor chat endpoint
  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { message, lessonId, sessionId } = req.body;

      const response = await openaiService.generateTutorResponse(message, {
        userId: user.id,
        lessonId,
        sessionId,
      });

      res.json({ response });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating response: " + error.message });
    }
  });

  // Settings API
  app.put("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const updates = req.body;

      const updatedUser = await storage.updateUserSettings(user.id, updates);
      res.json(updatedUser);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating settings: " + error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
