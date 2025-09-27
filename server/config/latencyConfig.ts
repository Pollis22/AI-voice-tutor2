// Latency optimization configuration with environment variable support

export const latencyConfig = {
  // ASR (Automatic Speech Recognition) settings
  asr: {
    minDurationMs: parseInt(process.env.ASR_MIN_MS || '200'),
    minConfidence: parseFloat(process.env.ASR_MIN_CONFIDENCE || '0.30'),
    streamPartials: process.env.STREAM_PARTIALS === 'true'
  },
  
  // VAD (Voice Activity Detection) settings
  vad: {
    silenceMs: parseInt(process.env.VAD_SILENCE_MS || '250'),
    maxUtteranceMs: parseInt(process.env.MAX_UTTERANCE_MS || '6000')
  },
  
  // TTS (Text-to-Speech) settings
  tts: {
    streaming: process.env.TTS_STREAMING !== 'false', // Default true
    chunkSize: 2 // Sentences per chunk
  },
  
  // LLM settings
  llm: {
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2'),
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '3500'),
    targetFirstTokenMs: 1200 // Target for first token
  },
  
  // Response timing
  response: {
    microAckDelayMs: 300, // Send micro-ack after this delay
    microAckMaxMs: 500,    // Don't send micro-ack if response is ready within this time
    fillerDelayMs: 1200    // Send "I'm thinking..." if no response by this time
  }
};

// Micro-acknowledgement pool
export const microAckPool = [
  "Got it — thanks.",
  "I hear you.", 
  "Nice try, let's check it.",
  "Thanks — let me think with you.",
  "Let me see...",
  "Okay, thinking..."
];

// Subject-specific fallback pools
export const fallbackPools = {
  math: [
    "Let's add 1 to 2 together — what do we get?",
    "Count up from 2: 2, 3… what comes next?",
    "Think of three items in a row — which position is last?",
    "If you have 2 apples and get 1 more, how many do you have?",
    "What's bigger: 3 or 5?",
    "Can you count to 5 for me?"
  ],
  english: [
    "Let's spot a noun — which word names a person, place, or thing?",
    "Try a verb — which word shows an action?", 
    "Look for an adjective — which word describes a thing?",
    "Can you name an animal that starts with 'C'?",
    "What rhymes with 'cat'?",
    "Complete this sentence: The dog is ___."
  ],
  spanish: [
    "How do you say 'hello' in Spanish?",
    "What color is 'rojo' in English?",
    "Count to three in Spanish — uno, dos...?",
    "What does 'gracias' mean?",
    "How do you say 'goodbye' in Spanish?",
    "Is 'gato' a cat or a dog?"
  ]
};

// Get a random item from an array
export function getRandomFromPool<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}