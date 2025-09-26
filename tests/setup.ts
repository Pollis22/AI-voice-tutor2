// Test setup for Jest acceptance tests
import axios from 'axios';

// Set default timeout for all axios requests in tests
axios.defaults.timeout = 10000;

// Global test setup
beforeAll(async () => {
  // Wait for server to be ready
  const maxAttempts = 10;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    try {
      await axios.get('http://localhost:5000/api/health');
      console.log('Server is ready for testing');
      break;
    } catch (error) {
      attempt++;
      if (attempt === maxAttempts) {
        throw new Error('Server failed to start within timeout period');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
});

// Fail fast on unhandled rejections in tests
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in tests:', reason);
  process.exit(1);
});