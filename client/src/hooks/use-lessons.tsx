import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Lesson {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  orderIndex: number;
  estimatedMinutes: number;
  content: any;
  progress?: {
    status: string;
    progressPercentage: number;
    quizScore?: number;
    timeSpent: number;
    lastAccessed?: Date;
  };
}

interface Subject {
  id: string;
  name: string;
  description: string;
  iconColor: string;
  lessons: Lesson[];
}

export function useLessons() {
  const { toast } = useToast();

  const {
    data: lessonsData,
    isLoading,
    error
  } = useQuery<Subject[]>({
    queryKey: ["/api/lessons"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({ lessonId, progressData }: { 
      lessonId: string; 
      progressData: { progressPercentage: number; status: string; timeSpent?: number } 
    }) => {
      const response = await apiRequest("POST", `/api/lessons/${lessonId}/progress`, progressData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating progress",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: async ({ lessonId, answers, timeSpent, sessionId }: {
      lessonId: string;
      answers: Record<string, number>;
      timeSpent?: number;
      sessionId?: string;
    }) => {
      const response = await apiRequest("POST", `/api/quiz/${lessonId}/submit`, {
        answers,
        timeSpent,
        sessionId,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error submitting quiz",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const getLessonById = (lessonId: string): Lesson | undefined => {
    if (!lessonsData) return undefined;
    
    for (const subject of lessonsData) {
      const lesson = subject.lessons.find(l => l.id === lessonId);
      if (lesson) return lesson;
    }
    return undefined;
  };

  const getSubjectByLessonId = (lessonId: string): Subject | undefined => {
    if (!lessonsData) return undefined;
    
    return lessonsData.find(subject => 
      subject.lessons.some(lesson => lesson.id === lessonId)
    );
  };

  const getLessonProgress = (lessonId: string) => {
    const lesson = getLessonById(lessonId);
    return lesson?.progress;
  };

  const getNextLesson = (currentLessonId: string): Lesson | undefined => {
    if (!lessonsData) return undefined;
    
    const subject = getSubjectByLessonId(currentLessonId);
    if (!subject) return undefined;
    
    const currentIndex = subject.lessons.findIndex(l => l.id === currentLessonId);
    if (currentIndex === -1 || currentIndex >= subject.lessons.length - 1) return undefined;
    
    return subject.lessons[currentIndex + 1];
  };

  const getPreviousLesson = (currentLessonId: string): Lesson | undefined => {
    if (!lessonsData) return undefined;
    
    const subject = getSubjectByLessonId(currentLessonId);
    if (!subject) return undefined;
    
    const currentIndex = subject.lessons.findIndex(l => l.id === currentLessonId);
    if (currentIndex <= 0) return undefined;
    
    return subject.lessons[currentIndex - 1];
  };

  const getSubjectProgress = (subjectId: string) => {
    if (!lessonsData) return { completed: 0, total: 0, percentage: 0 };
    
    const subject = lessonsData.find(s => s.id === subjectId);
    if (!subject) return { completed: 0, total: 0, percentage: 0 };
    
    const total = subject.lessons.length;
    const completed = subject.lessons.filter(
      lesson => lesson.progress?.status === 'completed' || lesson.progress?.status === 'mastered'
    ).length;
    
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  const getAverageQuizScore = (subjectId: string): number => {
    if (!lessonsData) return 0;
    
    const subject = lessonsData.find(s => s.id === subjectId);
    if (!subject) return 0;
    
    const scoresWithQuizzes = subject.lessons
      .map(lesson => lesson.progress?.quizScore)
      .filter((score): score is number => score !== undefined && score > 0);
    
    if (scoresWithQuizzes.length === 0) return 0;
    
    return Math.round(
      scoresWithQuizzes.reduce((sum, score) => sum + score, 0) / scoresWithQuizzes.length
    );
  };

  return {
    // Data
    subjects: lessonsData || [],
    isLoading,
    error,
    
    // Mutations
    updateProgress: updateProgressMutation.mutate,
    isUpdatingProgress: updateProgressMutation.isPending,
    submitQuiz: submitQuizMutation.mutateAsync,
    isSubmittingQuiz: submitQuizMutation.isPending,
    
    // Helper functions
    getLessonById,
    getSubjectByLessonId,
    getLessonProgress,
    getNextLesson,
    getPreviousLesson,
    getSubjectProgress,
    getAverageQuizScore,
  };
}
