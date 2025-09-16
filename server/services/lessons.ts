import { storage } from "../storage";
import { 
  type Lesson, 
  type UserProgress,
  type QuizAttempt 
} from "@shared/schema";
import fs from 'fs/promises';
import path from 'path';

interface LessonContent {
  title: string;
  description: string;
  objective: string;
  concepts: string[];
  examples: Array<{
    problem: string;
    visual?: string;
    answer: string;
    explanation: string;
  }>;
  quiz: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
    visual?: string;
  }>;
  progression: {
    next?: string;
    prerequisites?: string[];
  };
}

class LessonsService {
  private lessonsCache = new Map<string, LessonContent>();

  async getUserLessons(userId: string) {
    const subjects = await storage.getAllSubjects();
    
    const lessonsWithProgress = await Promise.all(
      subjects.map(async (subject) => {
        const lessons = await storage.getSubjectLessons(subject.id);
        
        const lessonsData = await Promise.all(
          lessons.map(async (lesson) => {
            const progress = await storage.getUserProgress(userId, lesson.id);
            const content = await this.getLessonContent(lesson.id);
            
            return {
              ...lesson,
              content,
              progress: {
                status: progress?.status || 'not_started',
                progressPercentage: progress?.progressPercentage || 0,
                quizScore: progress?.quizScore,
                timeSpent: progress?.timeSpent || 0,
                lastAccessed: progress?.lastAccessed,
              }
            };
          })
        );

        return {
          subject,
          lessons: lessonsData,
        };
      })
    );

    return lessonsWithProgress;
  }

  async getLessonWithProgress(lessonId: string, userId: string) {
    const lesson = await storage.getLessonById(lessonId);
    if (!lesson) {
      throw new Error('Lesson not found');
    }

    const progress = await storage.getUserProgress(userId, lessonId);
    const content = await this.getLessonContent(lessonId);

    return {
      ...lesson,
      content,
      progress: {
        status: progress?.status || 'not_started',
        progressPercentage: progress?.progressPercentage || 0,
        quizScore: progress?.quizScore,
        timeSpent: progress?.timeSpent || 0,
        lastAccessed: progress?.lastAccessed,
      }
    };
  }

  async getLessonContent(lessonId: string): Promise<LessonContent> {
    if (this.lessonsCache.has(lessonId)) {
      return this.lessonsCache.get(lessonId)!;
    }

    try {
      // Map lesson IDs to content files
      const contentFileMap: Record<string, string> = {
        'math-numbers-counting': 'math-numbers-counting.json',
        'english-parts-of-speech': 'english-parts-of-speech.json',
        'spanish-greetings': 'spanish-greetings.json',
      };

      const fileName = contentFileMap[lessonId];
      if (!fileName) {
        throw new Error(`No content file found for lesson: ${lessonId}`);
      }

      const contentPath = path.join(process.cwd(), 'content', 'lessons', fileName);
      const contentStr = await fs.readFile(contentPath, 'utf-8');
      const content = JSON.parse(contentStr) as LessonContent;

      this.lessonsCache.set(lessonId, content);
      return content;
    } catch (error) {
      console.error(`Error loading lesson content for ${lessonId}:`, error);
      throw new Error('Failed to load lesson content');
    }
  }

  async submitQuiz(userId: string, lessonId: string, submission: {
    answers: Record<string, number>;
    sessionId?: string;
    timeSpent?: number;
  }): Promise<{
    score: number;
    totalQuestions: number;
    percentage: number;
    passed: boolean;
    feedback: Array<{
      questionIndex: number;
      correct: boolean;
      explanation: string;
    }>;
  }> {
    const content = await this.getLessonContent(lessonId);
    const quiz = content.quiz;

    let correctAnswers = 0;
    const feedback = quiz.map((question, index) => {
      const userAnswer = submission.answers[index.toString()];
      const isCorrect = userAnswer === question.correctAnswer;
      
      if (isCorrect) {
        correctAnswers++;
      }

      return {
        questionIndex: index,
        correct: isCorrect,
        explanation: question.explanation,
      };
    });

    const score = correctAnswers;
    const totalQuestions = quiz.length;
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= 70; // 70% passing grade

    // Save quiz attempt
    await storage.createQuizAttempt({
      userId,
      lessonId,
      sessionId: submission.sessionId,
      answers: submission.answers,
      score,
      totalQuestions,
      timeSpent: submission.timeSpent,
    });

    // Update user progress
    const currentProgress = await storage.getUserProgress(userId, lessonId);
    const newStatus = passed ? 
      (percentage >= 90 ? 'mastered' : 'completed') : 
      'in_progress';

    await storage.updateUserProgress(userId, lessonId, {
      status: newStatus,
      quizScore: Math.max(percentage, currentProgress?.quizScore || 0),
      progressPercentage: passed ? 100 : Math.max(75, currentProgress?.progressPercentage || 0),
      lastAccessed: new Date(),
      completedAt: passed ? new Date() : undefined,
    });

    return {
      score,
      totalQuestions,
      percentage,
      passed,
      feedback,
    };
  }

  async getQuizQuestions(lessonId: string) {
    const content = await this.getLessonContent(lessonId);
    return content.quiz.map((question, index) => ({
      id: index,
      question: question.question,
      options: question.options,
      visual: question.visual,
    }));
  }

  async getNextLesson(currentLessonId: string): Promise<string | null> {
    const content = await this.getLessonContent(currentLessonId);
    return content.progression.next || null;
  }

  async checkPrerequisites(lessonId: string, userId: string): Promise<{ canAccess: boolean; missingPrerequisites: string[] }> {
    const content = await this.getLessonContent(lessonId);
    const prerequisites = content.progression.prerequisites || [];

    if (prerequisites.length === 0) {
      return { canAccess: true, missingPrerequisites: [] };
    }

    const missingPrerequisites: string[] = [];

    for (const prereqId of prerequisites) {
      const progress = await storage.getUserProgress(userId, prereqId);
      if (!progress || (progress.status !== 'completed' && progress.status !== 'mastered')) {
        missingPrerequisites.push(prereqId);
      }
    }

    return {
      canAccess: missingPrerequisites.length === 0,
      missingPrerequisites,
    };
  }
}

export const lessonsService = new LessonsService();
