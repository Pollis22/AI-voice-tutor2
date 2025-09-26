#!/usr/bin/env node
/**
 * Concurrent User Test Script
 * 
 * Tests the scalability architecture with 3 simulated users making parallel requests
 * to validate circuit breaker, user queues, semantic cache, and input gating.
 */

const fetch = require('node-fetch');

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const NUM_USERS = 3;
const REQUESTS_PER_USER = 5;
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second

// Test data for different lessons
const TEST_SCENARIOS = [
  {
    lessonId: 'math-basic-addition',
    messages: [
      'What is 2 + 3?',
      'Can you help me with addition?',
      'How do I add numbers?',
      'What is 5 + 7?',
      'Can you explain addition to me?'
    ]
  },
  {
    lessonId: 'english-vocabulary',
    messages: [
      'What does the word "happy" mean?',
      'Can you help me with vocabulary?',
      'What is a noun?',
      'How do I use adjectives?',
      'What does "beautiful" mean?'
    ]
  },
  {
    lessonId: 'spanish-greetings',
    messages: [
      '¿Cómo se dice "hello" en español?',
      'How do I greet someone in Spanish?',
      'What does "hola" mean?',
      'Can you teach me Spanish greetings?',
      '¿Cómo estás?'
    ]
  }
];

// Simulated user class
class SimulatedUser {
  constructor(userId, scenario) {
    this.userId = userId;
    this.scenario = scenario;
    this.sessionId = `test-session-${userId}-${Date.now()}`;
    this.results = [];
    this.errors = [];
  }

  async makeRequest(message, requestIndex) {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${BASE_URL}/api/voice/generate-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `connect.sid=test-session-${this.userId}` // Simulate session
        },
        body: JSON.stringify({
          message,
          lessonId: this.scenario.lessonId,
          sessionId: this.sessionId,
          energyLevel: 'upbeat',
          speechDuration: 500 + Math.random() * 1000, // 500-1500ms
          speechConfidence: 0.6 + Math.random() * 0.4  // 0.6-1.0
        })
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        data = { error: 'Failed to parse response' };
      }

      const result = {
        userId: this.userId,
        requestIndex,
        message: message.substring(0, 50) + '...',
        status: response.status,
        responseTime,
        timestamp: new Date().toISOString(),
        usedFallback: data.usedFallback || false,
        usedCache: data.usedCache || false,
        retryCount: data.retryCount || 0,
        breakerOpen: data.breakerOpen || false,
        queueDepth: data.queueDepth || 0,
        error: response.status >= 400 ? data.error || 'Request failed' : null
      };

      this.results.push(result);
      
      console.log(`[User ${this.userId}] Request ${requestIndex}: ${response.status} (${responseTime}ms) - ${data.content ? 'Success' : 'Error'}`);
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const errorResult = {
        userId: this.userId,
        requestIndex,
        message: message.substring(0, 50) + '...',
        status: 0,
        responseTime: endTime - startTime,
        timestamp: new Date().toISOString(),
        error: error.message
      };
      
      this.errors.push(errorResult);
      console.error(`[User ${this.userId}] Request ${requestIndex} failed:`, error.message);
      
      return errorResult;
    }
  }

  async runTest() {
    console.log(`\n🔄 Starting test for User ${this.userId} (${this.scenario.lessonId})`);
    
    for (let i = 0; i < REQUESTS_PER_USER; i++) {
      const message = this.scenario.messages[i % this.scenario.messages.length];
      await this.makeRequest(message, i + 1);
      
      // Delay between requests to simulate realistic usage
      if (i < REQUESTS_PER_USER - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }
    
    console.log(`✅ User ${this.userId} completed ${this.results.length} requests with ${this.errors.length} errors`);
    return {
      userId: this.userId,
      results: this.results,
      errors: this.errors,
      totalRequests: this.results.length + this.errors.length,
      successRate: this.results.length / (this.results.length + this.errors.length) * 100
    };
  }
}

// Test orchestrator
async function runConcurrentUserTest() {
  console.log('🚀 Starting Concurrent User Test');
  console.log(`📊 Testing ${NUM_USERS} users with ${REQUESTS_PER_USER} requests each`);
  console.log(`🌐 Target: ${BASE_URL}`);
  console.log('─'.repeat(60));

  // Create simulated users
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    const scenario = TEST_SCENARIOS[i % TEST_SCENARIOS.length];
    users.push(new SimulatedUser(i + 1, scenario));
  }

  // Start all users concurrently
  const startTime = Date.now();
  const userPromises = users.map(user => user.runTest());
  
  try {
    // Wait for all users to complete
    const userResults = await Promise.all(userPromises);
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Analyze results
    console.log('\n📈 Test Results Summary');
    console.log('─'.repeat(60));
    
    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;
    let cacheHits = 0;
    let fallbackUses = 0;
    let circuitBreakerActivations = 0;

    userResults.forEach(userResult => {
      totalRequests += userResult.totalRequests;
      totalErrors += userResult.errors.length;
      
      userResult.results.forEach(result => {
        totalResponseTime += result.responseTime;
        if (result.usedCache) cacheHits++;
        if (result.usedFallback) fallbackUses++;
        if (result.breakerOpen) circuitBreakerActivations++;
      });
      
      console.log(`User ${userResult.userId}: ${userResult.results.length}/${userResult.totalRequests} success (${userResult.successRate.toFixed(1)}%)`);
    });

    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    const overallSuccessRate = ((totalRequests - totalErrors) / totalRequests) * 100;

    console.log('\n🎯 Performance Metrics:');
    console.log(`• Total Duration: ${totalDuration}ms`);
    console.log(`• Total Requests: ${totalRequests}`);
    console.log(`• Success Rate: ${overallSuccessRate.toFixed(1)}%`);
    console.log(`• Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`• Cache Hits: ${cacheHits}/${totalRequests} (${(cacheHits/totalRequests*100).toFixed(1)}%)`);
    console.log(`• Fallback Uses: ${fallbackUses}`);
    console.log(`• Circuit Breaker Activations: ${circuitBreakerActivations}`);

    // Fetch final system metrics
    try {
      const metricsResponse = await fetch(`${BASE_URL}/api/observability/metrics`);
      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json();
        console.log('\n🔍 System State After Test:');
        console.log(`• Active Sessions: ${metrics.queues?.activeSessions || 'N/A'}`);
        console.log(`• Circuit Breaker: ${metrics.circuitBreaker?.state || 'N/A'}`);
        console.log(`• Cache Size: ${metrics.cache?.size || 'N/A'} entries`);
        console.log(`• Cache Hit Rate: ${metrics.cache?.hitRate || 'N/A'}%`);
        console.log(`• Total Queue Operations: ${metrics.queues?.totalOperations || 'N/A'}`);
      }
    } catch (error) {
      console.log('⚠️  Could not fetch system metrics');
    }

    // Test assessment
    console.log('\n🏆 Test Assessment:');
    if (overallSuccessRate >= 95) {
      console.log('✅ EXCELLENT: System handled concurrent load very well');
    } else if (overallSuccessRate >= 85) {
      console.log('✅ GOOD: System handled concurrent load well');
    } else if (overallSuccessRate >= 75) {
      console.log('⚠️  FAIR: System handled load but with some issues');
    } else {
      console.log('❌ POOR: System struggled with concurrent load');
    }

    if (avgResponseTime < 2000) {
      console.log('⚡ Fast response times');
    } else if (avgResponseTime < 5000) {
      console.log('🐌 Moderate response times');
    } else {
      console.log('🐌 Slow response times - may need optimization');
    }

    console.log('\n🎉 Concurrent User Test Complete!');
    
    return {
      success: true,
      totalDuration,
      userResults,
      overallMetrics: {
        totalRequests,
        successRate: overallSuccessRate,
        avgResponseTime,
        cacheHitRate: (cacheHits/totalRequests*100),
        fallbackUses,
        circuitBreakerActivations
      }
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if called directly
if (require.main === module) {
  runConcurrentUserTest()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runConcurrentUserTest, SimulatedUser };