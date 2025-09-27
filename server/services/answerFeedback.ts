// Enhanced answer feedback system with explicit correct/incorrect acknowledgements

import { answerChecker } from './answerChecker';
import { getRandomFromPool, microAckPool, fallbackPools } from '../config/latencyConfig';

interface AnswerFeedback {
  isCorrect: boolean;
  feedback: string;
  nextQuestion?: string;
  shouldAdvance: boolean;
  microAck?: string;
}

interface LessonContext {
  lastQuestion?: string;
  expectedAnswer?: string;
  questionType?: 'math' | 'mcq' | 'short' | 'auto';
  subject?: 'math' | 'english' | 'spanish';
  currentStep?: number;
  totalSteps?: number;
}

export class AnswerFeedbackService {
  private recentQuestions: Map<string, string[]> = new Map();
  private readonly MAX_RECENT_QUESTIONS = 10;

  // Generate immediate micro-acknowledgement
  generateMicroAck(): string {
    return getRandomFromPool(microAckPool);
  }

  // Classify and provide feedback on user's answer
  classifyAnswer(
    userAnswer: string,
    context: LessonContext
  ): AnswerFeedback {
    const { lastQuestion, expectedAnswer, questionType, subject } = context;

    // If no expected answer or question context, treat as exploratory
    if (!lastQuestion || !expectedAnswer || !questionType) {
      return {
        isCorrect: false,
        feedback: this.getExploratoryResponse(subject),
        shouldAdvance: false,
        microAck: this.generateMicroAck()
      };
    }

    // Check answer correctness
    const isCorrect = answerChecker.checkAnswer(userAnswer, expectedAnswer, questionType as any);

    if (isCorrect) {
      // Correct answer - advance and praise
      return {
        isCorrect: true,
        feedback: this.getCorrectFeedback(),
        nextQuestion: this.getNextQuestion(context),
        shouldAdvance: true,
        microAck: "Correct — great work!"
      };
    } else {
      // Incorrect answer - provide guidance
      return {
        isCorrect: false,
        feedback: this.getIncorrectFeedback(expectedAnswer, questionType, subject),
        nextQuestion: this.getReworkedQuestion(lastQuestion, expectedAnswer, subject),
        shouldAdvance: false,
        microAck: "Not quite."
      };
    }
  }

  // Get praise for correct answers (rotate through variations)
  private correctPhrases = [
    "Correct — great work!",
    "Exactly right!",
    "Perfect!",
    "You got it!",
    "Excellent!",
    "That's right!",
    "Well done!",
    "Outstanding!"
  ];
  
  private getCorrectFeedback(): string {
    return getRandomFromPool(this.correctPhrases);
  }

  // Get guidance for incorrect answers with the right answer
  private getIncorrectFeedback(
    expectedAnswer: string,
    questionType: string,
    subject?: 'math' | 'english' | 'spanish'
  ): string {
    if (questionType === 'math') {
      return `The answer is ${expectedAnswer}.`;
    } else if (questionType === 'mcq') {
      return `The correct answer is ${expectedAnswer}.`;
    } else if (subject === 'spanish') {
      return `The answer is "${expectedAnswer}".`;
    } else {
      return `Let me help — the answer is ${expectedAnswer}.`;
    }
  }

  // Get exploratory response when no clear answer expected
  private getExploratoryResponse(subject?: 'math' | 'english' | 'spanish'): string {
    const responses = {
      math: "Let's explore that together.",
      english: "Interesting thought, let's continue.",
      spanish: "Bueno, let's keep learning."
    };
    return responses[subject || 'math'] || "Let's think about this.";
  }

  // Get next question ensuring no repetition
  private getNextQuestion(context: LessonContext): string | undefined {
    const { subject = 'math', currentStep = 0 } = context;
    const sessionId = `${subject}-${currentStep}`;
    
    // Get pool of questions for this subject
    const questionPool = fallbackPools[subject] || fallbackPools.math;
    
    // Get recent questions for this session
    let recent = this.recentQuestions.get(sessionId) || [];
    
    // Find a question not recently used
    const availableQuestions = questionPool.filter(q => !recent.includes(q));
    
    if (availableQuestions.length === 0) {
      // Reset if we've used all questions
      recent = [];
      this.recentQuestions.set(sessionId, recent);
      return getRandomFromPool(questionPool);
    }
    
    const nextQuestion = getRandomFromPool(availableQuestions);
    
    // Track this question
    recent.push(nextQuestion);
    if (recent.length > this.MAX_RECENT_QUESTIONS) {
      recent.shift();
    }
    this.recentQuestions.set(sessionId, recent);
    
    return nextQuestion;
  }

  // Rework question with hints when incorrect
  private getReworkedQuestion(
    originalQuestion: string,
    expectedAnswer: string,
    subject?: 'math' | 'english' | 'spanish'
  ): string {
    // Check if this question was asked recently (anti-repeat)
    const similarity = this.calculateSimilarity(originalQuestion, originalQuestion);
    if (similarity > 0.85) {
      // Too similar, provide a different approach
      if (subject === 'math') {
        return `Let me try differently. If you count up: 1, 2... what comes next?`;
      } else if (subject === 'english') {
        return `Here's a hint: look for the action word in the sentence.`;
      } else if (subject === 'spanish') {
        return `Una pista: think about how you greet someone.`;
      }
    }

    // Provide hint-based reworking
    if (subject === 'math' && expectedAnswer) {
      return `Try again: what's the sum when we combine these numbers?`;
    } else if (subject === 'english') {
      return `Let's think about it: which word describes what someone does?`;
    } else if (subject === 'spanish') {
      return `Intenta otra vez: how do you say this in Spanish?`;
    }

    return `Let's try once more with this problem.`;
  }

  // Calculate Jaccard similarity between strings
  private calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.toLowerCase().split(' '));
    const set2 = new Set(str2.toLowerCase().split(' '));
    
    const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
    const union = new Set([...Array.from(set1), ...Array.from(set2)]);
    
    return intersection.size / union.size;
  }

  // Check if a response would be repetitive
  isRepetitive(newResponse: string, recentResponses: string[]): boolean {
    for (const recent of recentResponses) {
      if (this.calculateSimilarity(newResponse, recent) > 0.85) {
        return true;
      }
    }
    return false;
  }

  // Get fallback question for errors/timeouts
  getFallbackQuestion(subject: 'math' | 'english' | 'spanish'): string {
    const pool = fallbackPools[subject] || fallbackPools.math;
    return getRandomFromPool(pool);
  }
}

export const answerFeedbackService = new AnswerFeedbackService();