import OpenAI from "openai";
import { LLM_CONFIG, TUTOR_SYSTEM_PROMPT, ensureEndsWithQuestion, splitIntoSentences, getRandomPhrase, ACKNOWLEDGMENT_PHRASES, TRANSITION_PHRASES } from '../llm/systemPrompt';
import { conversationManager } from './conversationManager';
import { topicRouter } from './topicRouter';
import { TutorPlan, TUTOR_PLAN_SCHEMA } from '../types/conversationState';
import { LessonContext, SUBJECT_PROMPTS, ASR_CONFIG } from '../types/lessonContext';
import { lessonService } from './lessonService';
import { debugLogger } from '../utils/debugLogger';
import { retryOpenAICall, validateAndLogOpenAIKey, getRedactedOrgId, type OpenAIRetryResult } from '../utils/openaiRetryHandler';
import { openaiCircuitBreaker } from './circuitBreaker';
import { userQueueManager } from './userQueueManager';
import { semanticCache } from './semanticCache';
import { inputGatingService } from './inputGating';

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
        const subject = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';

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

        const lessonPrompt = context.lessonContext ? 
          lessonService.getLessonPrompt(context.lessonContext) : 
          SUBJECT_PROMPTS[subject as keyof typeof SUBJECT_PROMPTS] || SUBJECT_PROMPTS.general;

        // Classify topic for confidence checking
        const topicClassification = topicRouter.classifyTopic(normalizedMessage);

        // Build complete system prompt
        const systemPrompt = `${TUTOR_SYSTEM_PROMPT}

${lessonPrompt}

Current energy: ${context.energyLevel || 'upbeat'}

Response rules:
1. Maximum 2 sentences per turn
2. End with a question
3. Never create or invent user messages
4. Use the tutor_plan function for structured responses`;

        // Step 5: Execute OpenAI call through circuit breaker
        const llmResult = await openaiCircuitBreaker.execute(async () => {
          return await openai.chat.completions.create({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: normalizedMessage }
            ],
            temperature: LLM_CONFIG.temperature,
            max_tokens: LLM_CONFIG.maxTokens,
            top_p: LLM_CONFIG.topP,
            presence_penalty: LLM_CONFIG.presencePenalty,
            tools: [TUTOR_PLAN_SCHEMA],
            tool_choice: { type: "function", function: { name: "tutor_plan" } }
          });
        });

        const tokensUsed = llmResult.usage?.total_tokens || 0;
        let content = llmResult.choices[0].message.content || "I'm here to help you learn! What would you like to explore?";
        let plan: TutorPlan | undefined;

        // Parse the required tutor_plan tool call
        const toolCalls = llmResult.choices[0].message.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          const planCall = toolCalls.find(call => call.type === 'function' && call.function.name === 'tutor_plan');
          if (planCall && planCall.type === 'function') {
            try {
              const planData = JSON.parse(planCall.function.arguments);
              plan = {
                goal: planData.goal,
                plan: planData.plan,
                next_prompt: planData.next_prompt,
                followup_options: planData.followup_options
              };
              
              // Use only the next_prompt as the spoken content
              content = this.enforceConcisenessAndQuestion(plan.next_prompt);
              
              // Store plan in conversation manager
              if (context.sessionId) {
                conversationManager.addPlan(context.sessionId, plan);
              }
            } catch (error) {
              console.warn('[OpenAI] Failed to parse tutor_plan tool call:', error);
            }
          }
        }

        // Step 6: Cache the successful response
        semanticCache.set(lessonId, normalizedMessage, content, subject);

        const finalResponse: EnhancedTutorResponse = {
          content,
          plan,
          topic: topicClassification.topic,
          repairMove: topicClassification.confidence < 0.4,
          usedFallback: false,
          usedCache: false,
          breakerOpen: false,
          queueDepth: userQueue.getQueueDepth(),
          retryCount: 0,
          tokensUsed,
          model
        };

        // Step 7: Debug logging with scalability metrics
        this.logEnhancedDebugInfo({
          context,
          userInput: normalizedMessage,
          response: finalResponse,
          startTime,
          speechDuration: speechData?.duration,
          speechConfidence: speechData?.confidence
        });

        return finalResponse;

      } catch (error) {
        console.error(`[OpenAI] Error in enhanced response generation:`, error);
        
        // Return contextual fallback
        const subject = context.lessonContext?.subject || lessonId.split('-')[0] || 'general';
        const fallbackResult = this.getLessonSpecificFallback(subject, normalizedMessage, sessionId);
        
        const fallbackResponse: EnhancedTutorResponse = {
          content: fallbackResult.content,
          topic: 'general',
          repairMove: false,
          usedFallback: true,
          usedCache: false,
          breakerOpen: openaiCircuitBreaker.isOpen(),
          queueDepth: userQueue.getQueueDepth(),
          banner: fallbackResult.banner,
          retryCount: 0,
          tokensUsed: 0,
          model
        };

        this.logEnhancedDebugInfo({
          context,
          userInput: normalizedMessage,
          response: fallbackResponse,
          startTime,
          error: (error as Error)?.message
        });

        return fallbackResponse;
      }
    }, true); // Enable barge-in for real-time conversations
  }
      if (context.sessionId) {
        let convContext = conversationManager.getContext(context.sessionId);
        if (!convContext) {
          convContext = conversationManager.initializeContext(context.sessionId, context.userId);
        }
      }

      // Build lesson-grounded system prompt
      let lessonPrompt = '';
      let subjectInstruction = SUBJECT_PROMPTS.general;
      
      if (context.lessonContext) {
        const { subject, title, objectives, keyTerms } = context.lessonContext;
        subjectInstruction = SUBJECT_PROMPTS[subject as keyof typeof SUBJECT_PROMPTS] || SUBJECT_PROMPTS.general;
        
        lessonPrompt = `
CURRENT LESSON:
Subject: ${subject}
Title: ${title}
Objectives: ${objectives.join(', ')}
Key Terms: ${keyTerms.join(', ')}

IMPORTANT: Stay strictly on this lesson's topic. If the student asks something outside ${subject} - ${title}, respond:
"We're currently on ${subject} - ${title}. Want help with that, or should we switch lessons?"

Teaching approach for ${subject}: ${subjectInstruction}`;
      }
      
      // Classify topic for confidence checking
      const topicClassification = topicRouter.classifyTopic(message);
      
      // Build complete system prompt
      const systemPrompt = `${TUTOR_SYSTEM_PROMPT}

${lessonPrompt}

Current energy: ${context.energyLevel || 'upbeat'}

Response rules:
1. Maximum 2 sentences per turn
2. End with a question
3. Never create or invent user messages
4. Use the tutor_plan function for structured responses`;

      const debugMode = process.env.DEBUG_TUTOR === '1';
      if (debugMode) {
        console.log(`[OpenAI DEBUG] User input: "${message}" (${message.length} chars)`);
        console.log(`[OpenAI DEBUG] Lesson: ${context.lessonId}, Subject: ${context.lessonContext?.subject}`);
        console.log(`[OpenAI DEBUG] Topic: ${topicClassification.topic}, Confidence: ${topicClassification.confidence}`);
      }

      // Single LLM call per user turn using retry handler
      const retryResult = await retryOpenAICall(async () => {
        return await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          temperature: LLM_CONFIG.temperature,
          max_tokens: LLM_CONFIG.maxTokens,
          top_p: LLM_CONFIG.topP,
          presence_penalty: LLM_CONFIG.presencePenalty,
          tools: [TUTOR_PLAN_SCHEMA],
          tool_choice: { type: "function", function: { name: "tutor_plan" } }
        });
      }, undefined, (retryContext) => {
        console.log(`[OpenAI] Retry ${retryContext.attempt}/${retryContext.totalAttempts} after:`, retryContext.lastError?.message);
      });
      
      // Handle retry result
      if (retryResult.usedFallback || !retryResult.result) {
        const subject = context.lessonContext?.subject || 'general';
        const fallbackResult = this.getLessonSpecificFallback(subject, message, context.sessionId);
        
        const response: EnhancedTutorResponse = {
          content: fallbackResult.content,
          topic: topicClassification.topic,
          repairMove: false,
          usedFallback: true,
          retryCount: retryResult.retryCount,
          tokensUsed: 0,
          model,
          banner: fallbackResult.banner
        };
        
        this.logDebugInfo({
          context,
          userInput: message,
          response,
          startTime,
          error: retryResult.error?.message
        });
        
        return response;
      }
      
      const response = retryResult.result;
      const tokensUsed = response.usage?.total_tokens || 0;

      let content = response.choices[0].message.content || "I'm sorry, I didn't understand that. Could you please rephrase your question?";
      let plan: TutorPlan | undefined;

      // Parse the required tutor_plan tool call
      const toolCalls = response.choices[0].message.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const planCall = toolCalls.find(call => call.type === 'function' && call.function.name === 'tutor_plan');
        if (planCall && planCall.type === 'function') {
          try {
            const planData = JSON.parse(planCall.function.arguments);
            plan = {
              goal: planData.goal,
              plan: planData.plan,
              next_prompt: planData.next_prompt,
              followup_options: planData.followup_options
            };
            
            // Use only the next_prompt as the spoken content (enforced, concise)
            content = this.enforceConcisenessAndQuestion(plan.next_prompt);
            
            // Store plan in conversation manager
            if (context.sessionId) {
              conversationManager.addPlan(context.sessionId, plan);
            }
            
            console.log(`[OpenAI] Generated plan: ${plan.goal}`);
          } catch (error) {
            console.error('[OpenAI] Failed to parse tutor plan:', error);
            // Fallback content if plan parsing fails
            content = "Let me think about the best way to help you learn. What would you like to explore?";
          }
        }
      } else {
        // This shouldn't happen with forced tool choice, but provide fallback
        console.warn('[OpenAI] No tutor_plan tool call received despite forced choice');
        content = "I'm here to help you learn! What would you like to work on?";
      }
      
      const finalResponse: EnhancedTutorResponse = {
        content: this.enforceConcisenessAndQuestion(content),
        plan,
        topic: topicClassification.topic,
        repairMove: topicClassification.confidence < 0.4,
        usedFallback: false,
        retryCount: retryResult.retryCount,
        tokensUsed,
        model
      };
      
      this.logDebugInfo({
        context,
        userInput: message,
        response: finalResponse,
        startTime
      });
      
      return finalResponse;
      
    } catch (error) {
      console.error("Error generating tutor response:", error);
      
      // Return fallback response for any unexpected error
      const subject = context.lessonContext?.subject || 'general';
      const fallbackResult = this.getLessonSpecificFallback(subject, message, context.sessionId);
      
      const topicClassification = topicRouter.classifyTopic(message);
      
      const fallbackResponse: EnhancedTutorResponse = {
        content: fallbackResult.content,
        topic: topicClassification.topic || 'general',
        repairMove: false,
        usedFallback: true,
        retryCount: 0,
        tokensUsed: 0,
        model,
        banner: fallbackResult.banner
      };
      
      this.logDebugInfo({
        context,
        userInput: message,
        response: fallbackResponse,
        startTime,
        error: (error as Error)?.message
      });
      
      return fallbackResponse;
    }
  }

  // Ensure response is concise (<=2 sentences) and ends with question
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
  
  // Enhanced fallback with conversation context
  private getLessonSpecificFallback(subject: string, userInput?: string, sessionId?: string): { content: string; banner?: string } {
    // Check for recent fallbacks to avoid repetition
    const recentKey = `recent_fallbacks_${sessionId || 'default'}`;
    const recentFallbacks = this.recentFallbacks.get(recentKey) || [];
    
    // Contextual responses based on user input
    const contextualResponses = this.getContextualResponse(userInput, subject);
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
    
    // Standard fallbacks with variety
    const fallbacks: Record<string, string[]> = {
      math: [
        "I understand you're working on numbers! Let's try a simple counting question - what comes after 3?",
        "Math can be fun! Can you tell me what 2 plus 1 equals?",
        "Numbers are everywhere! How many wheels does a car have?",
        "Let's practice with shapes - can you think of something that's round?",
        "Counting is important! Can you count to 10 for me?"
      ],
      english: [
        "Words are powerful! Can you name an animal that starts with 'C'?",
        "Reading helps us learn! What's your favorite book or story?",
        "Let's work with letters - can you spell your first name?",
        "Sentences have parts! Can you make a sentence using the word 'happy'?",
        "Language is fun! What's a word that describes something big?"
      ],
      spanish: [
        "¡Hola! Spanish is beautiful! Can you say 'buenos días' (good morning)?",
        "Let's practice! How do you say 'cat' in Spanish? (It's 'gato')",
        "Colors in Spanish are fun! Do you know what 'azul' means?",
        "Numbers in Spanish! Can you try saying 'cinco' (five)?",
        "¡Muy bien! What does '¿Cómo estás?' mean in English?"
      ],
      general: [
        "I hear what you're saying! Let's explore this step by step - what interests you most?",
        "That's a great point! Can you tell me more about what you're thinking?",
        "Learning together is wonderful! What would you like to discover next?",
        "I'm here to help! What specific question do you have?",
        "Every question helps us learn! What's one thing you're curious about?"
      ]
    };
    
    const responses = fallbacks[subject] || fallbacks.general;
    const availableResponses = responses.filter(r => !recentFallbacks.includes(r));
    
    // If all responses were used recently, reset the tracking
    let selectedResponse: string;
    if (availableResponses.length === 0) {
      this.recentFallbacks.set(recentKey, []);
      selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    } else {
      selectedResponse = availableResponses[Math.floor(Math.random() * availableResponses.length)];
    }
    
    this.trackRecentFallback(recentKey, selectedResponse);
    
    return {
      content: selectedResponse,
      banner: "I'm experiencing connection issues but can still help you learn!"
    };
  }
  
  // Track recent fallbacks to avoid repetition
  private recentFallbacks = new Map<string, string[]>();
  
  private trackRecentFallback(key: string, response: string) {
    const recent = this.recentFallbacks.get(key) || [];
    recent.push(response);
    // Keep only last 3 responses
    if (recent.length > 3) {
      recent.shift();
    }
    this.recentFallbacks.set(key, recent);
  }
  
  // Generate contextual responses based on user input
  private getContextualResponse(userInput: string = '', subject: string): string[] {
    const input = userInput.toLowerCase();
    
    // Number-related responses
    if (input.match(/\d/) || input.includes('count') || input.includes('number')) {
      return [
        "I see you mentioned numbers! What's your favorite number and why?",
        "Numbers are useful! Can you count how many fingers you're holding up?",
        "Math is everywhere! What number comes next in this pattern: 1, 2, 3, ?"
      ];
    }
    
    // Question words
    if (input.includes('what') || input.includes('why') || input.includes('how')) {
      return [
        "That's a thoughtful question! Let me help you think through it step by step.",
        "Great question! Let's explore that together - what do you think might be the answer?",
        "I love when you ask questions! What's the first thing that comes to mind?"
      ];
    }
    
    // Positive responses
    if (input.includes('yes') || input.includes('ok') || input.includes('sure')) {
      return [
        "Wonderful! Let's keep going - what should we try next?",
        "Great! You're doing well. What's another way we could approach this?",
        "Perfect! Now let's build on that - can you think of a similar example?"
      ];
    }
    
    // Confusion or difficulty
    if (input.includes('no') || input.includes('don\'t') || input.includes('hard') || input.includes('difficult')) {
      return [
        "That's okay! Learning takes time. Let's try something easier first.",
        "No worries! Let's break this down into smaller steps.",
        "It's fine to find things challenging! What part would you like help with?"
      ];
    }
    
    // Default contextual responses
    return [
      "I can see you're thinking about this! What's your next idea?",
      "Let's keep exploring! What interests you most about this topic?",
      "You're doing great! What would you like to try next?"
    ];
  }
}

export const openaiService = new OpenAIService();