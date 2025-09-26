import { DialogState, ConversationContext, TutorPlan, STATE_TRANSITIONS } from '../types/conversationState';

export class ConversationManager {
  private contexts: Map<string, ConversationContext> = new Map();

  // Initialize conversation context for a session
  initializeContext(sessionId: string, userId: string): ConversationContext {
    // Clear any existing context to prevent message duplication
    if (this.contexts.has(sessionId)) {
      console.log(`[Conversation] Clearing existing context for session ${sessionId}`);
      this.contexts.delete(sessionId);
    }
    
    const context: ConversationContext = {
      state: 'greet',
      sessionId,
      userId,
      previousPlans: []
    };
    this.contexts.set(sessionId, context);
    console.log(`[Conversation] Initialized fresh context for session ${sessionId}`);
    return context;
  }
  
  // Clear context when switching lessons
  clearContext(sessionId: string): void {
    if (this.contexts.has(sessionId)) {
      this.contexts.delete(sessionId);
      console.log(`[Conversation] Cleared context for session ${sessionId}`);
    }
  }

  // Get conversation context
  getContext(sessionId: string): ConversationContext | undefined {
    return this.contexts.get(sessionId);
  }

  // Update conversation state
  updateState(sessionId: string, newState: DialogState): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    const validTransitions = STATE_TRANSITIONS[context.state];
    if (!validTransitions.includes(newState)) {
      console.warn(`Invalid state transition from ${context.state} to ${newState}`);
      return false;
    }

    const oldState = context.state;
    context.state = newState;
    console.log(`[Conversation] State transition: ${oldState} → ${newState} for session ${sessionId}`);
    return true;
  }

  // Add tutor plan to context and advance state
  addPlan(sessionId: string, plan: TutorPlan): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.currentPlan = plan;
    context.previousPlans.push(plan);
    
    // Auto-advance state based on plan content
    if (context.state === 'greet' && plan.goal.toLowerCase().includes('understand')) {
      this.updateState(sessionId, 'understand');
    } else if (context.state === 'understand' && plan.plan.length > 0) {
      this.updateState(sessionId, 'plan');
    } else if (context.state === 'plan' && plan.next_prompt.includes('?')) {
      this.updateState(sessionId, 'teach');
    }
    
    console.log(`[Conversation] New plan added for session ${sessionId}: ${plan.goal}`);
  }

  // Set topic for context
  setTopic(sessionId: string, topic: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.topic = topic;
      console.log(`[Conversation] Topic set to: ${topic} for session ${sessionId}`);
    }
  }

  // Set question state for answer acknowledgment
  setQuestionState(
    sessionId: string, 
    question: string, 
    expectedAnswer: string, 
    questionType: 'short' | 'mcq' | 'math' | 'open' = 'short',
    options?: string[]
  ): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.currentQuestion = question;
    context.expectedAnswer = expectedAnswer;
    context.questionType = questionType;
    context.options = options;
    
    console.log(`[Conversation] Set question state for session ${sessionId}: ${questionType} question`);
  }

  // Clear question state after acknowledgment
  clearQuestionState(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.currentQuestion = undefined;
    context.expectedAnswer = undefined;
    context.questionType = undefined;
    context.options = undefined;
    
    console.log(`[Conversation] Cleared question state for session ${sessionId}`);
  }

  // Get current question state
  getQuestionState(sessionId: string): {
    currentQuestion?: string;
    expectedAnswer?: string;
    questionType?: 'short' | 'mcq' | 'math' | 'open';
    options?: string[];
  } | null {
    const context = this.contexts.get(sessionId);
    if (!context) return null;

    return {
      currentQuestion: context.currentQuestion,
      expectedAnswer: context.expectedAnswer,
      questionType: context.questionType,
      options: context.options
    };
  }

  // Get appropriate system prompt based on state and topic
  getSystemPrompt(sessionId: string): string {
    const context = this.contexts.get(sessionId);
    if (!context) return this.getBasePrompt();

    let prompt = this.getBasePrompt();

    // Add state-specific guidance
    switch (context.state) {
      case 'greet':
        prompt += "\n\nYou are greeting a new student. Be warm and find out what they want to learn.";
        break;
      case 'understand':
        prompt += "\n\nYou are trying to understand the student's needs. Ask clarifying questions.";
        break;
      case 'plan':
        prompt += "\n\nYou are planning the lesson. Break down the goal into clear steps.";
        break;
      case 'teach':
        prompt += "\n\nYou are teaching. Use the Socratic method with hints and examples.";
        break;
      case 'check':
        prompt += "\n\nYou are checking understanding. Ask a quick question to verify learning.";
        break;
      case 'remediate':
        prompt += "\n\nThe student needs help. Provide a clearer explanation or different approach.";
        break;
      case 'advance':
        prompt += "\n\nThe student is ready for more. Increase difficulty or move to the next concept.";
        break;
      case 'close':
        prompt += "\n\nYou are wrapping up. Summarize progress and encourage continued learning.";
        break;
    }

    // Add topic-specific guidance
    if (context.topic) {
      switch (context.topic) {
        case 'math':
          prompt += "\n\nMath focus: Show one step then check. Use concrete examples before abstract concepts.";
          break;
        case 'grammar':
          prompt += "\n\nGrammar focus: Give example then ask student to try. Focus on patterns and rules.";
          break;
        case 'reading':
          prompt += "\n\nReading focus: Build comprehension through questions. Connect to student's experience.";
          break;
        case 'general':
          prompt += "\n\nGeneral learning: Adapt to the student's expressed interest and learning style.";
          break;
      }
    }

    return prompt;
  }

  private getBasePrompt(): string {
    return `You are "TutorMind," a warm, upbeat, and encouraging coach.

Rules:
- Keep each response short (8–16 spoken seconds) and end with a question.
- First reflect the student's intent in one quick line; ask one clarifier if needed.
- Use the Socratic method: hints and guiding questions before full solutions.
- If stuck: definition → example → 1 quick practice item, then check.
- Vary phrasing; avoid repeating the same openers.
- Match tone to learner (younger: playful; adult: confident/concise).
- Use repair moves when uncertain: briefly restate what you heard and offer two options.
- Always be positive and specific in feedback.`;
  }

  // Clean up old contexts (call periodically)
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    const sessionIds = Array.from(this.contexts.keys());
    for (const sessionId of sessionIds) {
      const context = this.contexts.get(sessionId)!;
      // This is a simple cleanup - in production you'd want proper timestamp tracking
      if (context.previousPlans.length === 0) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.contexts.delete(sessionId);
      console.log(`[Conversation] Cleaned up expired session: ${sessionId}`);
    });
  }
}

// Singleton instance
export const conversationManager = new ConversationManager();