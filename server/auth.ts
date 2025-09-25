import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Secure session secret configuration
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    sessionSecret = 'development-session-secret-only';
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: false, // Set to false for development (HTTP)
      sameSite: 'none', // Allow cookies in cross-origin iframe
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      // Test mode authentication - completely DB-independent
      const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPass123!';
      
      if (isTestMode) {
        // Check if test credentials match (case-insensitive for email)
        if (username.toLowerCase() === testEmail.toLowerCase() && password === testPassword) {
          // Return hardcoded test user without DB interaction
          const testUser = {
            id: 'test-user-id',
            username: testEmail,
            email: testEmail,
            password: await hashPassword(testPassword),
            firstName: 'Test',
            lastName: 'User',
            subscriptionPlan: 'all' as const,
            subscriptionStatus: 'active' as const,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            weeklyVoiceMinutesUsed: 0,
            weeklyResetDate: new Date(),
            preferredLanguage: 'english',
            voiceStyle: 'cheerful',
            speechSpeed: '1.0',
            volumeLevel: 75,
            isAdmin: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return done(null, testUser);
        }
        // If test credentials don't match, fail authentication
        return done(null, false);
      }
      
      // Normal authentication flow
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    // Handle test user deserialization
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && id === 'test-user-id') {
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testUser = {
        id: 'test-user-id',
        username: testEmail,
        email: testEmail,
        password: await hashPassword(process.env.TEST_USER_PASSWORD || 'TestPass123!'),
        firstName: 'Test',
        lastName: 'User',
        subscriptionPlan: 'all' as const,
        subscriptionStatus: 'active' as const,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        weeklyVoiceMinutesUsed: 0,
        weeklyResetDate: new Date(),
        preferredLanguage: 'english',
        voiceStyle: 'cheerful',
        speechSpeed: '1.0',
        volumeLevel: 75,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return done(null, testUser);
    }
    
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(null, null);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    // Sanitize user response to exclude sensitive fields
    const { password, ...safeUser } = req.user as any;
    res.status(200).json(safeUser);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // Sanitize user response to exclude sensitive fields
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });
}
