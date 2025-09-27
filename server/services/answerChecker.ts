import { normalizeAnswer } from '../utils/answerNormalization.js';

export interface AnswerCheckResult {
  isCorrect: boolean;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'math' | 'mcq';
  correction?: string;
  explanation?: string;
}

export class RobustAnswerChecker {
  checkAnswer(
    userAnswer: string,
    expectedAnswer: string,
    questionType: 'short' | 'mcq' | 'math' | 'open',
    options?: string[]
  ): AnswerCheckResult {
    const normalized = normalizeAnswer(userAnswer);
    const expectedNorm = normalizeAnswer(expectedAnswer);

    // Handle different question types
    switch (questionType) {
      case 'math':
        return this.checkMathAnswer(normalized, expectedNorm);
      case 'mcq':
        return this.checkMCQAnswer(normalized, expectedNorm, options);
      case 'short':
        return this.checkShortTextAnswer(normalized, expectedNorm);
      case 'open':
        return this.checkOpenAnswer(normalized, expectedNorm);
      default:
        return this.checkShortTextAnswer(normalized, expectedNorm);
    }
  }

  private checkMathAnswer(userAnswer: string, expectedAnswer: string): AnswerCheckResult {
    // Handle mathematical expressions and numeric answers
    const userNum = this.extractNumber(userAnswer);
    const expectedNum = this.extractNumber(expectedAnswer);

    if (userNum !== null && expectedNum !== null) {
      const isCorrect = Math.abs(userNum - expectedNum) < 0.001; // Handle floating point
      return {
        isCorrect,
        confidence: isCorrect ? 0.95 : 0.1,
        method: 'math',
        correction: !isCorrect ? `The correct answer is ${expectedAnswer}.` : undefined,
        explanation: !isCorrect ? this.getMathExplanation(userNum, expectedNum) : undefined
      };
    }

    // Fallback to text comparison for non-numeric math answers
    return this.checkShortTextAnswer(userAnswer, expectedAnswer);
  }

  private checkMCQAnswer(userAnswer: string, expectedAnswer: string, options?: string[]): AnswerCheckResult {
    // Check for exact match first
    if (userAnswer === expectedAnswer) {
      return { isCorrect: true, confidence: 0.95, method: 'mcq' };
    }

    // Check if user provided option letter/number
    if (options) {
      const userIndex = this.extractOptionIndex(userAnswer);
      const expectedIndex = options.findIndex(opt => normalizeAnswer(opt) === expectedAnswer);
      
      if (userIndex !== -1 && userIndex === expectedIndex) {
        return { isCorrect: true, confidence: 0.9, method: 'mcq' };
      }
    }

    // Fuzzy matching for partial answers
    const similarity = this.calculateSimilarity(userAnswer, expectedAnswer);
    const isCorrect = similarity > 0.8;

    return {
      isCorrect,
      confidence: similarity,
      method: 'mcq',
      correction: !isCorrect ? `The correct answer is ${expectedAnswer}.` : undefined
    };
  }

  private checkShortTextAnswer(userAnswer: string, expectedAnswer: string): AnswerCheckResult {
    // Exact match (highest confidence)
    if (userAnswer === expectedAnswer) {
      return { isCorrect: true, confidence: 0.95, method: 'exact' };
    }

    // Fuzzy matching for common variations
    const similarity = this.calculateSimilarity(userAnswer, expectedAnswer);
    const isCorrect = similarity > 0.7; // More lenient for short text

    return {
      isCorrect,
      confidence: similarity,
      method: 'fuzzy',
      correction: !isCorrect ? `The correct answer is ${expectedAnswer}.` : undefined
    };
  }

  private checkOpenAnswer(userAnswer: string, expectedAnswer: string): AnswerCheckResult {
    // For open-ended questions, be very lenient
    const similarity = this.calculateSimilarity(userAnswer, expectedAnswer);
    const hasKeywords = this.containsKeyWords(userAnswer, expectedAnswer);
    
    const isCorrect = similarity > 0.3 || hasKeywords;
    const confidence = Math.max(similarity, hasKeywords ? 0.6 : 0);

    return {
      isCorrect,
      confidence,
      method: 'fuzzy',
      explanation: !isCorrect ? `Consider including: ${expectedAnswer}` : undefined
    };
  }

  // Helper methods
  private extractNumber(text: string): number | null {
    // Extract numeric value from text (handles fractions, decimals, word numbers)
    const numMatch = text.match(/(-?\d+(?:\.\d+)?)/);
    if (numMatch) {
      return parseFloat(numMatch[1]);
    }

    // Handle word numbers
    const wordNumbers: Record<string, number> = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };

    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word in wordNumbers) {
        return wordNumbers[word];
      }
    }

    return null;
  }

  private extractOptionIndex(text: string): number {
    // Extract option index from answers like "A", "1", "option A", etc.
    const letterMatch = text.match(/\b([A-D])\b/i);
    if (letterMatch) {
      return letterMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
    }

    const numberMatch = text.match(/\b([1-4])\b/);
    if (numberMatch) {
      return parseInt(numberMatch[1]) - 1; // 1=0, 2=1, etc.
    }

    return -1;
  }

  private calculateSimilarity(a: string, b: string): number {
    // Jaccard similarity + edit distance
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    
    // Add character-level similarity for short answers
    const editDistance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    const charSimilarity = maxLength > 0 ? 1 - (editDistance / maxLength) : 1;
    
    return Math.max(jaccard, charSimilarity * 0.8); // Weight towards word similarity
  }

  private containsKeyWords(userAnswer: string, expectedAnswer: string): boolean {
    const expectedWords = expectedAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const userWords = userAnswer.toLowerCase().split(/\s+/);
    
    return expectedWords.some(word => userWords.includes(word));
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  private getMathExplanation(userNum: number, expectedNum: number): string {
    const diff = expectedNum - userNum;
    if (Math.abs(diff) === 1) {
      return diff > 0 ? 'You\'re very close! Try adding one more.' : 'You\'re very close! Try subtracting one.';
    }
    return `The difference is ${Math.abs(diff)}. Let\'s work through it step by step.`;
  }
}

export const robustAnswerChecker = new RobustAnswerChecker();