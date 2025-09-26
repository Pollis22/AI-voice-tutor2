import {
  users,
  subjects,
  lessons,
  userProgress,
  learningSessions,
  quizAttempts,
  type User,
  type InsertUser,
  type Subject,
  type Lesson,
  type UserProgress,
  type LearningSession,
  type QuizAttempt,
  type InsertLearningSession,
  type InsertQuizAttempt,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, count, sum, sql, like, or } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import MemoryStore from "memorystore";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSettings(userId: string, settings: Partial<User>): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string | null): Promise<User>;
  updateUserSubscription(userId: string, plan: 'single' | 'all', status: 'active' | 'canceled' | 'paused'): Promise<User>;
  updateUserVoiceUsage(userId: string, minutesUsed: number): Promise<void>;
  canUserUseVoice(userId: string): Promise<boolean>;

  // Dashboard operations
  getUserDashboard(userId: string): Promise<any>;
  getResumeSession(userId: string): Promise<any>;

  // Lesson operations
  getAllSubjects(): Promise<Subject[]>;
  getSubjectLessons(subjectId: string): Promise<Lesson[]>;
  getLessonById(lessonId: string): Promise<Lesson | undefined>;
  getUserProgress(userId: string, lessonId: string): Promise<UserProgress | undefined>;
  updateUserProgress(userId: string, lessonId: string, progress: Partial<UserProgress>): Promise<UserProgress>;

  // Session operations
  createLearningSession(session: InsertLearningSession): Promise<LearningSession>;
  endLearningSession(sessionId: string, userId: string, updates: Partial<LearningSession>): Promise<LearningSession>;
  getUserSessions(userId: string): Promise<LearningSession[]>;

  // Quiz operations
  createQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt>;
  getUserQuizAttempts(userId: string, lessonId?: string): Promise<QuizAttempt[]>;

  // Admin operations
  getAdminUsers(options: { page: number; limit: number; search: string }): Promise<any>;
  getAdminStats(): Promise<any>;
  exportUsersCSV(): Promise<string>;

  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  private testSessions: LearningSession[] = [];
  private testQuizAttempts: QuizAttempt[] = [];
  private testUserProgress: Map<string, UserProgress> = new Map();

  constructor() {
    // Use MemoryStore for development testing when database is not available
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode || !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) {
      console.log("Using in-memory session store for development");
      const SessionMemoryStore = MemoryStore(session);
      this.sessionStore = new SessionMemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
    } else {
      this.sessionStore = new PostgresSessionStore({ 
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false 
      });
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    // Return test user in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && id === 'test-user-id') {
      return {
        id: 'test-user-id',
        username: 'test@example.com',
        email: 'test@example.com',
        password: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        subscriptionPlan: 'all',
        subscriptionStatus: 'active',
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
      } as User;
    }
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser as any)
      .returning();
    return user;
  }

  async updateUserSettings(userId: string, settings: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, plan: 'single' | 'all', status: 'active' | 'canceled' | 'paused'): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionPlan: plan,
        subscriptionStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserVoiceUsage(userId: string, minutesUsed: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    // Check if we need to reset weekly usage
    const now = new Date();
    const weeksSinceReset = Math.floor((now.getTime() - new Date(user.weeklyResetDate!).getTime()) / (7 * 24 * 60 * 60 * 1000));
    
    if (weeksSinceReset >= 1) {
      // Reset weekly usage
      await db
        .update(users)
        .set({
          weeklyVoiceMinutesUsed: minutesUsed,
          weeklyResetDate: now,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Add to current usage
      await db
        .update(users)
        .set({
          weeklyVoiceMinutesUsed: (user.weeklyVoiceMinutesUsed || 0) + minutesUsed,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
  }

  async canUserUseVoice(userId: string): Promise<boolean> {
    // Always allow voice usage when in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return true;
    }
    
    const user = await this.getUser(userId);
    if (!user) return false;

    const weeklyLimit = user.subscriptionPlan === 'all' ? 90 : 60;
    return (user.weeklyVoiceMinutesUsed || 0) < weeklyLimit;
  }

  async getUserDashboard(userId: string): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    // Return test dashboard in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      return {
        user: {
          name: 'Test User',
          firstName: 'Test',
          initials: 'TU',
          plan: 'All Subjects Plan',
        },
        subjectProgress: [
          {
            subject: { id: 'math', name: 'Math', description: 'Master mathematical concepts', iconColor: 'blue', isActive: true },
            completed: 3,
            total: 10,
            progressPercentage: 30,
            avgQuizScore: 85,
          },
          {
            subject: { id: 'english', name: 'English', description: 'Improve language skills', iconColor: 'green', isActive: true },
            completed: 2,
            total: 8,
            progressPercentage: 25,
            avgQuizScore: 90,
          },
          {
            subject: { id: 'spanish', name: 'Spanish', description: 'Learn Spanish language', iconColor: 'yellow', isActive: true },
            completed: 1,
            total: 12,
            progressPercentage: 8,
            avgQuizScore: 75,
          },
        ],
        usage: {
          voiceMinutes: '0 / 90 min',
          percentage: 0,
        },
      };
    }

    // Get all subjects and progress
    const allSubjects = await db.select().from(subjects).where(eq(subjects.isActive, true));
    
    const subjectProgress = await Promise.all(
      allSubjects.map(async (subject) => {
        const subjectLessons = await db
          .select()
          .from(lessons)
          .where(and(eq(lessons.subjectId, subject.id), eq(lessons.isActive, true)))
          .orderBy(asc(lessons.orderIndex));

        const progressData = await db
          .select()
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, userId),
              sql`${userProgress.lessonId} IN ${sql.raw(`(${subjectLessons.map(l => `'${l.id}'`).join(',')})`)}`,
            )
          );

        const completed = progressData.filter(p => p.status === 'completed' || p.status === 'mastered').length;
        const total = subjectLessons.length;
        const avgScore = progressData.length > 0 
          ? progressData.reduce((acc, p) => acc + (p.quizScore || 0), 0) / progressData.length 
          : 0;

        return {
          subject,
          completed,
          total,
          progressPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
          avgQuizScore: Math.round(avgScore),
        };
      })
    );

    // Get usage info
    const weeklyLimit = user.subscriptionPlan === 'all' ? 90 : 60;
    const usagePercentage = Math.round(((user.weeklyVoiceMinutesUsed || 0) / weeklyLimit) * 100);

    return {
      user: {
        name: `${user.firstName} ${user.lastName}`.trim() || user.username,
        firstName: user.firstName,
        initials: `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.username[0].toUpperCase(),
        plan: user.subscriptionPlan === 'all' ? 'All Subjects Plan' : 'Single Subject Plan',
      },
      subjectProgress,
      usage: {
        voiceMinutes: `${user.weeklyVoiceMinutesUsed || 0} / ${weeklyLimit} min`,
        percentage: usagePercentage,
      },
    };
  }

  async getResumeSession(userId: string): Promise<any> {
    // Return null for test mode (no resume session)
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      return null;
    }
    
    const lastSession = await db
      .select({
        id: learningSessions.id,
        lessonId: learningSessions.lessonId,
        lastAccessed: learningSessions.startedAt,
        lesson: {
          title: lessons.title,
          subjectId: lessons.subjectId,
        },
        subject: {
          name: subjects.name,
        },
        progress: {
          progressPercentage: userProgress.progressPercentage,
        },
      })
      .from(learningSessions)
      .leftJoin(lessons, eq(learningSessions.lessonId, lessons.id))
      .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
      .leftJoin(userProgress, and(
        eq(userProgress.userId, userId),
        eq(userProgress.lessonId, learningSessions.lessonId)
      ))
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt))
      .limit(1);

    if (lastSession.length === 0) return null;

    const session = lastSession[0];
    const timeDiff = Date.now() - (session.lastAccessed?.getTime() || 0);
    const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));

    return {
      hasResumeSession: true,
      session: {
        subject: session.subject?.name,
        lesson: session.lesson?.title,
        lastActivity: hoursAgo < 1 ? 'Less than an hour ago' : `${hoursAgo} hours ago`,
        progressPercentage: session.progress?.progressPercentage || 0,
      },
      lessonId: session.lessonId,
    };
  }

  async getAllSubjects(): Promise<Subject[]> {
    // Return test subjects in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return [
        {
          id: 'math',
          name: 'Math',
          description: 'Master mathematical concepts from basic to advanced',
          iconColor: 'blue',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
        {
          id: 'english',
          name: 'English',
          description: 'Improve grammar, writing, and comprehension skills',
          iconColor: 'green',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
        {
          id: 'spanish',
          name: 'Spanish',
          description: 'Learn Spanish language from beginner to fluent',
          iconColor: 'yellow',
          isActive: true,
          createdAt: new Date(),
        } as Subject,
      ];
    }
    return await db.select().from(subjects).where(eq(subjects.isActive, true)).orderBy(asc(subjects.name));
  }

  async getSubjectLessons(subjectId: string): Promise<Lesson[]> {
    // Return test lessons in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const testLessons = {
        math: [
          {
            id: 'math-1',
            subjectId: 'math',
            title: 'Introduction to Numbers',
            description: 'Learn the basics of counting and number recognition',
            content: { type: 'basic', difficulty: 'easy' },
            orderIndex: 1,
            estimatedMinutes: 15,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
          {
            id: 'math-2',
            subjectId: 'math',
            title: 'Addition and Subtraction',
            description: 'Master basic arithmetic operations',
            content: { type: 'arithmetic', difficulty: 'easy' },
            orderIndex: 2,
            estimatedMinutes: 20,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
        english: [
          {
            id: 'english-1',
            subjectId: 'english',
            title: 'Parts of Speech',
            description: 'Understanding nouns, verbs, and adjectives',
            content: { type: 'grammar', difficulty: 'medium' },
            orderIndex: 1,
            estimatedMinutes: 25,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
        spanish: [
          {
            id: 'spanish-1',
            subjectId: 'spanish',
            title: 'Basic Greetings',
            description: 'Learn common Spanish greetings and phrases',
            content: { type: 'vocabulary', difficulty: 'easy' },
            orderIndex: 1,
            estimatedMinutes: 15,
            isActive: true,
            createdAt: new Date(),
          } as Lesson,
        ],
      };
      return testLessons[subjectId as keyof typeof testLessons] || [];
    }
    return await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.subjectId, subjectId), eq(lessons.isActive, true)))
      .orderBy(asc(lessons.orderIndex));
  }

  async getLessonById(lessonId: string): Promise<Lesson | undefined> {
    // Return test lesson in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const testLessons: Record<string, Lesson> = {
        'math-1': {
          id: 'math-1',
          subjectId: 'math',
          title: 'Introduction to Numbers',
          description: 'Learn the basics of counting and number recognition',
          content: { 
            type: 'lesson',
            concepts: ['Numbers 1-10', 'Counting', 'Number recognition'],
            examples: ['Count from 1 to 10', 'Identify numbers in order'],
            quiz: [
              { question: 'What comes after 5?', answer: '6' },
              { question: 'How many fingers do you have?', answer: '10' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 15,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'math-2': {
          id: 'math-2',
          subjectId: 'math',
          title: 'Addition and Subtraction',
          description: 'Master basic arithmetic operations',
          content: { 
            type: 'lesson',
            concepts: ['Addition', 'Subtraction', 'Basic equations'],
            examples: ['2 + 3 = 5', '7 - 4 = 3'],
            quiz: [
              { question: 'What is 3 + 4?', answer: '7' },
              { question: 'What is 10 - 6?', answer: '4' }
            ]
          },
          orderIndex: 2,
          estimatedMinutes: 20,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'english-1': {
          id: 'english-1',
          subjectId: 'english',
          title: 'Parts of Speech',
          description: 'Understanding nouns, verbs, and adjectives',
          content: { 
            type: 'lesson',
            concepts: ['Nouns', 'Verbs', 'Adjectives'],
            examples: ['Cat is a noun', 'Run is a verb', 'Blue is an adjective'],
            quiz: [
              { question: 'Is "dog" a noun or verb?', answer: 'noun' },
              { question: 'Is "jump" a noun or verb?', answer: 'verb' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 25,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
        'spanish-1': {
          id: 'spanish-1',
          subjectId: 'spanish',
          title: 'Basic Greetings',
          description: 'Learn common Spanish greetings and phrases',
          content: { 
            type: 'lesson',
            concepts: ['Hola', 'Buenos días', 'Adiós'],
            examples: ['Hola means Hello', 'Buenos días means Good morning'],
            quiz: [
              { question: 'How do you say Hello in Spanish?', answer: 'Hola' },
              { question: 'What does "Adiós" mean?', answer: 'Goodbye' }
            ]
          },
          orderIndex: 1,
          estimatedMinutes: 15,
          isActive: true,
          createdAt: new Date(),
        } as Lesson,
      };
      return testLessons[lessonId];
    }
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    return lesson || undefined;
  }

  async getUserProgress(userId: string, lessonId: string): Promise<UserProgress | undefined> {
    // Return test progress in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && userId === 'test-user-id') {
      // Return some progress for first math lesson, none for others
      if (lessonId === 'math-1') {
        return {
          id: 'progress-1',
          userId: 'test-user-id',
          lessonId: 'math-1',
          status: 'in_progress',
          progressPercentage: 50,
          quizScore: 85,
          timeSpent: 10,
          lastAccessed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as UserProgress;
      }
      return undefined;
    }
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)));
    return progress || undefined;
  }

  async updateUserProgress(userId: string, lessonId: string, progressData: Partial<UserProgress>): Promise<UserProgress> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const key = `${userId}-${lessonId}`;
      const existing = this.testUserProgress.get(key);
      const progress: UserProgress = existing ? {
        ...existing,
        ...progressData,
        updatedAt: new Date()
      } : {
        id: `progress-${Date.now()}`,
        userId,
        lessonId,
        status: progressData.status || 'not_started',
        progressPercentage: progressData.progressPercentage || 0,
        lastAccessed: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        quizScore: progressData.quizScore || null,
        timeSpent: progressData.timeSpent || null
      };
      this.testUserProgress.set(key, progress);
      return progress;
    }
    
    const existing = await this.getUserProgress(userId, lessonId);
    
    if (existing) {
      const [updated] = await db
        .update(userProgress)
        .set({ ...progressData, updatedAt: new Date() })
        .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userProgress)
        .values({
          userId,
          lessonId,
          ...progressData,
        })
        .returning();
      return created;
    }
  }

  async createLearningSession(sessionData: InsertLearningSession): Promise<LearningSession> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const session: LearningSession = {
        id: `session-${Date.now()}`,
        userId: sessionData.userId,
        lessonId: sessionData.lessonId || null,
        sessionType: sessionData.sessionType as "voice" | "text" | "quiz",
        startedAt: new Date(),
        endedAt: null,
        duration: null,
        transcript: null,
        feedback: null,
        voiceMinutesUsed: 0
      };
      this.testSessions.push(session);
      return session;
    }
    
    const [session] = await db
      .insert(learningSessions)
      .values(sessionData as any)
      .returning();
    return session;
  }

  async endLearningSession(sessionId: string, userId: string, updates: Partial<LearningSession>): Promise<LearningSession> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const session = this.testSessions.find(s => s.id === sessionId && s.userId === userId);
      if (!session) {
        throw new Error('Session not found');
      }
      Object.assign(session, updates);
      return session;
    }
    
    const [session] = await db
      .update(learningSessions)
      .set(updates)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .returning();
    return session;
  }

  async getUserSessions(userId: string): Promise<LearningSession[]> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return this.testSessions
        .filter(s => s.userId === userId)
        .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
    }
    
    return await db
      .select()
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt));
  }

  async createQuizAttempt(attemptData: InsertQuizAttempt): Promise<QuizAttempt> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const attempt: QuizAttempt = {
        id: `quiz-${Date.now()}`,
        userId: attemptData.userId,
        lessonId: attemptData.lessonId,
        sessionId: attemptData.sessionId || null,
        answers: attemptData.answers as any,
        score: attemptData.score,
        totalQuestions: attemptData.totalQuestions,
        timeSpent: attemptData.timeSpent || null,
        createdAt: new Date(),
        completedAt: new Date()
      };
      this.testQuizAttempts.push(attempt);
      return attempt;
    }
    
    const [attempt] = await db
      .insert(quizAttempts)
      .values(attemptData)
      .returning();
    return attempt;
  }

  async getUserQuizAttempts(userId: string, lessonId?: string): Promise<QuizAttempt[]> {
    // Test mode implementation
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      return this.testQuizAttempts
        .filter(a => a.userId === userId && (!lessonId || a.lessonId === lessonId))
        .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
    }
    
    const whereClause = lessonId
      ? and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId))
      : eq(quizAttempts.userId, userId);

    return await db
      .select()
      .from(quizAttempts)
      .where(whereClause)
      .orderBy(desc(quizAttempts.completedAt));
  }

  async getAdminUsers(options: { page: number; limit: number; search: string }): Promise<any> {
    const { page, limit, search } = options;
    const offset = (page - 1) * limit;

    const whereClause = search
      ? or(
          like(users.username, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )
      : undefined;

    const usersList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        subscriptionPlan: users.subscriptionPlan,
        subscriptionStatus: users.subscriptionStatus,
        weeklyVoiceMinutesUsed: users.weeklyVoiceMinutesUsed,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    return {
      users: usersList,
      totalCount: totalCount.count,
      page,
      limit,
      totalPages: Math.ceil(totalCount.count / limit),
    };
  }

  async getAdminStats(): Promise<any> {
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [activeSubscriptions] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.subscriptionStatus, 'active'));

    // Calculate monthly revenue (mock calculation)
    const monthlyRevenue = activeSubscriptions.count * 150; // Average plan price

    const [avgSessionTime] = await db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${learningSessions.endedAt} - ${learningSessions.startedAt})) / 60)`.as('avg')
      })
      .from(learningSessions)
      .where(sql`${learningSessions.endedAt} IS NOT NULL`);

    return {
      totalUsers: totalUsers.count,
      activeSubscriptions: activeSubscriptions.count,
      monthlyRevenue: `$${monthlyRevenue.toLocaleString()}`,
      avgSessionTime: `${Math.round(avgSessionTime.avg || 0)} min`,
    };
  }

  async exportUsersCSV(): Promise<string> {
    const allUsers = await db
      .select({
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        subscriptionPlan: users.subscriptionPlan,
        subscriptionStatus: users.subscriptionStatus,
        weeklyVoiceMinutesUsed: users.weeklyVoiceMinutesUsed,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    const headers = [
      'Username',
      'Email',
      'First Name',
      'Last Name',
      'Subscription Plan',
      'Subscription Status',
      'Weekly Voice Minutes Used',
      'Created At',
    ];

    const csvRows = [
      headers.join(','),
      ...allUsers.map(user => [
        user.username,
        user.email,
        user.firstName || '',
        user.lastName || '',
        user.subscriptionPlan || '',
        user.subscriptionStatus || '',
        user.weeklyVoiceMinutesUsed || 0,
        user.createdAt?.toISOString() || '',
      ].map(field => `"${field}"`).join(','))
    ];

    return csvRows.join('\n');
  }
}

export const storage = new DatabaseStorage();
