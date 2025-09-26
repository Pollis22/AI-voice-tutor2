import OpenAI from "openai";
import { LLM_CONFIG, TUTOR_SYSTEM_PROMPT, ensureEndsWithQuestion, splitIntoSentences, getRandomPhrase, ACKNOWLEDGMENT_PHRASES, TRANSITION_PHRASES } from '../llm/systemPrompt';
import { conversationManager } from './conversationManager';
import { topicRouter } from './topicRouter';
import { TutorPlan, TUTOR_PLAN_SCHEMA } from '../types/conversationState';
import { LessonContext, SUBJECT_PROMPTS, ASR_CONFIG } from '../types/lessonContext';
import { lessonService } from './lessonService';
import { debugLogger } from '../utils/debugLogger';
import { retryOpenAICall, validateAndLogOpenAIKey, getRedactedOrgId, type OpenAIRetryResult } from '../utils/openaiRetryHandler';

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
}

class OpenAIService {
  async generateTutorResponse(message: string, context: TutorContext): Promise<string> {
    return this.generateEnhancedTutorResponse(message, context).then(r => r.content);
  }

  // Enhanced conversation response with lesson grounding and turn gating
  async generateEnhancedTutorResponse(message: string, context: TutorContext): Promise<EnhancedTutorResponse> {
    const startTime = Date.now();
    const model = LLM_CONFIG.model;
    
    try {
      // TURN GATING: Validate actual user input exists
      const trimmedMessage = message?.trim() || '';
      if (!trimmedMessage || trimmedMessage.length < 2) {
        console.log(`[OpenAI] Gated: No valid user input (message: "${message}")`);
        throw new Error('No valid user input provided');
      }
      
      // Load lesson context if lessonId provided
      if (context.lessonId && !context.lessonContext) {
        context.lessonContext = await lessonService.getLessonContext(context.lessonId) || undefined;
        console.log(`[OpenAI] Loaded lesson context for ${context.lessonId}: ${context.lessonContext?.title}`);
      }
      
      // Initialize or get conversation context
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
        const fallbackContent = this.getLessonSpecificFallback(subject);
        
        const response: EnhancedTutorResponse = {
          content: fallbackContent,
          topic: topicClassification.topic,
          repairMove: false,
          usedFallback: true,
          retryCount: retryResult.retryCount,
          tokensUsed: 0,
          model
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
      const fallbackContent = this.getLessonSpecificFallback(subject);
      
      const topicClassification = topicRouter.classifyTopic(message);
      
      const fallbackResponse: EnhancedTutorResponse = {
        content: fallbackContent,
        topic: topicClassification.topic || 'general',
        repairMove: false,
        usedFallback: true,
        retryCount: 0,
        tokensUsed: 0,
        model
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
  
  // Centralized debug logging
  private logDebugInfo(data: {
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
    
    // Debug mode logging (when DEBUG_TUTOR=1)
    if (process.env.DEBUG_TUTOR === '1') {
      const orgId = getRedactedOrgId();
      console.log(`[OpenAI DEBUG] org: ${orgId}, model: ${response.model}, tokens: ${response.tokensUsed}, retryCount: ${response.retryCount}, usedFallback: ${response.usedFallback}`);
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
  
  private getLessonSpecificFallback(subject: string): string {
    const fallbacks: Record<string, string[]> = {
      math: [
        "Let's work through this step by step. What number comes after 2?",
        "Good thinking! Can you count from 1 to 5 for me?",
        "That's a great question about numbers! How many fingers do you have on one hand?",
        "Let's practice counting together. Can you show me three fingers?",
        "Excellent effort with math! What's 1 plus 1?"
      ],
      english: [
        "Let's explore words together! Can you tell me a word that names something?",
        "Good effort! What's your favorite word that describes an action?",
        "Let's think about sentences. Can you make a simple sentence with the word 'cat'?",
        "Great question! Can you think of a word that rhymes with 'bat'?",
        "Nice work with English! What letter does your name start with?"
      ],
      spanish: [
        "¡Muy bien! Can you say 'hola' for me?",
        "Good try! Do you know how to say 'thank you' in Spanish?",
        "Let's practice greetings! How would you say 'good morning'?",
        "Excellent! Can you count from uno to tres in Spanish?",
        "¡Fantástico! What color is 'rojo' in English?"
      ],
      general: [
        "Let's explore this topic together! What would you like to learn first?",
        "That's interesting! Can you tell me what you already know about this?",
        "Good question! Let's start with the basics. What part interests you most?",
        "I'm here to help you learn! What specific area should we focus on?",
        "Great thinking! What made you curious about this topic?"
      ]
    };
    
    const responses = fallbacks[subject] || fallbacks.general;
    return responses[Math.floor(Math.random() * responses.length)];
  }
}

export const openaiService = new OpenAIService();