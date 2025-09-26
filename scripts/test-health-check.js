#!/usr/bin/env node
/**
 * Health Check Test Script
 * 
 * Quick validation of system health and observability endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testHealthCheck() {
  console.log('🏥 Running Health Check Test');
  console.log(`🌐 Target: ${BASE_URL}`);
  console.log('─'.repeat(50));

  try {
    // Test main health endpoint
    console.log('Testing /api/observability/health...');
    const healthResponse = await fetch(`${BASE_URL}/api/observability/health`);
    const healthData = await healthResponse.json();
    
    console.log(`Status: ${healthResponse.status} (${healthData.status})`);
    console.log(`Uptime: ${healthData.uptime}s`);
    console.log(`Environment: ${healthData.environment}`);
    console.log(`Memory Usage: ${healthData.system?.memory?.heapUsedPercent || 'N/A'}%`);
    console.log(`Circuit Breaker: ${healthData.system?.circuitBreaker?.state || 'N/A'}`);
    console.log(`Use Realtime: ${healthData.flags?.useRealtime || false}`);
    
    // Test metrics endpoint (if available)
    console.log('\nTesting /api/observability/metrics...');
    try {
      const metricsResponse = await fetch(`${BASE_URL}/api/observability/metrics`);
      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json();
        console.log(`Cache Hit Rate: ${metrics.cache?.hitRate || 'N/A'}%`);
        console.log(`Active Sessions: ${metrics.queues?.activeSessions || 'N/A'}`);
        console.log(`Total Operations: ${metrics.queues?.totalOperations || 'N/A'}`);
      } else {
        console.log(`Metrics endpoint returned: ${metricsResponse.status}`);
      }
    } catch (error) {
      console.log('Metrics endpoint not accessible (may require auth)');
    }
    
    // Test voice config endpoint
    console.log('\nTesting /api/voice/config...');
    const configResponse = await fetch(`${BASE_URL}/api/voice/config`);
    if (configResponse.ok) {
      const config = await configResponse.json();
      console.log(`Test Mode: ${config.testMode}`);
      console.log(`Voice Name: ${config.voiceName}`);
      console.log(`Has Azure TTS: ${config.hasAzureTTS}`);
      console.log(`Has OpenAI: ${config.hasOpenAI}`);
      console.log(`Use Realtime: ${config.useRealtime || false}`);
    }
    
    console.log('\n✅ Health check complete!');
    
    return {
      success: true,
      health: healthData,
      healthStatus: healthResponse.status
    };
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run if called directly
if (require.main === module) {
  testHealthCheck()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testHealthCheck };