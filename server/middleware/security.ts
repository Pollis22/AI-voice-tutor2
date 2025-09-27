// Security middleware for production deployment
import { Request, Response, NextFunction } from 'express';

export function setupSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy for ElevenLabs integration
  const cspDirectives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'", // Required for Vite in development
      "https://unpkg.com", // ElevenLabs ConvAI widget
      "https://www.googletagmanager.com", // Google Analytics
      "https://www.google-analytics.com"
    ],
    'connect-src': [
      "'self'",
      "https://api.elevenlabs.io", // ElevenLabs API
      "wss://api.elevenlabs.io", // ElevenLabs WebSocket
      "https://www.google-analytics.com", // Analytics
      "https://region1.google-analytics.com"
    ],
    'media-src': [
      "'self'",
      "https://api.elevenlabs.io", // ElevenLabs audio
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
      "blob:" // Web Workers
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
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}