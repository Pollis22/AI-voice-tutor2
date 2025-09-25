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

    // Return test content in test mode
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode) {
      const testContent: Record<string, LessonContent> = {
        'math-1': {
          title: 'Introduction to Numbers',
          description: 'Learn the basics of counting and number recognition',
          objective: 'Students will be able to count from 1 to 10 and recognize numbers',
          concepts: ['Numbers 1-10', 'Counting', 'Number recognition'],
          examples: [
            { 
              problem: 'Count from 1 to 10', 
              visual: '1, 2, 3, 4, 5, 6, 7, 8, 9, 10',
              answer: 'Counted correctly',
              explanation: 'Practice counting in sequence'
            },
            { 
              problem: 'Identify the number 5', 
              visual: 'Circle the number 5',
              answer: '5',
              explanation: 'Recognize individual numbers'
            }
          ],
          quiz: [
            {
              question: 'What number comes after 5?',
              options: ['4', '5', '6', '7'],
              correctAnswer: 2,
              explanation: 'After 5 comes 6. The counting sequence is 1, 2, 3, 4, 5, 6, 7...'
            },
            {
              question: 'How many fingers do you have on both hands?',
              options: ['5', '10', '15', '20'],
              correctAnswer: 1,
              explanation: 'You have 5 fingers on each hand, so 5 + 5 = 10 fingers total.'
            }
          ],
          progression: {
            next: 'math-2',
            prerequisites: []
          }
        },
        'math-2': {
          title: 'Addition and Subtraction',
          description: 'Master basic arithmetic operations',
          objective: 'Students will learn to add and subtract single-digit numbers',
          concepts: ['Addition', 'Subtraction', 'Basic equations'],
          examples: [
            { 
              problem: 'What is 2 + 3?', 
              visual: '2 + 3 = ?',
              answer: '5',
              explanation: 'Adding 2 and 3 gives us 5'
            },
            { 
              problem: 'What is 7 - 4?', 
              visual: '7 - 4 = ?',
              answer: '3',
              explanation: 'Subtracting 4 from 7 gives us 3'
            }
          ],
          quiz: [
            {
              question: 'What is 3 + 4?',
              options: ['5', '6', '7', '8'],
              correctAnswer: 2,
              explanation: '3 + 4 = 7. Count: 3, then add 4 more: 4, 5, 6, 7.'
            },
            {
              question: 'What is 10 - 6?',
              options: ['3', '4', '5', '6'],
              correctAnswer: 1,
              explanation: '10 - 6 = 4. Start with 10, take away 6, you have 4 left.'
            }
          ],
          progression: {
            next: 'math-3',
            prerequisites: ['math-1']
          }
        },
        'english-1': {
          title: 'Parts of Speech',
          description: 'Understanding nouns, verbs, and adjectives',
          objective: 'Students will identify and use basic parts of speech',
          concepts: ['Nouns', 'Verbs', 'Adjectives'],
          examples: [
            { 
              problem: 'Identify the noun in: The cat sleeps', 
              visual: 'The [cat] sleeps',
              answer: 'cat',
              explanation: 'Cat is the noun - it names an animal'
            },
            { 
              problem: 'Identify the verb in: Birds fly high', 
              visual: 'Birds [fly] high',
              answer: 'fly',
              explanation: 'Fly is the verb - it shows the action'
            },
            { 
              problem: 'Identify the adjective in: The blue sky', 
              visual: 'The [blue] sky',
              answer: 'blue',
              explanation: 'Blue is the adjective - it describes the sky'
            }
          ],
          quiz: [
            {
              question: 'Which word is a noun?',
              options: ['run', 'happy', 'dog', 'quickly'],
              correctAnswer: 2,
              explanation: 'Dog is a noun - it names an animal. The others are a verb, adjective, and adverb.'
            },
            {
              question: 'Which word is a verb?',
              options: ['table', 'jump', 'green', 'slowly'],
              correctAnswer: 1,
              explanation: 'Jump is a verb - it shows an action. The others are a noun, adjective, and adverb.'
            }
          ],
          progression: {
            next: 'english-2',
            prerequisites: []
          }
        },
        'spanish-1': {
          title: 'Basic Greetings',
          description: 'Learn common Spanish greetings and phrases',
          objective: 'Students will use basic Spanish greetings in conversation',
          concepts: ['Basic greetings', 'Common phrases', 'Pronunciation'],
          examples: [
            { 
              problem: 'How do you say Hello?', 
              visual: 'Hola (OH-lah)',
              answer: 'Hola',
              explanation: 'Hola is the most common greeting in Spanish'
            },
            { 
              problem: 'How do you say Good morning?', 
              visual: 'Buenos días (BWAY-nohs DEE-ahs)',
              answer: 'Buenos días',
              explanation: 'Use Buenos días until noon'
            },
            { 
              problem: 'How do you say Goodbye?', 
              visual: 'Adiós (ah-dee-OHS)',
              answer: 'Adiós',
              explanation: 'Adiós is the most common way to say goodbye'
            }
          ],
          quiz: [
            {
              question: 'How do you say "Hello" in Spanish?',
              options: ['Adiós', 'Hola', 'Gracias', 'Por favor'],
              correctAnswer: 1,
              explanation: 'Hola means Hello in Spanish. Adiós means goodbye.'
            },
            {
              question: 'What does "Gracias" mean?',
              options: ['Hello', 'Goodbye', 'Thank you', 'Please'],
              correctAnswer: 2,
              explanation: 'Gracias means Thank you in Spanish. It\'s a very important polite phrase!'
            }
          ],
          progression: {
            next: 'spanish-2',
            prerequisites: []
          }
        }
      };

      const content = testContent[lessonId];
      if (content) {
        this.lessonsCache.set(lessonId, content);
        return content;
      }
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
