// Security middleware for production deployment
import { Request, Response, NextFunction } from 'express';

export function setupSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy for ElevenLabs integration
  const cspDirectives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-eval'", // Required for ElevenLabs AudioWorklet
      ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-inline'"]), // Only in development
      "https://unpkg.com", // ElevenLabs ConvAI widget
      "https://api.elevenlabs.io", // ElevenLabs scripts
      "https://api.us.elevenlabs.io", // ElevenLabs US scripts
      "https://js.stripe.com", // Stripe.js
      "https://www.googletagmanager.com", // Google Analytics
      "https://www.google-analytics.com"
    ],
    'connect-src': [
      "'self'",
      "https://api.elevenlabs.io", // ElevenLabs API
      "https://api.us.elevenlabs.io", // ElevenLabs US API
      "wss://api.elevenlabs.io", // ElevenLabs WebSocket
      "wss://api.us.elevenlabs.io", // ElevenLabs US WebSocket
      "https://api.stripe.com", // Stripe API
      "https://m.stripe.network", // Stripe network
      "https://www.google-analytics.com", // Analytics
      "https://region1.google-analytics.com"
    ],
    'media-src': [
      "'self'",
      "https://api.elevenlabs.io", // ElevenLabs audio
      "https://api.us.elevenlabs.io", // ElevenLabs US audio
      "data:", // Base64 audio data
      "blob:" // Audio blobs
    ],
    'frame-src': [
      "'self'",
      "https://js.stripe.com" // Stripe Elements
    ],
    'img-src': [
      "'self'",
      "data:",
      "https:", // Allow images from any HTTPS source
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for dynamic styles
      "https://fonts.googleapis.com"
    ],
    'font-src': [
      "'self'",
      "https://fonts.gstatic.com"
    ],
    'worker-src': [
      "'self'",
      "blob:", // Web Workers
      "https://unpkg.com", // ElevenLabs worker scripts
      "https://api.elevenlabs.io", // ElevenLabs workers
      "https://api.us.elevenlabs.io" // ElevenLabs US workers
    ]
  };

  // Build CSP string
  const csp = Object.entries(cspDirectives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');

  // Set security headers
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Production security headers
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', csp + '; upgrade-insecure-requests');
  }

  // Permissions Policy for microphone access
  res.setHeader('Permissions-Policy', [
    'microphone=(self)',
    'camera=()',
    'geolocation=()',
    'payment=(self "https://js.stripe.com")'
  ].join(', '));

  next();
}

export function setupCORS(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    process.env.REPLIT_DOMAIN || '',
    process.env.CUSTOM_DOMAIN || ''
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin requests (no origin header)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Don't set CORS headers for disallowed origins
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}