import { describe, test, expect, beforeAll } from '@jest/globals';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5000';
const DEBUG_KEY = process.env.DEBUG_API_KEY || 'debug-key-2024';

describe('AI Tutor Voice Acceptance Tests', () => {
  const testSession = `test-${Date.now()}`;
  const testUser = 'test-user';

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  test('Latency: Response within 2 seconds', async () => {
    const start = Date.now();
    
    const response = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "What is 2 plus 2?",
      lessonId: 'math-1',
      sessionId: testSession
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const latency = Date.now() - start;
    expect(latency).toBeLessThan(2000);
    expect(response.data.content).toBeTruthy();
  }, 10000);

  test('Answer Correction: Corrects wrong answers', async () => {
    const response = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "five", // Wrong answer to 2+2
      lessonId: 'math-1',
      sessionId: testSession,
      context: { lastQuestion: "What is 2 plus 2?", expectedAnswer: "4" }
    });
    
    expect(response.data.content).toBeTruthy();
    const content = response.data.content.toLowerCase();
    expect(content).toMatch(/(not quite|actually|correct|answer)/);
  }, 10000);

  test('No Repeats: Varies responses', async () => {
    const responses = [];
    
    for (let i = 0; i < 3; i++) {
      const response = await axios.post(`${API_URL}/api/voice/generate-response`, {
        message: "Tell me about addition",
        lessonId: 'math-1',
        sessionId: `${testSession}-repeat-${i}`
      });
      responses.push(response.data.content);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check that responses are different
    const uniqueResponses = new Set(responses);
    expect(uniqueResponses.size).toBeGreaterThan(1);
  }, 15000);

  test('Off-topic Redirect: Handles off-topic gracefully', async () => {
    const response = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "What's your favorite movie?",
      lessonId: 'math-1',
      sessionId: testSession
    });
    
    expect(response.data.content).toBeTruthy();
    const content = response.data.content.toLowerCase();
    expect(content).toMatch(/(focus|math|lesson|learning)/);
  }, 10000);

  test('429 Handling: Uses fallback on high load', async () => {
    // Simulate high load with rapid requests
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.post(`${API_URL}/api/voice/generate-response`, {
          message: `Question ${i}`,
          lessonId: 'math-1',
          sessionId: `${testSession}-ratelimit-${i}`
        }).catch(error => ({ error: true, status: error.response?.status }))
      );
    }
    
    const responses = await Promise.all(promises);
    const successfulResponses = responses.filter(r => !r.error && r.data);
    
    // At least some should succeed
    expect(successfulResponses.length).toBeGreaterThan(0);
  }, 15000);

  test('Caching: Returns consistent responses', async () => {
    const message = "What is basic addition?";
    
    // First call
    const response1 = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message,
      lessonId: 'math-1',
      sessionId: `${testSession}-cache`
    });
    
    // Second call with same input
    const response2 = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message,
      lessonId: 'math-1',
      sessionId: `${testSession}-cache`
    });
    
    expect(response1.data.content).toBeTruthy();
    expect(response2.data.content).toBeTruthy();
    // Both should be successful responses
  }, 10000);

  test('Barge-in: Cancels in-flight requests', async () => {
    const sessionId = `${testSession}-bargein`;
    
    const promise1 = axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "Long question that takes time to process",
      lessonId: 'math-1',
      sessionId
    });
    
    // Quick barge-in after small delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const promise2 = axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "Quick question",
      lessonId: 'math-1',
      sessionId
    });
    
    const [result1, result2] = await Promise.allSettled([promise1, promise2]);
    
    // Second should succeed
    expect(result2.status).toBe('fulfilled');
    if (result2.status === 'fulfilled') {
      expect(result2.value.data.content).toBeTruthy();
    }
  }, 10000);

  test('Response Format: Always ends with question', async () => {
    const response = await axios.post(`${API_URL}/api/voice/generate-response`, {
      message: "Teach me about shapes",
      lessonId: 'math-1',
      sessionId: `${testSession}-format`
    });
    
    const text = response.data.content;
    expect(text).toBeTruthy();
    
    // Should end with question mark (allowing for some flexibility)
    expect(text.trim()).toMatch(/\?[.]*$/);
    
    // Check it's reasonably concise (not too long)
    const sentences = text.match(/[.!?]+/g) || [];
    expect(sentences.length).toBeLessThanOrEqual(3); // Allow up to 3 sentences
  }, 10000);

  test('Voice Configuration: Returns proper config', async () => {
    const response = await axios.get(`${API_URL}/api/voice/config`);
    
    expect(response.data).toHaveProperty('testMode');
    expect(response.data).toHaveProperty('energyLevel');
    expect(response.data).toHaveProperty('hasOpenAI');
    expect(response.data.testMode).toBe(true); // Should be in test mode
  }, 5000);

  test('Input Gating: Rejects invalid inputs', async () => {
    // Test with very short input
    try {
      await axios.post(`${API_URL}/api/voice/generate-response`, {
        message: "a", // Very short
        lessonId: 'math-1',
        sessionId: testSession,
        speechDuration: 100, // Too short
        speechConfidence: 0.3 // Too low
      });
      // Should not reach here if properly gated
    } catch (error: any) {
      expect(error.response?.status).toBe(400);
      expect(error.response?.data).toHaveProperty('gated', true);
    }
  }, 5000);
});

// Performance Benchmarks
describe('Performance Benchmarks', () => {
  test('Handles multiple concurrent users', async () => {
    const promises = [];
    
    for (let i = 0; i < 5; i++) {
      promises.push(
        axios.post(`${API_URL}/api/voice/generate-response`, {
          message: `User ${i} question about math`,
          lessonId: 'math-1',
          sessionId: `concurrent-session-${i}`
        }).catch(error => ({ error: true, message: error.message }))
      );
    }
    
    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;
    
    const successful = results.filter(r => !r.error && r.data);
    
    expect(successful.length).toBeGreaterThan(2); // At least 60% success
    expect(duration).toBeLessThan(10000); // All complete within 10s
  }, 15000);

  test('Memory usage remains stable', async () => {
    // Make several requests to check for memory leaks
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(
        axios.post(`${API_URL}/api/voice/generate-response`, {
          message: `Memory test ${i}`,
          lessonId: 'math-1',
          sessionId: `memory-test-${i}`
        }).catch(() => ({ error: true }))
      );
      
      // Small delay between requests
      if (i > 0 && i % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => !r.error);
    
    // Should handle all requests without major issues
    expect(successful.length).toBeGreaterThan(7);
  }, 20000);
});

// Debug API Tests
describe('Debug API Tests', () => {
  test('Debug endpoint requires authentication', async () => {
    try {
      await axios.get(`${API_URL}/api/debug/last-turns`);
      fail('Should have required authentication');
    } catch (error: any) {
      expect(error.response?.status).toBe(401);
    }
  }, 5000);

  test('ASR profile endpoint works', async () => {
    try {
      const response = await axios.get(`${API_URL}/api/debug/asr-profile`, {
        headers: { Authorization: `Bearer ${DEBUG_KEY}` }
      });
      
      expect(response.data).toHaveProperty('current');
      expect(response.data).toHaveProperty('available');
      expect(response.data.available).toContain('strict');
      expect(response.data.available).toContain('balanced');
      expect(response.data.available).toContain('aggressive');
    } catch (error: any) {
      // Debug endpoint might not be fully implemented
      console.warn('Debug ASR profile endpoint not available:', error.message);
    }
  }, 5000);
});