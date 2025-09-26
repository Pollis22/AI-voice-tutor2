// Conversation state machine types and schemas

export type DialogState = 'greet' | 'understand' | 'plan' | 'teach' | 'check' | 'remediate' | 'advance' | 'close';

export interface TutorPlan {
  goal: string;
  plan: string[];
  next_prompt: string;
  followup_options?: string[];
}

export interface ConversationContext {
  state: DialogState;
  topic?: string;
  studentLevel?: 'beginner' | 'intermediate' | 'advanced';
  previousPlans: TutorPlan[];
  currentPlan?: TutorPlan;
  sessionId: string;
  userId: string;
  // Session-scoped question state for answer acknowledgment
  currentQuestion?: string;
  expectedAnswer?: string;
  questionType?: 'short' | 'mcq' | 'math' | 'open';
  options?: string[];
}

// Dialog state transitions
export const STATE_TRANSITIONS: Record<DialogState, DialogState[]> = {
  greet: ['understand'],
  understand: ['plan', 'greet'],
  plan: ['teach', 'understand'],
  teach: ['check', 'plan'],
  check: ['remediate', 'advance', 'teach'],
  remediate: ['teach', 'check'],
  advance: ['plan', 'teach', 'close'],
  close: ['greet']
};

// Tool schema for tutor planning (OpenAI format)
export const TUTOR_PLAN_SCHEMA = {
  type: "function" as const,
  function: {
    name: "tutor_plan",
    description: "Plan the next step in the tutoring conversation",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The learning goal for this interaction"
        },
        plan: {
          type: "array",
          items: { type: "string" },
          description: "Step-by-step plan to achieve the goal"
        },
        next_prompt: {
          type: "string", 
          description: "The exact prompt to speak to the student (8-16 seconds)"
        },
        followup_options: {
          type: "array",
          items: { type: "string" },
          description: "Optional follow-up responses based on student answers"
        }
      },
      required: ["goal", "plan", "next_prompt"]
    }
  }
};

// Topic routing tool schema
export const TOPIC_ROUTER_SCHEMA = {
  name: "route_topic",
  description: "Classify the student input into a topic category",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The student's input text to classify"
      },
      confidence: {
        type: "number",
        description: "Confidence level (0-1) in the classification"
      },
      topic: {
        type: "string",
        enum: ["math", "grammar", "reading", "general"],
        description: "The identified topic category"
      }
    },
    required: ["text", "topic", "confidence"]
  }
};