import { test, expect } from '@playwright/test';

test.describe('AI Tutor Conversation Behavior Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set environment variables for testing
    process.env.VOICE_TEST_MODE = '1';
    process.env.ASR_MIN_MS = '300';
    process.env.ASR_MIN_CONFIDENCE = '0.5';
    process.env.DEBUG_TUTOR = '1';
    
    // Navigate to login
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/dashboard');
  });
  
  test('No fabricated "You" messages appear', async ({ page }) => {
    await page.goto('/lesson/math-1');
    await page.click('[data-testid="button-start-voice"]');
    
    // Send empty input
    const emptyResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          lessonId: 'math-1',
          sessionId: 'test-no-fabrication'
        }),
        credentials: 'include'
      });
      return { status: res.status };
    });
    
    expect(emptyResponse.status).toBe(400);
    
    // Check conversation history - no "You:" messages should appear
    const messages = await page.$$eval('[data-testid^="message-"]', els => 
      els.map(el => el.textContent)
    );
    
    const youMessages = messages.filter(msg => msg?.startsWith('You:'));
    expect(youMessages).toHaveLength(0);
  });
  
  test('Lesson stays on topic with topic guard', async ({ page }) => {
    await page.goto('/lesson/math-1');
    await page.click('[data-testid="button-start-voice"]');
    
    // Ask off-topic question
    const offTopicResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'How do you conjugate Spanish verbs?',
          lessonId: 'math-1',
          sessionId: 'test-topic-guard'
        }),
        credentials: 'include'
      });
      return res.json();
    });
    
    // Should redirect to math topic
    expect(offTopicResponse.content.toLowerCase()).toContain('math');
    expect(offTopicResponse.content).toMatch(/we're currently on|let's focus on|back to/i);
  });
  
  test('AI never repeats same fallback endlessly', async ({ page }) => {
    await page.goto('/lesson/english-1');
    
    const responses = [];
    
    // Simulate multiple API failures by calling with rate limit flag
    for (let i = 0; i < 5; i++) {
      const response = await page.evaluate(async (index) => {
        // Mock a rate-limited scenario
        const res = await fetch('/api/voice/generate-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Question ${index}`,
            lessonId: 'english-1',
            sessionId: 'test-no-repeat',
            // Force fallback by simulating rate limit
            _forceFallback: true
          }),
          credentials: 'include'
        });
        return res.json();
      }, i);
      
      responses.push(response.content);
    }
    
    // Check that we got different responses (no endless repetition)
    const uniqueResponses = new Set(responses);
    expect(uniqueResponses.size).toBeGreaterThan(2); // At least 3 different responses
  });
  
  test('Barge-in works correctly', async ({ page }) => {
    await page.goto('/lesson/spanish-1');
    await page.click('[data-testid="button-start-voice"]');
    
    // Start streaming response
    const streamPromise = page.evaluate(async () => {
      const eventSource = new EventSource(
        '/api/streaming/stream-response?message=Tell me about colors&lessonId=spanish-1&sessionId=test-bargein'
      );
      
      const events: any[] = [];
      
      return new Promise((resolve) => {
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          events.push(data);
          
          // Simulate barge-in after first sentence
          if (data.type === 'audio' && data.index === 0) {
            eventSource.close();
            resolve({ 
              interrupted: true, 
              eventsReceived: events.length,
              lastEvent: data
            });
          }
        };
        
        // Timeout if no interruption
        setTimeout(() => {
          eventSource.close();
          resolve({ 
            interrupted: false, 
            eventsReceived: events.length 
          });
        }, 5000);
      });
    });
    
    const result = await streamPromise;
    
    // Should have interrupted after first audio
    expect(result).toHaveProperty('interrupted', true);
    expect(result).toHaveProperty('eventsReceived');
    expect((result as any).eventsReceived).toBeGreaterThan(0);
    expect((result as any).eventsReceived).toBeLessThan(10); // Didn't receive all events
  });
  
  test('Concise responses (≤2 sentences) with questions', async ({ page }) => {
    await page.goto('/lesson/math-1');
    
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What comes after 5?',
          lessonId: 'math-1',
          sessionId: 'test-concise',
          speechDuration: 1500,
          speechConfidence: 0.9
        }),
        credentials: 'include'
      });
      return res.json();
    });
    
    // Split by sentence-ending punctuation
    const sentences = response.content.split(/[.!?]+/).filter(s => s.trim());
    
    // Should be ≤2 content sentences (plus possibly a question)
    expect(sentences.length).toBeLessThanOrEqual(3);
    
    // Should end with a question
    expect(response.content.trim()).toMatch(/\?$/);
  });
  
  test('ASR thresholds prevent low-quality input', async ({ page }) => {
    await page.goto('/lesson/english-1');
    
    // Test with speech too short
    const shortResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hi',
          lessonId: 'english-1',
          sessionId: 'test-asr-short',
          speechDuration: 200, // Below 300ms threshold
          speechConfidence: 0.9
        }),
        credentials: 'include'
      });
      return { 
        status: res.status, 
        data: await res.json() 
      };
    });
    
    expect(shortResponse.status).toBe(400);
    expect(shortResponse.data.error).toContain('brief');
    
    // Test with low confidence
    const lowConfResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What about nouns',
          lessonId: 'english-1',
          sessionId: 'test-asr-conf',
          speechDuration: 1000,
          speechConfidence: 0.3 // Below 0.5 threshold
        }),
        credentials: 'include'
      });
      return { 
        status: res.status, 
        data: await res.json() 
      };
    });
    
    expect(lowConfResponse.status).toBe(400);
    expect(lowConfResponse.data.error).toContain('understand');
  });
  
  test('Lesson reset clears context on switch', async ({ page }) => {
    // Start with math lesson
    await page.goto('/lesson/math-1');
    await page.click('[data-testid="button-start-voice"]');
    
    // Send a message to establish context
    await page.evaluate(async () => {
      await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'I want to learn about counting',
          lessonId: 'math-1',
          sessionId: 'test-reset'
        }),
        credentials: 'include'
      });
    });
    
    // Switch to Spanish lesson
    await page.goto('/lesson/spanish-1');
    await page.click('[data-testid="button-start-voice"]');
    
    // Ask about previous topic
    const switchedResponse = await page.evaluate(async () => {
      const res = await fetch('/api/voice/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Continue with counting',
          lessonId: 'spanish-1',
          sessionId: 'test-reset'
        }),
        credentials: 'include'
      });
      return res.json();
    });
    
    // Should be about Spanish, not continuing math
    expect(switchedResponse.content.toLowerCase()).toMatch(/spanish|español|hola/);
    expect(switchedResponse.content.toLowerCase()).not.toContain('counting');
  });
  
  test('Debug logs track conversation metrics', async ({ page }) => {
    // Enable debug mode
    process.env.DEBUG_TUTOR = '1';
    
    await page.goto('/lesson/math-1');
    
    // Generate some turns
    for (let i = 0; i < 3; i++) {
      await page.evaluate(async (index) => {
        await fetch('/api/voice/generate-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Question ${index}`,
            lessonId: 'math-1',
            sessionId: 'test-debug',
            speechDuration: 1000 + (index * 500),
            speechConfidence: 0.7 + (index * 0.1)
          }),
          credentials: 'include'
        });
      }, i);
    }
    
    // Check debug logs
    const debugLogs = await page.evaluate(async () => {
      const res = await fetch('/api/debug/last-turns?count=10', {
        credentials: 'include'
      });
      return res.json();
    });
    
    expect(debugLogs).toHaveProperty('summary');
    expect(debugLogs).toHaveProperty('logs');
    expect(debugLogs.logs.length).toBeGreaterThan(0);
    
    // Verify log structure
    const firstLog = debugLogs.logs[0];
    expect(firstLog).toHaveProperty('lessonId');
    expect(firstLog).toHaveProperty('subject');
    expect(firstLog).toHaveProperty('userInput');
    expect(firstLog).toHaveProperty('tutorResponse');
    expect(firstLog).toHaveProperty('usedFallback');
    expect(firstLog).toHaveProperty('retryCount');
    expect(firstLog).toHaveProperty('asrGated');
    expect(firstLog).toHaveProperty('durationMs');
    expect(firstLog).toHaveProperty('tokensUsed');
  });
});