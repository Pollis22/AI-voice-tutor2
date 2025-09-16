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

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
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
    const user = await this.getUser(userId);
    if (!user) return false;

    const weeklyLimit = user.subscriptionPlan === 'all' ? 90 : 60;
    return (user.weeklyVoiceMinutesUsed || 0) < weeklyLimit;
  }

  async getUserDashboard(userId: string): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

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
    return await db.select().from(subjects).where(eq(subjects.isActive, true)).orderBy(asc(subjects.name));
  }

  async getSubjectLessons(subjectId: string): Promise<Lesson[]> {
    return await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.subjectId, subjectId), eq(lessons.isActive, true)))
      .orderBy(asc(lessons.orderIndex));
  }

  async getLessonById(lessonId: string): Promise<Lesson | undefined> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    return lesson || undefined;
  }

  async getUserProgress(userId: string, lessonId: string): Promise<UserProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.lessonId, lessonId)));
    return progress || undefined;
  }

  async updateUserProgress(userId: string, lessonId: string, progressData: Partial<UserProgress>): Promise<UserProgress> {
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
    const [session] = await db
      .insert(learningSessions)
      .values(sessionData as any)
      .returning();
    return session;
  }

  async endLearningSession(sessionId: string, userId: string, updates: Partial<LearningSession>): Promise<LearningSession> {
    const [session] = await db
      .update(learningSessions)
      .set(updates)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .returning();
    return session;
  }

  async getUserSessions(userId: string): Promise<LearningSession[]> {
    return await db
      .select()
      .from(learningSessions)
      .where(eq(learningSessions.userId, userId))
      .orderBy(desc(learningSessions.startedAt));
  }

  async createQuizAttempt(attemptData: InsertQuizAttempt): Promise<QuizAttempt> {
    const [attempt] = await db
      .insert(quizAttempts)
      .values(attemptData)
      .returning();
    return attempt;
  }

  async getUserQuizAttempts(userId: string, lessonId?: string): Promise<QuizAttempt[]> {
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
