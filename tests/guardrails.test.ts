import { describe, it, expect, beforeEach } from '@jest/globals';
import { guardrails } from '../server/services/guardrails';

describe('TutorGuardrails', () => {
  beforeEach(() => {
    // Clear any existing state
    guardrails['recentResponses'].clear();
  });

  describe('sanitizeTutorQuestion', () => {
    it('should replace ableist/assumptive patterns with inclusive language', () => {
      const tests = [
        {
          input: 'how many fingers do you have?',
          expected: 'How many fingers are typically on a hand?'
        },
        {
          input: 'can you see the number?',
          expected: 'What do you notice about the number?'
        },
        {
          input: 'stand up and count to three',
          expected: 'Imagine you count to three'
        },
        {
          input: 'clap your hands for each number',
          expected: 'Count the claps: clap, clap for each number'
        },
        {
          input: 'point to your nose',
          expected: 'Name the body part: nose'
        }
      ];

      tests.forEach(({ input, expected }) => {
        const result = guardrails.sanitizeTutorQuestion(input);
        expect(result).toBe(expected);
      });
    });

    it('should soften physical commands with imagination', () => {
      const tests = [
        {
          input: 'you walk to the board',
          expected: 'Imagine you walk to the board'
        },
        {
          input: 'jump up three times',
          expected: 'Imagine you jump three times'
        },
        {
          input: 'run around the room',
          expected: 'Imagine moving around the room'
        }
      ];

      tests.forEach(({ input, expected }) => {
        const result = guardrails.sanitizeTutorQuestion(input);
        expect(result).toBe(expected);
      });
    });

    it('should normalize capitalization', () => {
      const input = 'what comes after two?';
      const result = guardrails.sanitizeTutorQuestion(input);
      expect(result.charAt(0)).toBe('W');
    });
  });

  describe('avoidRepeat', () => {
    it('should allow first occurrence of content', () => {
      const sessionId = 'test-session';
      const content = 'What comes after 2?';
      
      const result = guardrails.avoidRepeat(sessionId, content);
      expect(result).toBe(content);
    });

    it('should detect exact duplicates and return step hint', () => {
      const sessionId = 'test-session';
      const content = 'What comes after 2?';
      
      // First occurrence - should pass through
      guardrails.avoidRepeat(sessionId, content);
      
      // Second occurrence - should return hint
      const result = guardrails.avoidRepeat(sessionId, content);
      expect(result).not.toBe(content);
      expect(result).toContain('think');
    });

    it('should detect high similarity (>85%) and return step hint', () => {
      const sessionId = 'test-session';
      const content1 = 'What comes after 2?';
      const content2 = 'What number comes after 2?';
      
      guardrails.avoidRepeat(sessionId, content1);
      const result = guardrails.avoidRepeat(sessionId, content2);
      
      expect(result).not.toBe(content2);
      expect(result).toContain('think');
    });

    it('should maintain separate histories for different sessions', () => {
      const content = 'What comes after 2?';
      
      guardrails.avoidRepeat('session1', content);
      const result = guardrails.avoidRepeat('session2', content);
      
      expect(result).toBe(content); // Should be allowed for session2
    });

    it('should limit history to maxRecent entries', () => {
      const sessionId = 'test-session';
      
      // Add more than maxRecent entries
      for (let i = 0; i < 5; i++) {
        guardrails.avoidRepeat(sessionId, `Question ${i}`);
      }
      
      // Should allow reuse of early questions
      const result = guardrails.avoidRepeat(sessionId, 'Question 0');
      expect(result).toBe('Question 0');
    });
  });

  describe('enforceFormat', () => {
    it('should limit to 2 sentences', () => {
      const longText = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const result = guardrails.enforceFormat(longText);
      
      const sentences = result.split('. ').length;
      expect(sentences).toBeLessThanOrEqual(3); // Account for added question
    });

    it('should add question if response does not end with ?', () => {
      const statement = 'This is a statement.';
      const result = guardrails.enforceFormat(statement);
      
      expect(result).toMatch(/\?$/);
    });

    it('should preserve existing questions', () => {
      const question = 'What comes after 2?';
      const result = guardrails.enforceFormat(question);
      
      expect(result).toBe(question);
    });

    it('should replace ending punctuation before adding question', () => {
      const statement = 'Count to three!';
      const result = guardrails.enforceFormat(statement);
      
      expect(result).not.toContain('!');
      expect(result).toMatch(/\?$/);
    });
  });

  describe('preventUserFabrication', () => {
    it('should remove assistant messages with forbidden phrases', () => {
      const messages = [
        { role: 'system', content: 'You are a tutor' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'You said hello earlier.' },
        { role: 'user', content: 'What comes after 2?' },
        { role: 'assistant', content: 'The answer is 3.' }
      ];

      const filtered = guardrails.preventUserFabrication(messages);
      
      expect(filtered).toHaveLength(4);
      expect(filtered[2].content).toBe('The answer is 3.');
    });

    it('should preserve valid assistant messages', () => {
      const messages = [
        { role: 'system', content: 'You are a tutor' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hello! Ready to learn?' },
        { role: 'user', content: 'Yes' }
      ];

      const filtered = guardrails.preventUserFabrication(messages);
      
      expect(filtered).toHaveLength(4);
      expect(filtered).toEqual(messages);
    });

    it('should preserve all user and system messages', () => {
      const messages = [
        { role: 'system', content: 'You are a tutor' },
        { role: 'user', content: 'You said this would be easy' },
        { role: 'assistant', content: 'You mentioned that you wanted help.' }
      ];

      const filtered = guardrails.preventUserFabrication(messages);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].role).toBe('system');
      expect(filtered[1].role).toBe('user');
    });

    it('should check all forbidden phrases case-insensitively', () => {
      const forbiddenPhrases = [
        'YOU SAID:',
        'you mentioned:',
        'You Told Me:',
        'you asked:',
        'YOUR ANSWER WAS:',
        'you responded:'
      ];

      forbiddenPhrases.forEach(phrase => {
        const messages = [
          { role: 'assistant', content: `${phrase} something` }
        ];
        
        const filtered = guardrails.preventUserFabrication(messages);
        expect(filtered).toHaveLength(0);
      });
    });
  });
});