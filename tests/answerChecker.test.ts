import { describe, it, expect } from '@jest/globals';
import { robustAnswerChecker } from '../server/services/answerChecker';

describe('RobustAnswerChecker', () => {
  describe('checkMathAnswer', () => {
    it('should correctly identify correct numeric answers', () => {
      const testCases = [
        { user: '4', expected: '4', type: 'math' as const },
        { user: 'four', expected: '4', type: 'math' as const },
        { user: '2.5', expected: '2.5', type: 'math' as const },
        { user: '3', expected: '3', type: 'math' as const }
      ];

      testCases.forEach(({ user, expected, type }) => {
        const result = robustAnswerChecker.checkAnswer(user, expected, type);
        expect(result.isCorrect).toBe(true);
        expect(result.method).toBe('math');
        expect(result.confidence).toBeGreaterThan(0.9);
      });
    });

    it('should correctly identify incorrect numeric answers', () => {
      const result = robustAnswerChecker.checkAnswer('5', '4', 'math');
      
      expect(result.isCorrect).toBe(false);
      expect(result.method).toBe('math');
      expect(result.correction).toContain('The correct answer is 4');
      expect(result.explanation).toContain('difference is 1');
    });

    it('should handle word numbers', () => {
      const testCases = [
        { user: 'three', expected: '3' },
        { user: 'five', expected: '5' },
        { user: 'zero', expected: '0' },
        { user: 'ten', expected: '10' }
      ];

      testCases.forEach(({ user, expected }) => {
        const result = robustAnswerChecker.checkAnswer(user, expected, 'math');
        expect(result.isCorrect).toBe(true);
      });
    });

    it('should provide helpful explanations for close answers', () => {
      const result = robustAnswerChecker.checkAnswer('3', '4', 'math');
      
      expect(result.explanation).toContain('adding one more');
    });
  });

  describe('checkMCQAnswer', () => {
    it('should handle exact option matches', () => {
      const options = ['apple', 'banana', 'cherry'];
      const result = robustAnswerChecker.checkAnswer('banana', 'banana', 'mcq', options);
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('mcq');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle option letters', () => {
      const options = ['apple', 'banana', 'cherry'];
      const result = robustAnswerChecker.checkAnswer('B', 'banana', 'mcq', options);
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('mcq');
      expect(result.confidence).toBe(0.9);
    });

    it('should handle option numbers', () => {
      const options = ['apple', 'banana', 'cherry'];
      const result = robustAnswerChecker.checkAnswer('2', 'banana', 'mcq', options);
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('mcq');
    });

    it('should use fuzzy matching for partial answers', () => {
      const options = ['apple', 'banana', 'cherry'];
      const result = robustAnswerChecker.checkAnswer('banan', 'banana', 'mcq', options);
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('mcq');
    });

    it('should reject incorrect answers', () => {
      const options = ['apple', 'banana', 'cherry'];
      const result = robustAnswerChecker.checkAnswer('orange', 'banana', 'mcq', options);
      
      expect(result.isCorrect).toBe(false);
      expect(result.correction).toContain('The correct answer is banana');
    });
  });

  describe('checkShortTextAnswer', () => {
    it('should handle exact matches', () => {
      const result = robustAnswerChecker.checkAnswer('cat', 'cat', 'short');
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('exact');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle fuzzy matches', () => {
      const testCases = [
        { user: 'hello', expected: 'helo' }, // typo
        { user: 'the cat', expected: 'cat' }, // extra words
        { user: 'HELLO', expected: 'hello' }, // case difference
      ];

      testCases.forEach(({ user, expected }) => {
        const result = robustAnswerChecker.checkAnswer(user, expected, 'short');
        expect(result.isCorrect).toBe(true);
        expect(result.method).toBe('fuzzy');
      });
    });

    it('should reject very different answers', () => {
      const result = robustAnswerChecker.checkAnswer('elephant', 'cat', 'short');
      
      expect(result.isCorrect).toBe(false);
      expect(result.correction).toContain('The correct answer is cat');
    });
  });

  describe('checkOpenAnswer', () => {
    it('should be lenient with open-ended questions', () => {
      const result = robustAnswerChecker.checkAnswer('I think it is blue', 'blue', 'open');
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('fuzzy');
    });

    it('should check for keywords in answers', () => {
      const result = robustAnswerChecker.checkAnswer('The color is red and bright', 'red color', 'open');
      
      expect(result.isCorrect).toBe(true);
    });

    it('should provide suggestions for incorrect open answers', () => {
      const result = robustAnswerChecker.checkAnswer('yellow', 'blue sky', 'open');
      
      expect(result.isCorrect).toBe(false);
      expect(result.explanation).toContain('Consider including: blue sky');
    });
  });

  describe('edge cases', () => {
    it('should handle empty answers', () => {
      const result = robustAnswerChecker.checkAnswer('', 'cat', 'short');
      
      expect(result.isCorrect).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle special characters and punctuation', () => {
      const result = robustAnswerChecker.checkAnswer('hello!', 'hello', 'short');
      
      expect(result.isCorrect).toBe(true);
    });

    it('should handle fractions in math', () => {
      const result = robustAnswerChecker.checkAnswer('1.5', '1.5', 'math');
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('math');
    });

    it('should handle negative numbers', () => {
      const result = robustAnswerChecker.checkAnswer('-5', '-5', 'math');
      
      expect(result.isCorrect).toBe(true);
      expect(result.method).toBe('math');
    });
  });

  describe('confidence scores', () => {
    it('should provide appropriate confidence scores', () => {
      const exactMatch = robustAnswerChecker.checkAnswer('cat', 'cat', 'short');
      const fuzzyMatch = robustAnswerChecker.checkAnswer('cats', 'cat', 'short');
      const wrongAnswer = robustAnswerChecker.checkAnswer('dog', 'cat', 'short');
      
      expect(exactMatch.confidence).toBeGreaterThan(fuzzyMatch.confidence);
      expect(fuzzyMatch.confidence).toBeGreaterThan(wrongAnswer.confidence);
    });

    it('should return high confidence for math exact matches', () => {
      const result = robustAnswerChecker.checkAnswer('4', '4', 'math');
      
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('error handling', () => {
    it('should handle unknown question types gracefully', () => {
      const result = robustAnswerChecker.checkAnswer('answer', 'expected', 'unknown' as any);
      
      expect(result).toBeDefined();
      expect(result.method).toBe('fuzzy');
    });

    it('should handle malformed inputs', () => {
      const result = robustAnswerChecker.checkAnswer(null as any, 'expected', 'short');
      
      expect(result).toBeDefined();
      expect(result.isCorrect).toBe(false);
    });
  });
});