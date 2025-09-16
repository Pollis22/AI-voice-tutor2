import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  decimal, 
  boolean, 
  jsonb,
  index 
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionPlan: text("subscription_plan").$type<'single' | 'all'>(),
  subscriptionStatus: text("subscription_status").$type<'active' | 'canceled' | 'paused'>(),
  weeklyVoiceMinutesUsed: integer("weekly_voice_minutes_used").default(0),
  weeklyResetDate: timestamp("weekly_reset_date").defaultNow(),
  preferredLanguage: text("preferred_language").default('english'),
  voiceStyle: text("voice_style").default('cheerful'),
  speechSpeed: decimal("speech_speed").default('1.0'),
  volumeLevel: integer("volume_level").default(75),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subjects table
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  iconColor: text("icon_color").default('blue'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lessons table
export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey(),
  subjectId: varchar("subject_id").notNull().references(() => subjects.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(),
  orderIndex: integer("order_index").notNull(),
  estimatedMinutes: integer("estimated_minutes").default(15),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// User progress table
export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  status: text("status").$type<'not_started' | 'in_progress' | 'completed' | 'mastered'>().default('not_started'),
  progressPercentage: integer("progress_percentage").default(0),
  quizScore: integer("quiz_score"),
  timeSpent: integer("time_spent").default(0), // in minutes
  lastAccessed: timestamp("last_accessed").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Learning sessions table
export const learningSessions = pgTable("learning_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  sessionType: text("session_type").$type<'voice' | 'text' | 'quiz'>().notNull(),
  transcript: text("transcript"),
  voiceMinutesUsed: integer("voice_minutes_used").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quiz attempts table
export const quizAttempts = pgTable("quiz_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id),
  sessionId: varchar("session_id").references(() => learningSessions.id),
  answers: jsonb("answers").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  timeSpent: integer("time_spent"), // in seconds
  completedAt: timestamp("completed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  progress: many(userProgress),
  sessions: many(learningSessions),
  quizAttempts: many(quizAttempts),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [lessons.subjectId],
    references: [subjects.id],
  }),
  progress: many(userProgress),
  sessions: many(learningSessions),
  quizAttempts: many(quizAttempts),
}));

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, {
    fields: [userProgress.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [userProgress.lessonId],
    references: [lessons.id],
  }),
}));

export const learningSessionsRelations = relations(learningSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [learningSessions.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [learningSessions.lessonId],
    references: [lessons.id],
  }),
  quizAttempts: many(quizAttempts),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [quizAttempts.lessonId],
    references: [lessons.id],
  }),
  session: one(learningSessions, {
    fields: [quizAttempts.sessionId],
    references: [learningSessions.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  weeklyVoiceMinutesUsed: true,
  weeklyResetDate: true,
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  createdAt: true,
});

export const insertLessonSchema = createInsertSchema(lessons).omit({
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLearningSessionSchema = createInsertSchema(learningSessions).omit({
  id: true,
  createdAt: true,
});

export const insertQuizAttemptSchema = createInsertSchema(quizAttempts).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type LearningSession = typeof learningSessions.$inferSelect;
export type InsertLearningSession = z.infer<typeof insertLearningSessionSchema>;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type InsertQuizAttempt = z.infer<typeof insertQuizAttemptSchema>;
