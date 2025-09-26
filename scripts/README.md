# AI Tutor Scalability Test Scripts

This directory contains test scripts to validate the scalability architecture of the AI Tutor platform, designed to handle up to 1,000 concurrent subscribers.

## Test Scripts

### 1. Concurrent User Test (`test-concurrent-users.js`)

Simulates 3 parallel users making requests to test:
- Circuit breaker functionality
- User queue management (concurrency=1 per session)
- Semantic cache performance
- Input gating and debouncing
- Anti-repeat logic
- Overall system stability under load

**Usage:**
```bash
cd scripts
npm install
npm run test:concurrent

# Or with custom settings:
BASE_URL=http://localhost:5000 node test-concurrent-users.js
```

**What it tests:**
- 3 simulated users with different lesson scenarios (Math, English, Spanish)
- 5 requests per user with realistic delays
- Validates response times, cache hit rates, circuit breaker behavior
- Comprehensive performance metrics and assessment

### 2. Health Check Test (`test-health-check.js`)

Quick validation of system health and observability endpoints.

**Usage:**
```bash
npm run test:health

# Or directly:
node test-health-check.js
```

**What it checks:**
- System health status and memory usage
- Circuit breaker state
- Cache performance
- Voice configuration
- Environment flags

## Environment Variables

The test scripts respect the following environment variables:

- `BASE_URL` - Target server URL (default: http://localhost:5000)
- `USE_REALTIME` - Whether to test Realtime API mode
- `VOICE_TEST_MODE` - Voice service test mode
- `CACHE_TTL_MIN` - Cache TTL in minutes
- `ASR_MIN_MS` - Minimum ASR duration threshold
- `ASR_MIN_CONFIDENCE` - Minimum ASR confidence threshold

## Test Results Interpretation

### Concurrent User Test Results

**Success Rate:**
- 95%+ = Excellent system performance
- 85-95% = Good performance with minor issues
- 75-85% = Fair performance, may need optimization
- <75% = Poor performance, requires investigation

**Response Times:**
- <2s = Fast (excellent)
- 2-5s = Moderate (acceptable)
- >5s = Slow (needs optimization)

**Key Metrics:**
- Cache Hit Rate: Higher is better (indicates semantic cache effectiveness)
- Circuit Breaker Activations: Should be 0 under normal load
- Queue Depth: Should remain low (effective queue management)
- Fallback Uses: Indicates system resilience

### Health Check Results

**Status Codes:**
- 200 = Healthy system
- 503 = Degraded (circuit breaker open, high memory, etc.)
- 500 = Error condition

## Production Monitoring

In production, these health endpoints can be used for:

1. **Load Balancer Health Checks**: `/api/observability/health`
2. **Monitoring Dashboards**: `/api/observability/metrics`
3. **Alerting**: Monitor memory usage, circuit breaker state, error rates
4. **Capacity Planning**: Track queue metrics and response times

## Dependencies

- `node-fetch@^2.6.7` - For HTTP requests

## Running Tests in CI/CD

Example GitHub Actions usage:

```yaml
- name: Install test dependencies
  run: cd scripts && npm install

- name: Run health check
  run: cd scripts && npm run test:health

- name: Run concurrent user test
  run: cd scripts && npm run test:concurrent
```

## Troubleshooting

**Common Issues:**

1. **Connection refused**: Make sure the server is running on the expected port
2. **Auth errors**: Some endpoints require admin authentication in production
3. **Timeout errors**: Increase delays between requests or reduce concurrent users
4. **Memory warnings**: Monitor system memory usage during tests

**Debugging:**

Check server logs for detailed error information:
```bash
# View workflow logs
tail -f /tmp/logs/*.log

# Check specific error patterns
grep -i error /tmp/logs/*.log
```