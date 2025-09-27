import OpenAI from "openai";
import { LLM_CONFIG, TUTOR_SYSTEM_PROMPT, ensureEndsWithQuestion, splitIntoSentences, getRandomPhrase, ACKNOWLEDGMENT_PHRASES, TRANSITION_PHRASES } from '../llm/systemPrompt';
import { conversationManager } from './conversationManager';
import { topicRouter } from './topicRouter';
import { TutorPlan, TUTOR_PLAN_SCHEMA } from '../types/conversationState';
import { LessonContext, SUBJECT_PROMPTS, ASR_CONFIG } from '../types/lessonContext';
import { lessonService } from './lessonService';
import { debugLogger } from '../utils/debugLogger';
import { retryOpenAICall, validateAndLogOpenAIKey, getRedactedOrgId, VOICE_RETRY_CONFIG, type OpenAIRetryResult } from '../utils/openaiRetryHandler';
import { openaiCircuitBreaker } from './circuitBreaker';
import { userQueueManager } from './userQueueManager';
import { semanticCache } from './semanticCache';
import { inputGatingService } from './inputGating';
import { normalizeAnswer } from '../utils/answerNormalization';
import { voiceIntegration } from '../modules/voiceIntegration';
import { guardrails } from './guardrails';
import { answerChecker } from './answerChecker';
import { getTutorMindPrompt } from '../prompts/tutorMind';
import { processTutorResponse, tutorCore } from './responsePipeline';

// Validate and log API key status on startup
const keyStatus = validateAndLogOpenAIKey();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key",
  organization: process.env.OPENAI_ORG_ID // Optional org ID
});

interface TutorContext {
  userId: string;
  lessonId?: string;
  sessionId?: string;
  energyLevel?: string;
  lessonContext?: LessonContext;
}

interface EnhancedTutorResponse {
  content: string;
  plan?: TutorPlan;
  topic?: string;
  repairMove?: boolean;
  usedFallback?: boolean;
  retryCount?: number;
  tokensUsed?: number;
  model?: string;
  banner?: string;
  queueDepth?: number;
  usedCache?: boolean;
  breakerOpen?: boolean;
}

class OpenAIService {
  private recentResponses: Map<string, string[]> = new Map(); // sessionId -> last 2 responses
  private sessionCounters: Record<string, number> = {};
  private recentFallbacks = new Map<string, string[]>();

  async generateTutorResponse(message: string, context: TutorContext): Promise<string> {
    return this.generateEnhancedTutorResponse(message, context).then(r => r.content);
  }

  // Enhanced conversation response with scalable architecture
  async generateEnhancedTutorResponse(message: string, context: TutorContext, speechData?: { 
    duration?: number; 
    confidence?: number; 
  }): Promise<EnhancedTutorResponse> {
    const startTime = Date.now();
    const model = LLM_CONFIG.model;
    const sessionId = context.sessionId || `${context.userId}-default`;
    const lessonId = context.lessonId || 'general';
    
    // Get user queue for this session (ensures concurrency = 1 per user)
    const userQueue = userQueueManager.getQueue(sessionId);
    
    return userQueue.enqueue(async () => {
      try {
        // Step 1: Input Gating & Validation
        const gatingResult = inputGatingService.validate({
          message,
          speechDuration: speechData?.duration,
          speechConfidence: speechData?.confidence,
          timestamp: Date.now()
        });

        if (!gatingResult.isValid) {
          console.log(`[OpenAI] Input gated: ${gatingResult.reason}`);
          
          return {
            content: "I didn't catch that clearly. Could you please try again?",
            usedFallback: true,
            queueDepth: userQueue.getQueueDepth(),
            banner: "Having trouble understanding - please speak clearly",
            retryCount: 0,
            tokensUsed: 0,
            model,
            breakerOpen: openaiCircuitBreaker.isOpen()
          };
        }

        const normalizedMessage = gatingResult.normalizedInput || message.trim();
        let subject = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';

        // Step 1.5: Early Answer-Checking Gate (Strategic Fix)
        const questionState = conversationManager.getQuestionState(sessionId);
        if (questionState?.expectedAnswer && questionState.currentQuestion) {
          console.log(`[AnswerGate] Checking answer for session ${sessionId}: "${normalizedMessage}"`);
          
          const checkResult = answerChecker.checkAnswer(
            questionState.expectedAnswer,
            normalizedMessage,
            (questionState.questionType === 'open' ? 'short' : questionState.questionType) || 'auto'
          );
          
          let acknowledgmentContent: string;
          
          if (checkResult.ok) {
            // CORRECT ANSWER: Acknowledge + ask next question
            const correctPhrases = [
              "Excellent! That's correct.",
              "Perfect! You got it right.",
              "Great job! That's the right answer.",
              "Well done! Exactly right.",
              "Fantastic! You nailed it."
            ];
            const nextQuestions = this.getNextQuestion(subject, questionState.currentQuestion);
            
            acknowledgmentContent = `${correctPhrases[Math.floor(Math.random() * correctPhrases.length)]} ${nextQuestions.question}`;
            
            // Clear current question and set next question state
            conversationManager.clearQuestionState(sessionId);
            conversationManager.setQuestionState(sessionId, nextQuestions.question, nextQuestions.expectedAnswer, nextQuestions.questionType, nextQuestions.options);
            
          } else {
            // INCORRECT ANSWER: Provide correction + ask follow-up
            const followUpQuestion = this.getFollowUpQuestion(subject, questionState.currentQuestion);
            acknowledgmentContent = checkResult.msg;
            
            // CRITICAL: Set follow-up question state before returning (fix for multi-turn remediation)
            conversationManager.clearQuestionState(sessionId);
            const followUpData = this.parseQuestionForStorage(followUpQuestion, subject);
            if (followUpData.expectedAnswer !== 'unknown') {
              conversationManager.setQuestionState(sessionId, followUpQuestion, followUpData.expectedAnswer, followUpData.questionType, followUpData.options);
            }
          }
          
          console.log(`[AnswerGate] ${checkResult.ok ? 'CORRECT' : 'INCORRECT'} answer processed`);
          
          // Apply guardrails to acknowledgment content with subject context
          acknowledgmentContent = guardrails.sanitizeTutorQuestion(acknowledgmentContent);
          acknowledgmentContent = guardrails.avoidRepeat(sessionId, acknowledgmentContent, subject);
          acknowledgmentContent = guardrails.enforceFormat(acknowledgmentContent);
          
          return {
            content: acknowledgmentContent,
            plan: {
              goal: checkResult.ok ? 'Acknowledge correct answer and continue' : 'Correct wrong answer and reteach',
              plan: [checkResult.ok ? 'Acknowledge success' : 'Provide correction', 'Ask next question'],
              next_prompt: acknowledgmentContent
            },
            topic: subject,
            repairMove: !checkResult.ok,
            usedFallback: false,
            queueDepth: userQueue.getQueueDepth(),
            retryCount: 0,
            tokensUsed: 0,
            model: 'answer-acknowledgment-gate',
            banner: checkResult.ok ? 'Correct answer acknowledged' : 'Incorrect answer corrected',
            usedCache: false,
            breakerOpen: false
          };
        }

        // Step 2: Semantic Cache Check
        const cacheResult = semanticCache.get(lessonId, normalizedMessage);
        if (cacheResult) {
          console.log(`[OpenAI] Cache hit for lesson: ${lessonId}`);
          
          return {
            content: cacheResult.content,
            usedCache: true,
            queueDepth: userQueue.getQueueDepth(),
            retryCount: 0,
            tokensUsed: 0,
            model,
            breakerOpen: openaiCircuitBreaker.isOpen()
          };
        }

        // Step 3: Circuit Breaker Check
        if (openaiCircuitBreaker.isOpen()) {
          console.log(`[OpenAI] Circuit breaker open - using fallback`);
          
          const fallbackResult = this.getLessonSpecificFallback(subject, normalizedMessage, sessionId);
          
          return {
            content: fallbackResult.content,
            usedFallback: true,
            breakerOpen: true,
            queueDepth: userQueue.getQueueDepth(),
            banner: fallbackResult.banner || "High traffic—using quick tips",
            retryCount: 0,
            tokensUsed: 0,
            model
          };
        }

        // Step 4: Load lesson context and prepare system prompt
        if (context.lessonId && !context.lessonContext) {
          context.lessonContext = await lessonService.getLessonContext(context.lessonId) || undefined;
        }

        // Use TutorCore system prompt for consistent behavior
        const lessonPlan = {
          subject,
          topic: context.lessonContext?.title || 'general learning',
          currentStep: 'introduction', // Default step
          content: {}, // Default content
          objectives: context.lessonContext?.objectives,
          keyTerms: context.lessonContext?.keyTerms
        };

        // Classify topic for confidence checking
        const topicClassification = topicRouter.classifyTopic(normalizedMessage);

        // TOPIC GUARD: Check if user input is off-topic from current lesson
        const topicGuardResult = this.checkTopicGuard(normalizedMessage, context, topicClassification);
        if (topicGuardResult.isOffTopic) {
          console.log(`[OpenAI] Topic guard triggered: ${topicGuardResult.reason}`);
          
          return {
            content: topicGuardResult.redirectMessage,
            topic: topicClassification.topic,
            repairMove: true,
            usedFallback: false,
            usedCache: false,
            breakerOpen: false,
            queueDepth: userQueue.getQueueDepth(),
            banner: topicGuardResult.banner,
            retryCount: 0,
            tokensUsed: 0,
            model
          };
        }

        // Build complete system prompt using TutorCore
        const systemPrompt = tutorCore.getSystemPrompt(lessonPlan);

        const debugMode = process.env.DEBUG_TUTOR === '1';
        if (debugMode) {
          console.log(`[OpenAI DEBUG] User input: "${normalizedMessage}" (${normalizedMessage.length} chars)`);
          console.log(`[OpenAI DEBUG] Lesson: ${context.lessonId}, Subject: ${context.lessonContext?.subject}`);
          console.log(`[OpenAI DEBUG] Topic: ${topicClassification.topic}, Confidence: ${topicClassification.confidence}`);
        }

        // Step 5: Circuit-breaker protected OpenAI call
        const retryResult = await openaiCircuitBreaker.execute(async () => {
          return await retryOpenAICall(async () => {
            // Apply guardrails to prevent user fabrication
            const rawMessages = [
              { role: "system", content: systemPrompt },
              { role: "user", content: normalizedMessage }
            ];
            const filteredMessages = guardrails.preventUserFabrication(rawMessages) as any[];
            
            return await openai.chat.completions.create({
              model,
              messages: filteredMessages,
              temperature: LLM_CONFIG.temperature,
              max_tokens: LLM_CONFIG.maxTokens,
              top_p: LLM_CONFIG.topP,
              presence_penalty: LLM_CONFIG.presencePenalty,
              tools: [TUTOR_PLAN_SCHEMA],
              tool_choice: { type: "function", function: { name: "tutor_plan" } }
            });
          }, VOICE_RETRY_CONFIG, (retryContext) => {
            console.log(`[OpenAI] Retry ${retryContext.attempt}/${retryContext.totalAttempts} after:`, retryContext.lastError?.message);
          }, 3000); // 3 second timeout for voice interactions
        });
        
        // Handle retry result
        if (retryResult.usedFallback || !retryResult.result) {
          const fallbackResult = this.getLessonSpecificFallback(subject, normalizedMessage, sessionId);
          
          return {
            content: fallbackResult.content,
            topic: topicClassification.topic,
            repairMove: false,
            usedFallback: true,
            retryCount: retryResult.retryCount,
            tokensUsed: 0,
            model,
            banner: fallbackResult.banner || "Using local responses during high traffic",
            queueDepth: userQueue.getQueueDepth(),
            breakerOpen: openaiCircuitBreaker.isOpen()
          };
        }

        const completion = retryResult.result;
        const tokensUsed = completion.usage?.total_tokens || 0;
        
        // Extract content and plan from the response
        let rawContent = completion.choices[0].message.content || '';
        let plan: TutorPlan | undefined;

        // Check if the model used the tutor_plan tool
        const toolCalls = completion.choices[0].message.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          const tutorPlanCall = toolCalls.find((tc: any) => tc.function?.name === 'tutor_plan');
          if (tutorPlanCall) {
            try {
              const planData = JSON.parse(tutorPlanCall.function.arguments);
              plan = {
                goal: planData.goal,
                plan: planData.plan,
                next_prompt: planData.next_prompt,
                followup_options: planData.followup_options
              };
              
              // Use only the next_prompt as the spoken content
              rawContent = this.enforceConcisenessAndQuestion(plan.next_prompt);
              
              // Store plan in conversation manager
              if (context.sessionId) {
                conversationManager.addPlan(context.sessionId, plan);
              }
            } catch (error) {
              console.warn('[OpenAI] Failed to parse tutor_plan tool call:', error);
            }
          }
        }

        // Step 6: Anti-repeat & coherence check
        const deduplicatedContent = this.checkAndHandleRepeat(rawContent, context.sessionId, subject, lessonId);
        let content = deduplicatedContent.content;
        const wasRepeated = deduplicatedContent.wasRepeated;

        // Answer checking handled by early gate - this is legacy

        // Step 7: Cache the successful response (only if not repeated)
        if (!wasRepeated) {
          semanticCache.set(lessonId, normalizedMessage, content, subject);
        }

        const finalResponse: EnhancedTutorResponse = {
          content,
          plan,
          topic: topicClassification.topic,
          repairMove: topicClassification.confidence < 0.4 || wasRepeated,
          usedFallback: false,
          usedCache: false,
          breakerOpen: false,
          queueDepth: userQueue.getQueueDepth(),
          retryCount: 0,
          tokensUsed,
          model,
          banner: wasRepeated ? "Generating fresh response" : undefined
        };

        // --- TutorMind post-processing (inclusive + corrections + format) ---
        let finalResponseContent = guardrails.sanitizeTutorQuestion(content);        // inclusive rephrase
        finalResponseContent = guardrails.avoidRepeat(sessionId, finalResponseContent, subject);      // anti-repeat with subject context
        // Answer correction checking - using context if available
        if (context?.lessonContext && normalizedMessage) {
          // For now, skip answer checking as lessonContext properties need to be properly defined
          // This will be handled by the early answer gate system
        }
        content = guardrails.enforceFormat(finalResponseContent);               // ≤2 sentences, ends with '?'
        
        // Update final response with guardrail-processed content
        finalResponse.content = content;

        // Store question state if response contains a question (CRITICAL for answer acknowledgment)  
        const responseSubject = subject;
        if (context.sessionId && content.includes('?')) {
          this.storeQuestionInConversation(content, responseSubject, context.sessionId);
        }

        // Debug logging with scalability metrics
        this.logEnhancedDebugInfo({
          context,
          userInput: normalizedMessage,
          response: finalResponse,
          startTime,
          speechDuration: speechData?.duration,
          speechConfidence: speechData?.confidence
        });

        return finalResponse;

      } catch (error: any) {
        console.error("[OpenAI] generateEnhancedTutorResponse error:", error);
        
        // Use fallback for errors
        const errorSubjectFallback = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';
        const fallbackResult = this.getLessonSpecificFallback(errorSubjectFallback, message, sessionId);
        
        const errorResponse: EnhancedTutorResponse = {
          content: fallbackResult.content,
          usedFallback: true,
          banner: error.message?.includes('429') ? 
            "Service at capacity - using practice mode" : 
            fallbackResult.banner,
          queueDepth: userQueue.getQueueDepth(),
          retryCount: 0,
          tokensUsed: 0,
          model,
          breakerOpen: openaiCircuitBreaker.isOpen()
        };

        // Apply guardrails to error response content with subject context
        const errorResponseSubject = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';
        errorResponse.content = guardrails.sanitizeTutorQuestion(errorResponse.content);
        errorResponse.content = guardrails.avoidRepeat(context.sessionId || sessionId, errorResponse.content, errorResponseSubject);
        errorResponse.content = guardrails.enforceFormat(errorResponse.content);

        // Store question state if fallback response contains a question
        const errorSubject = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';
        if (context.sessionId && errorResponse.content.includes('?')) {
          this.storeQuestionInConversation(errorResponse.content, errorSubject, context.sessionId);
        }

        // Log error details
        this.logEnhancedDebugInfo({
          context,
          userInput: message,
          response: errorResponse,
          startTime,
          speechDuration: speechData?.duration,
          speechConfidence: speechData?.confidence,
          error: error.message
        });

        return errorResponse;
      }
    });
  }

  // Check if user is going off-topic
  private checkTopicGuard(message: string, context: TutorContext, topicClassification: ReturnType<typeof topicRouter.classifyTopic>): {
    isOffTopic: boolean;
    redirectMessage: string;
    reason?: string;
    banner?: string;
  } {
    const { lessonContext } = context;
    if (!lessonContext) {
      return { isOffTopic: false, redirectMessage: '' };
    }

    const messageWords = message.toLowerCase().split(/\s+/);
    const lessonKeywords = [...lessonContext.keyTerms, lessonContext.title, lessonContext.subject]
      .map(k => k.toLowerCase());

    // Check if message has ANY connection to lesson
    const hasLessonConnection = messageWords.some(word => 
      lessonKeywords.some(keyword => keyword.includes(word) || word.includes(keyword))
    );

    // Allow meta-questions about lessons or general learning
    const isMetaQuestion = /\b(lesson|learn|teach|help|explain|understand|confused)\b/i.test(message);

    // Detect clear off-topic patterns
    const clearlyOffTopic = [
      /\b(minecraft|fortnite|roblox|youtube|tiktok)\b/i,
      /\b(pizza|burger|ice cream|candy|chocolate)\b/i,
      /\b(movie|cartoon|tv show|netflix)\b/i
    ].some(pattern => pattern.test(message));

    if (clearlyOffTopic && !hasLessonConnection && !isMetaQuestion) {
      const subject = lessonContext.subject;
      const title = lessonContext.title;
      
      return {
        isOffTopic: true,
        reason: 'Completely unrelated to current lesson',
        redirectMessage: `That's interesting, but we're learning about ${title} right now! Would you like to continue with ${subject}, or should we switch to a different lesson?`,
        banner: `Off-topic detected - redirecting to ${subject}`
      };
    }

    return { isOffTopic: false, redirectMessage: '' };
  }

  // Check for repeated responses and generate alternatives
  private checkAndHandleRepeat(content: string, sessionId?: string, subject?: string, lessonId?: string): {
    content: string;
    wasRepeated: boolean;
  } {
    if (!sessionId) {
      return { content, wasRepeated: false };
    }

    const recentResponses = this.recentResponses.get(sessionId) || [];
    
    // Check if this response is too similar to recent ones
    const normalizedContent = this.normalizeResponseForComparison(content);
    const isRepeat = recentResponses.some(recent => {
      const normalizedRecent = this.normalizeResponseForComparison(recent);
      return normalizedRecent === normalizedContent || 
             this.calculateSimilarity(normalizedContent, normalizedRecent) > 0.8;
    });

    if (isRepeat) {
      console.log(`[OpenAI] Detected repeat response for session ${sessionId}, generating alternative`);
      
      // Generate alternative response
      const alternativeContent = this.generateAlternativeResponse(subject, lessonId, sessionId);
      
      // If even the alternative is a repeat (rare), generate a completely different response
      const normalizedAlt = this.normalizeResponseForComparison(alternativeContent);
      const altIsRepeat = recentResponses.some(recent => {
        const normalizedRecent = this.normalizeResponseForComparison(recent);
        return normalizedRecent === normalizedAlt;
      });

      const finalContent = altIsRepeat ? 
        this.generateFallbackVariation(subject, lessonId) : 
        alternativeContent;

      // Update recent responses with the new content
      this.updateRecentResponses(sessionId, finalContent);
      
      return { content: finalContent, wasRepeated: true };
    }

    // Not a repeat, track this response
    this.updateRecentResponses(sessionId, content);
    
    return { content, wasRepeated: false };
  }

  // Calculate similarity between two strings (simple Jaccard similarity)
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = words1.filter(x => set2.has(x));
    const union = new Set(words1.concat(words2));
    
    return union.size === 0 ? 0 : intersection.length / union.size;
  }

  // Normalize response for comparison (remove punctuation, extra spaces, etc.)
  private normalizeResponseForComparison(response: string): string {
    return response
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')     // Normalize spaces
      .trim();
  }

  // Update recent responses, keeping only last 2
  private updateRecentResponses(sessionId: string, response: string): void {
    const responses = this.recentResponses.get(sessionId) || [];
    responses.push(response);
    
    // Keep only last 2 responses
    if (responses.length > 2) {
      responses.shift();
    }
    
    this.recentResponses.set(sessionId, responses);
  }

  // Generate alternative response tied to lesson step
  private generateAlternativeResponse(subject?: string, lessonId?: string, sessionId?: string): string {
    const alternatives: Record<string, string[]> = {
      math: [
        "Let me approach this differently. What's the first step you'd take here?",
        "Good point! Let's try a new way. Can you show me your thinking?",
        "I see what you mean. How about we solve this together step by step?",
        "That's interesting! What patterns do you notice in this problem?"
      ],
      english: [
        "Let me rephrase that. What do you think this word means in context?",
        "Good observation! How would you describe this in your own words?",
        "I understand. Can you give me an example of what you're thinking?",
        "That's a great question! What clues can you find in the text?"
      ],
      spanish: [
        "¡Perfecto! Let me ask this another way. ¿Cómo se dice en español?",
        "Muy bien! Can you try using that word in a sentence?",
        "¡Excelente! What other Spanish words do you remember?",
        "¡Buena pregunta! How would you greet someone in Spanish?"
      ],
      general: [
        "Let me try a different approach. What interests you most about this topic?",
        "Good thinking! Can you tell me more about what you already know?",
        "I see your point. What would you like to explore first?",
        "That's a thoughtful question! What examples can you think of?"
      ]
    };

    const subjectKey = subject?.toLowerCase() || 'general';
    const responses = alternatives[subjectKey] || alternatives.general;
    
    // Use simple rotation to avoid immediate repeats
    const sessionKey = `alt_${sessionId}_${subjectKey}`;
    const counter = this.getSessionCounter(sessionKey);
    
    return responses[counter % responses.length];
  }

  // Generate fallback variation when even alternatives repeat
  private generateFallbackVariation(subject?: string, lessonId?: string): string {
    const timestamp = new Date().toLocaleTimeString();
    const variations = [
      `I want to make sure I'm helping effectively. What specific part would you like to focus on?`,
      `Let me pause and ask - what's the most important thing for you to understand right now?`,
      `I'd like to help you in the best way possible. What would be most useful for you?`,
      `Let's make sure we're on the right track. What questions do you have about this topic?`
    ];
    
    return variations[Math.floor(Math.random() * variations.length)];
  }

  // Get session counter for rotation
  private getSessionCounter(key: string): number {
    if (!this.sessionCounters[key]) {
      this.sessionCounters[key] = 0;
    }
    return this.sessionCounters[key]++;
  }

  private enforceConcisenessAndQuestion(text: string): string {
    const sentences = splitIntoSentences(text);
    let result = sentences.slice(0, 2).join(' ');
    result = ensureEndsWithQuestion(result);
    return result;
  }
  
  // Enhanced debug logging with scalability metrics
  private logEnhancedDebugInfo(data: {
    context: TutorContext;
    userInput: string;
    response: EnhancedTutorResponse;
    startTime: number;
    speechDuration?: number;
    speechConfidence?: number;
    error?: string;
  }) {
    const { context, userInput, response, startTime, speechDuration, speechConfidence, error } = data;
    
    // Always log to debug logger
    debugLogger.logTurn({
      lessonId: context.lessonId || 'general',
      subject: context.lessonContext?.subject || 'general',
      userInput,
      tutorResponse: response.content,
      usedFallback: response.usedFallback || false,
      retryCount: response.retryCount || 0,
      asrGated: false,
      durationMs: Date.now() - startTime,
      tokensUsed: response.tokensUsed || 0,
      speechDuration,
      speechConfidence,
      error
    });
    
    // Debug mode logging (when DEBUG_TUTOR=1) with scalability metrics
    if (process.env.DEBUG_TUTOR === '1') {
      const orgId = getRedactedOrgId();
      const queueMetrics = userQueueManager.getGlobalMetrics();
      const cacheMetrics = semanticCache.getMetrics();
      const circuitMetrics = openaiCircuitBreaker.getMetrics();
      
      console.log(`[OpenAI DEBUG] ${JSON.stringify({
        lessonId: context.lessonId || 'general',
        usedRealtime: false, // Will be true when Realtime API is implemented
        queueDepth: response.queueDepth || 0,
        retryCount: response.retryCount || 0,
        breakerOpen: response.breakerOpen || false,
        usedCache: response.usedCache || false,
        usedFallback: response.usedFallback || false,
        tokens: response.tokensUsed || 0,
        latencyMs: Date.now() - startTime,
        orgId,
        model: response.model,
        globalQueues: queueMetrics.activeSessions,
        cacheHitRate: cacheMetrics.hitRate.toFixed(1),
        circuitState: circuitMetrics.state
      })}`);
    }
  }

  // Enhanced voice conversation method with streaming support
  async generateVoiceResponse(message: string, context: TutorContext): Promise<{ content: string; chunks: string[] }> {
    try {
      const enhancedResponse = await this.generateEnhancedTutorResponse(message, context);
      const content = enhancedResponse.content;
      // Split into sentences for streaming TTS
      const chunks = splitIntoSentences(content);
      
      console.log(`[OpenAI] Voice response generated: ${content}`);
      console.log(`[OpenAI] Split into ${chunks.length} chunks for streaming TTS`);
      
      return { content, chunks };
    } catch (error) {
      console.error("Error generating voice response:", error);
      throw new Error("Failed to generate voice response from AI tutor");
    }
  }

  async generateLessonContent(topic: string, difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<any> {
    try {
      const prompt = `Create a comprehensive lesson plan for "${topic}" at ${difficulty} level. Include learning objectives, key concepts, examples, and quiz questions. Format the response as JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert educational content creator. Generate structured lesson content in JSON format." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || "{}");
    } catch (error) {
      console.error("Error generating lesson content:", error);
      throw new Error("Failed to generate lesson content");
    }
  }

  async provideSocraticGuidance(studentQuestion: string, lessonTopic: string): Promise<string> {
    try {
      const prompt = `The student is learning about "${lessonTopic}" and asked: "${studentQuestion}". Provide Socratic guidance by asking leading questions that help them discover the answer themselves. Don't give the direct answer.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a Socratic tutor. Guide students to discover answers through thoughtful questions rather than direct instruction. Be encouraging and patient."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return response.choices[0].message.content || "What do you think might be the first step to solve this?";
    } catch (error) {
      console.error("Error providing Socratic guidance:", error);
      throw new Error("Failed to provide guidance");
    }
  }

  async generateQuizFeedback(question: string, userAnswer: string, correctAnswer: string): Promise<string> {
    try {
      const prompt = `Question: "${question}"\nUser's answer: "${userAnswer}"\nCorrect answer: "${correctAnswer}"\n\nProvide encouraging feedback that explains why the correct answer is right and helps the student understand their mistake if they got it wrong.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a supportive tutor providing quiz feedback. Be encouraging and educational, focusing on learning rather than just correctness."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 200,
      });

      return response.choices[0].message.content || "Great effort! Let's review this concept together.";
    } catch (error) {
      console.error("Error generating quiz feedback:", error);
      throw new Error("Failed to generate feedback");
    }
  }

  private buildSystemPrompt(context: TutorContext): string {
    return `You are a friendly, patient AI tutor specializing in Math, English, and Spanish for students of all ages. Your teaching philosophy emphasizes:

1. Socratic Method: Guide students to discover answers through questions rather than giving direct answers immediately
2. Encouragement: Always be positive and supportive, celebrating progress and effort
3. Adaptation: Adjust your language and complexity based on the student's responses
4. Bilingual Support: For Spanish lessons, incorporate both English and Spanish as appropriate
5. Multiple Learning Styles: Use visual descriptions, analogies, and step-by-step breakdowns

Current context:
- User ID: ${context.userId}
- Lesson: ${context.lessonId || 'General conversation'}
- Session: ${context.sessionId || 'New session'}

Key guidelines:
- Ask leading questions before providing answers
- Use encouraging language ("Great thinking!", "You're on the right track!")
- Break complex concepts into smaller steps
- Provide hints rather than solutions when students are stuck
- Celebrate mistakes as learning opportunities
- Keep responses concise but comprehensive (under 150 words typically)

Remember: You're not just teaching facts, you're building confidence and curiosity!`;
  }
  
  // Enhanced fallback with conversation context and answer checking
  private getLessonSpecificFallback(subject: string, userInput?: string, sessionId?: string): { content: string; banner?: string } {
    // Check for recent fallbacks to avoid repetition
    const recentKey = `recent_fallbacks_${sessionId || 'default'}`;
    const recentFallbacks = this.recentFallbacks.get(recentKey) || [];
    
    // First, check if this is an answer to a previous question and provide correction
    const answerCheckResponse = this.checkAndCorrectAnswer(userInput || '', subject, sessionId);
    if (answerCheckResponse) {
      this.trackRecentFallback(recentKey, answerCheckResponse);
      return {
        content: answerCheckResponse,
        banner: "Teaching and correcting locally"
      };
    }
    
    // Contextual responses based on user input
    const contextualResponses = this.getContextualResponse(userInput || '', subject);
    if (contextualResponses.length > 0) {
      const availableResponses = contextualResponses.filter(r => !recentFallbacks.includes(r));
      if (availableResponses.length > 0) {
        const selected = availableResponses[Math.floor(Math.random() * availableResponses.length)];
        this.trackRecentFallback(recentKey, selected);
        return {
          content: selected,
          banner: "I'm having trouble connecting to my AI assistant right now, but I can still help you learn!"
        };
      }
    }
    
    // Store any questions we're about to ask
    const selectedResponse = this.getSelectedFallback(subject, recentFallbacks, sessionId);
    this.storeQuestionFromResponse(selectedResponse, subject, sessionId);
    
    return {
      content: selectedResponse,
      banner: "I'm experiencing connection issues but can still help you learn!"
    };
  }
  
  private getSelectedFallback(subject: string, recentFallbacks: string[], sessionId?: string): string {
    // Enhanced educational fallbacks that actually teach lesson content
    const fallbacks: Record<string, string[]> = {
      math: [
        "Let's work through this step by step. What number comes after 2?",
        "Let's learn addition! When we add 2 + 3, we count: 2, then 3 more makes 5. What's 4 + 2?",
        "Here's how subtraction works: If you have 8 cookies and eat 3, you have 5 left. What's 7 - 2?",
        "Multiplication is repeated addition! 3 × 2 means 3 + 3, which equals 6. Can you try 2 × 4?",
        "Let's count by tens: 10, 20, 30, 40... What number comes next?",
        "Division means sharing equally. If 10 apples are shared by 2 people, each gets 5. How about 12 ÷ 3?",
        "Even numbers can be divided by 2: like 2, 4, 6, 8. Is 9 an even number?",
        "Place value helps us understand numbers! In 47, the 4 means 40 and 7 means 7. What's in the tens place of 83?",
        "Fractions show parts of a whole. Half of a pizza is written as 1/2. What's half of 8?",
        "Let's practice skip counting by 5s: 5, 10, 15, 20... Can you continue the pattern?"
      ],
      english: [
        "Nouns name people, places, or things. 'Dog', 'school', and 'happiness' are nouns. Can you give me another noun?",
        "Verbs show action! Words like 'run', 'think', and 'smile' are verbs. What verb describes what birds do?",
        "Adjectives describe nouns. 'Blue sky' uses 'blue' as an adjective. How would you describe a tree?",
        "Every sentence needs a subject and verb. 'The cat sleeps' has both. Can you make a sentence about a dog?",
        "Rhyming words sound alike at the end: cat, bat, hat. What rhymes with 'sun'?",
        "Plural means more than one. We add 's' to most words: one cat, two cats. What's the plural of 'book'?",
        "Capital letters start sentences and names. 'Sarah went to Paris.' Where else do we use capitals?",
        "Synonyms are words with similar meanings. 'Big' and 'large' are synonyms. What's another word for 'happy'?",
        "A paragraph groups related sentences together. Each one has a main idea. What makes a good topic sentence?"
      ],
      spanish: [
        "Basic greetings: 'Hola' means hello, 'Adiós' means goodbye. How do you say 'please' in Spanish? (It's 'por favor')",
        "Spanish colors: rojo (red), azul (blue), verde (green), amarillo (yellow). What color is 'blanco'?",
        "Count in Spanish: uno, dos, tres, cuatro, cinco. What number comes after 'cinco'?",
        "Family words: madre (mother), padre (father), hermano (brother). How do you say 'sister'? (hermana)",
        "Days of the week: lunes (Monday), martes (Tuesday), miércoles (Wednesday). What day is 'viernes'?",
        "Common phrases: '¿Cómo te llamas?' means 'What's your name?' How do you answer 'Me llamo...'?",
        "Food vocabulary: pan (bread), agua (water), leche (milk). What do you think 'manzana' means? (apple)",
        "Spanish articles: 'el' and 'la' mean 'the'. 'El niño' (the boy), 'la niña' (the girl). Which one goes with 'libro'?",
        "Present tense: 'Yo hablo' means 'I speak', 'Tú hablas' means 'You speak'. How would you say 'He speaks'? (Él habla)"
      ],
      general: [
        "Let's focus on your current lesson topic. What specific concept would you like me to explain?",
        "Breaking down complex ideas: Start with the basics, then build up. What's the first thing you need to understand?",
        "Practice makes perfect! Let's work through an example together. What problem are you trying to solve?",
        "Understanding comes from connecting ideas. How does this relate to what you already know?",
        "Learning happens step by step. We've covered the introduction - shall we move to the main concepts?"
      ]
    };
    
    const responses = fallbacks[subject] || fallbacks.general;
    const availableResponses = responses.filter(r => !recentFallbacks.includes(r));
    
    let selectedResponse: string;
    if (availableResponses.length === 0) {
      // Reset and select from all responses
      selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    } else {
      selectedResponse = availableResponses[Math.floor(Math.random() * availableResponses.length)];
    }
    
    return selectedResponse;
  }
  
  // Check and correct user answers based on previous questions
  private lastAskedQuestions = new Map<string, { question: string; expectedAnswer: string; subject: string }>();
  
  private checkAndCorrectAnswer(userInput: string, subject: string, sessionId?: string): string | null {
    if (!sessionId || !userInput) return null;
    
    const lastQuestion = this.lastAskedQuestions.get(sessionId);
    if (!lastQuestion) {
      // Store questions when we ask them
      this.storeQuestionFromResponse(userInput, subject, sessionId);
      return null;
    }
    
    // Use advanced answer normalization and comparison
    const answerType = subject === 'math' ? 'math' : 
                      /^[a-d]$/i.test(lastQuestion.expectedAnswer.trim()) ? 'mcq' : 'text';
    
    // Use answerChecker instead
    const checkResult = answerChecker.checkAnswer(lastQuestion.expectedAnswer, userInput, answerType as any);
    
    // Log telemetry when DEBUG_TUTOR=1
    if (process.env.DEBUG_TUTOR === '1') {
      console.log(`[Answer Check] User: "${userInput}" vs Expected: "${lastQuestion.expectedAnswer}" | Correct: ${checkResult.ok}`);
    }
    
    // Check if the answer is correct  
    if (checkResult.ok) {
      // Correct answer - provide positive feedback and next question
      this.lastAskedQuestions.delete(sessionId); // Clear the question
      
      if (subject === 'math') {
        return "Excellent! That's correct. Now let's try something a bit harder. What's 3 + 2?";
      } else if (subject === 'english') {
        return "Perfect! You got it right. Now, can you think of a word that rhymes with 'cat'?";
      } else if (subject === 'spanish') {
        return "¡Muy bien! That's right! Now, how do you say 'thank you' in Spanish?";
      }
      return "Great job! That's the right answer. Let's move on to the next question.";
    } else {
      // Incorrect answer - provide correction and teaching with anti-repetition
      this.lastAskedQuestions.delete(sessionId); // Clear the question
      
      // Check for recent corrections to avoid repetition
      const recentKey = `recent_corrections_${sessionId || 'default'}`;
      const recentCorrections = this.recentFallbacks.get(recentKey) || [];
      
      let correctionResponse = '';
      
      // Provide specific corrections based on the question with templated hints
      if (lastQuestion.question.includes("comes after 2")) {
        const corrections = [
          `Not quite - 3 comes after 2. When we count: 1, 2, 3, 4. See how 3 is right after 2? Now you try: What comes after 5?`,
          `Think about counting in order. After 2 comes... 3! Like this: 1, 2, 3. What number comes after 4?`,
          `Let's count step by step: 1... 2... then 3! So 3 comes after 2. Can you tell me what comes after 6?`
        ];
        correctionResponse = this.selectNonRecentResponse(corrections, recentCorrections);
      } else if (lastQuestion.question.includes("2 + 3") || lastQuestion.question.includes("2 plus 3")) {
        const corrections = [
          `Let me help! 2 + 3 = 5. We start with 2 and add 3 more: 2, 3, 4, 5. So the answer is 5. Can you try 3 + 1?`,
          `Addition means combining! 2 + 3 means put 2 and 3 together to get 5. What's 1 + 4?`,
          `Let's count it out: Start at 2, then count 3 more... 3, 4, 5! So 2 + 3 = 5. Try 4 + 1!`
        ];
        correctionResponse = this.selectNonRecentResponse(corrections, recentCorrections);
      } else if (lastQuestion.question.includes("count from 1 to 5")) {
        const corrections = [
          `Good try! Let's count together: 1, 2, 3, 4, 5. Notice how we say each number in order. Can you try counting from 1 to 3?`,
          `Counting is fun! Here's how: 1... 2... 3... 4... 5! Each number comes next in order. Count from 6 to 8!`,
          `Let's practice: 1 is first, then 2, then 3, then 4, then 5! Try counting from 2 to 4!`
        ];
        correctionResponse = this.selectNonRecentResponse(corrections, recentCorrections);
      } else if (lastQuestion.question.includes("4 + 2")) {
        const corrections = [
          `Let's work it out: 4 + 2 = 6. Start at 4 and count 2 more: 5, 6. The answer is 6! Now try: What's 2 + 2?`,
          `Addition time! 4 + 2 means 4 plus 2 more makes 6. Can you solve 3 + 3?`,
          `Think: 4 cookies plus 2 more cookies equals 6 cookies total! What's 5 + 1?`
        ];
        correctionResponse = this.selectNonRecentResponse(corrections, recentCorrections);
      }
      
      // Generic correction with variety if no specific correction found
      if (!correctionResponse) {
        const genericCorrections = [
          `That's not quite right. The answer is ${lastQuestion.expectedAnswer}. Let me explain why, then we'll try another one. Ready?`,
          `Good effort! The correct answer is ${lastQuestion.expectedAnswer}. Here's why that works. Shall we practice more?`,
          `Nice try! Actually, it's ${lastQuestion.expectedAnswer}. Let me show you the thinking behind it. Want to try again?`
        ];
        correctionResponse = this.selectNonRecentResponse(genericCorrections, recentCorrections);
      }
      
      // Track this correction to avoid repetition
      this.trackRecentFallback(recentKey, correctionResponse);
      
      return correctionResponse;
    }
  }
  
  private storeQuestionFromResponse(response: string, subject: string, sessionId?: string) {
    if (!sessionId) return;
    
    // Parse common question patterns and store expected answers
    const responseL = response.toLowerCase();
    
    if (responseL.includes("what comes after 2") || responseL.includes("what number comes after 2")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "what comes after 2", 
        expectedAnswer: "3",
        subject 
      });
    } else if (responseL.includes("what's 2 + 3") || responseL.includes("2 plus 3")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "2 + 3", 
        expectedAnswer: "5",
        subject 
      });
    } else if (responseL.includes("what's 4 + 2") || responseL.includes("4 plus 2")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "4 + 2", 
        expectedAnswer: "6",
        subject 
      });
    } else if (responseL.includes("count from 1 to 5")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "count from 1 to 5", 
        expectedAnswer: "1 2 3 4 5",
        subject 
      });
    } else if (responseL.includes("what's 3 + 2") || responseL.includes("3 plus 2")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "3 + 2", 
        expectedAnswer: "5",
        subject 
      });
    } else if (responseL.includes("what's 5 + 3") || responseL.includes("5 plus 3")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "5 + 3", 
        expectedAnswer: "8",
        subject 
      });
    } else if (responseL.includes("what's 7 - 2") || responseL.includes("7 minus 2")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "7 - 2", 
        expectedAnswer: "5",
        subject 
      });
    } else if (responseL.includes("count to 10")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "count to 10", 
        expectedAnswer: "1 2 3 4 5 6 7 8 9 10",
        subject 
      });
    } else if (responseL.includes("what rhymes with 'sun'")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "rhymes with sun", 
        expectedAnswer: "run",
        subject 
      });
    } else if (responseL.includes("how do you say 'hello' in spanish")) {
      this.lastAskedQuestions.set(sessionId, { 
        question: "hello in spanish", 
        expectedAnswer: "hola",
        subject 
      });
    }
  }
  
  // Track recent fallbacks to avoid repetition
  private trackRecentFallback(key: string, response: string) {
    const recent = this.recentFallbacks.get(key) || [];
    recent.push(response);
    // Keep only last 3 responses
    if (recent.length > 3) {
      recent.shift();
    }
    this.recentFallbacks.set(key, recent);
  }
  
  // Select a response not recently used for anti-repetition
  private selectNonRecentResponse(responses: string[], recentResponses: string[]): string {
    const availableResponses = responses.filter(r => !recentResponses.includes(r));
    if (availableResponses.length > 0) {
      return availableResponses[Math.floor(Math.random() * availableResponses.length)];
    }
    // If all were recently used, pick randomly
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Generate contextual responses based on user input
  private getContextualResponse(userInput: string = '', subject: string): string[] {
    const input = userInput.toLowerCase();
    
    // Handle complaints about slow responses or issues
    if (input.includes('taking too long') || input.includes('slow') || input.includes('issue') || input.includes('problem')) {
      if (subject === 'math') {
        return [
          "While the system loads, let's learn! Addition tip: To add 7 + 5, think of it as 7 + 3 + 2 = 10 + 2 = 12. Can you try 8 + 6?",
          "Connection is slow, but learning isn't! Quick fact: Multiplying by 10 just adds a zero. So 4 × 10 = 40. What's 7 × 10?"
        ];
      }
      return [
        "I understand the wait is frustrating. Let me teach you something useful while we connect!",
        "System is loading, but we can still learn! Here's a quick lesson to get us started."
      ];
    }
    
    // Handle direct requests for teaching/learning
    if (input.includes('teach') || input.includes('learn') || input.includes('lesson') || input.includes('start')) {
      if (subject === 'math') {
        return [
          "Let's start your math lesson! Addition is combining numbers. 3 + 4 = 7. Think of it as starting at 3 and counting 4 more. Now try: What's 5 + 2?",
          "Time for math! Subtraction is taking away. If you have 10 apples and eat 3, you have 7 left (10 - 3 = 7). Can you solve 8 - 2?"
        ];
      } else if (subject === 'english') {
        return [
          "Let's learn English! Every sentence needs a subject (who/what) and a verb (action). 'Dogs bark' has both. Can you make a sentence about cats?",
          "English lesson time! Adjectives make writing colorful. Instead of 'The car,' say 'The red car.' How would you describe your favorite food?"
        ];
      } else if (subject === 'spanish') {
        return [
          "¡Vamos! Spanish lesson: 'Hola' (OH-lah) means hello. 'Adiós' (ah-dee-OHS) means goodbye. Can you say 'Hola' to me?",
          "Spanish time! Numbers: uno (1), dos (2), tres (3). Can you count to tres in Spanish?"
        ];
      }
    }
    
    // Number-related responses
    if (input.match(/\d/) || input.includes('count') || input.includes('number')) {
      return [
        "Great job with numbers! Let's practice: 2, 4, 6... what comes next in this pattern?",
        "You're working with numbers! Quick challenge: What's 10 minus 3?",
        "Numbers are fun! If you have 5 apples and get 3 more, how many do you have?"
      ];
    }
    
    // Question words - but make them educational
    if (input.includes('what') || input.includes('why') || input.includes('how')) {
      if (subject === 'math') {
        return [
          "Excellent question! In math, we solve step-by-step. First, what numbers are we working with?",
          "Good thinking! Let's use an example: If 2 + 2 = 4, what do you think 2 + 3 equals?"
        ];
      }
      return [
        "That's a thoughtful question! Let me teach you the concept step by step.",
        "Great question! The answer starts with understanding the basics. Let's begin there."
      ];
    }
    
    // Positive responses with educational follow-up
    if (input.includes('yes') || input.includes('ok') || input.includes('sure') || input.includes('ready')) {
      if (subject === 'math') {
        return [
          "Wonderful! Let's start with addition. 4 + 3 = 7. Your turn: What's 5 + 4?",
          "Great! Here's your first problem: If you have 6 toys and get 2 more, how many do you have?"
        ];
      } else if (subject === 'english') {
        return [
          "Perfect! Let's learn about verbs. They show action like 'run' or 'jump.' Can you name another action word?",
          "Excellent! First lesson: Capital letters start sentences. Write a sentence about your day."
        ];
      } else if (subject === 'spanish') {
        return [
          "¡Sí! Let's learn colors: rojo is red, azul is blue. What color is verde? (Hint: grass)",
          "¡Bueno! Spanish greeting time: 'Buenos días' means good morning. How do you think we say 'good night'?"
        ];
      }
    }
    
    // Confusion or difficulty
    if (input.includes('no') || input.includes('don\'t') || input.includes('hard') || input.includes('difficult')) {
      return [
        "That's okay! Learning takes time. Let's try something easier first.",
        "No worries! Let's break this down into smaller steps.",
        "I understand! Everyone learns at their own pace. What part would you like to review?"
      ];
    }
    
    // Empty responses - don't repeat the same generic phrases
    if (!input || input.length < 3) {
      return [
        "I can see you're thinking about this! What's your next idea?",
        "Take your time! When you're ready, what would you like to explore?",
        "Every student learns differently. How can I best help you understand this?"
      ];
    }
    
    return [];
  }

  // Check topical confidence (used for repair moves)
  checkTopicalConfidence(message: string, lessonContext?: LessonContext): number {
    if (!lessonContext) return 1.0;
    
    const topicClassification = topicRouter.classifyTopic(message);
    
    // Map topic to confidence score
    const confidenceMap: Record<string, number> = {
      'lesson_content': 1.0,
      'related_concept': 0.8,
      'meta_learning': 0.7,
      'off_topic': 0.3,
      'unclear': 0.5
    };
    
    return confidenceMap[topicClassification.topic] || 0.5;
  }

  // Helper methods for answer acknowledgment system
  private getNextQuestion(subject: string, currentQuestion: string): { 
    question: string; 
    expectedAnswer: string; 
    questionType: 'short' | 'mcq' | 'math' | 'open'; 
    options?: string[] 
  } {
    const questionSequences = {
      math: [
        { question: "What comes after 3?", expectedAnswer: "4", questionType: 'short' as const },
        { question: "What's 2 + 2?", expectedAnswer: "4", questionType: 'math' as const },
        { question: "What comes after 5?", expectedAnswer: "6", questionType: 'short' as const },
        { question: "What's 3 + 1?", expectedAnswer: "4", questionType: 'math' as const },
        { question: "What comes after 7?", expectedAnswer: "8", questionType: 'short' as const }
      ],
      english: [
        { question: "What letter comes after B?", expectedAnswer: "C", questionType: 'short' as const },
        { question: "Can you name a word that starts with 'C'?", expectedAnswer: "cat", questionType: 'open' as const },
        { question: "What's the opposite of 'hot'?", expectedAnswer: "cold", questionType: 'short' as const }
      ],
      spanish: [
        { question: "How do you say 'hello' in Spanish?", expectedAnswer: "hola", questionType: 'short' as const },
        { question: "What does 'gracias' mean in English?", expectedAnswer: "thank you", questionType: 'short' as const }
      ]
    };

    const questions = questionSequences[subject as keyof typeof questionSequences] || questionSequences.math;
    return questions[Math.floor(Math.random() * questions.length)];
  }

  private getFollowUpQuestion(subject: string, currentQuestion: string): string {
    const followUps = {
      math: [
        "Let's try a simpler one: What comes after 1?",
        "Let's count together: 1, 2... what comes next?",
        "Think step by step: If we have 1 apple and add 1 more, how many do we have?"
      ],
      english: [
        "Let's try this: What letter comes after A?",
        "Think about the alphabet: A, B... what's next?",
        "Can you name any word that starts with the letter A?"
      ],
      spanish: [
        "Let's start simple: Can you say 'hello' in Spanish?",
        "Think of greeting someone: How do you say 'hi'?",
        "Let's practice: Repeat after me - 'Hola'!"
      ]
    };

    const questions = followUps[subject as keyof typeof followUps] || followUps.math;
    return questions[Math.floor(Math.random() * questions.length)];
  }

  // Method to store question state when tutor asks a question (deterministic and subject-aware)
  private storeQuestionInConversation(response: string, subject: string, sessionId: string): void {
    // Extract question from response (simple pattern matching)
    const questionMatch = response.match(/(.+\?)/);
    if (!questionMatch) return;

    const question = questionMatch[1].trim();
    const questionData = this.parseQuestionForStorage(question, subject);
    
    if (questionData.expectedAnswer !== 'unknown') {
      conversationManager.setQuestionState(sessionId, question, questionData.expectedAnswer, questionData.questionType, questionData.options);
      console.log(`[StoreQuestion] Stored question for session ${sessionId}: "${question}" expects "${questionData.expectedAnswer}"`);
    }
  }

  // Deterministic question parsing for reliable expected answer extraction
  private parseQuestionForStorage(question: string, subject: string): {
    expectedAnswer: string;
    questionType: 'short' | 'mcq' | 'math' | 'open';
    options?: string[];
  } {
    let expectedAnswer = '';
    let questionType: 'short' | 'mcq' | 'math' | 'open' = 'short';
    let options: string[] | undefined;

    // Subject-specific patterns with comprehensive coverage
    if (subject === 'math') {
      // Sequence questions
      if (question.includes('comes after 1')) {
        expectedAnswer = '2';
      } else if (question.includes('comes after 2')) {
        expectedAnswer = '3';
      } else if (question.includes('comes after 3')) {
        expectedAnswer = '4';
      } else if (question.includes('comes after 4')) {
        expectedAnswer = '5';
      } else if (question.includes('comes after 5')) {
        expectedAnswer = '6';
      } else if (question.includes('comes after 6')) {
        expectedAnswer = '7';
      } else if (question.includes('comes after 7')) {
        expectedAnswer = '8';
      }
      // Addition questions
      else if (question.includes('1 + 1') || question.includes('1 plus 1')) {
        expectedAnswer = '2';
        questionType = 'math';
      } else if (question.includes('2 + 2') || question.includes('2 plus 2')) {
        expectedAnswer = '4';
        questionType = 'math';
      } else if (question.includes('3 + 1') || question.includes('3 plus 1')) {
        expectedAnswer = '4';
        questionType = 'math';
      } else if (question.includes('2 + 1') || question.includes('2 plus 1')) {
        expectedAnswer = '3';
        questionType = 'math';
      } else if (question.includes('5 + 1') || question.includes('5 plus 1')) {
        expectedAnswer = '6';
        questionType = 'math';
      }
      // Counting questions
      else if (question.includes('count to 3') || question.includes('1 to 3')) {
        expectedAnswer = '1, 2, 3';
        questionType = 'open';
      }
    } else if (subject === 'english') {
      // Alphabet questions
      if (question.includes('after A')) {
        expectedAnswer = 'B';
      } else if (question.includes('after B')) {
        expectedAnswer = 'C';
      } else if (question.includes('after C')) {
        expectedAnswer = 'D';
      }
      // Vocabulary questions
      else if (question.includes('opposite of hot') || question.includes("opposite of 'hot'")) {
        expectedAnswer = 'cold';
      } else if (question.includes('word that starts with C')) {
        expectedAnswer = 'cat';  // Accept any reasonable answer
        questionType = 'open';
      }
    } else if (subject === 'spanish') {
      // Basic greetings
      if ((question.includes('hello') || question.includes('hi')) && question.includes('Spanish')) {
        expectedAnswer = 'hola';
      } else if (question.includes('gracias') && question.includes('English')) {
        expectedAnswer = 'thank you';
      } else if (question.includes('good morning') && question.includes('Spanish')) {
        expectedAnswer = 'buenos días';
      }
    }

    // General fallback for unknown patterns
    if (!expectedAnswer) {
      expectedAnswer = 'unknown';
      questionType = 'open';
    }

    return { expectedAnswer, questionType, options };
  }
}

export const openaiService = new OpenAIService();