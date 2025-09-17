import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLessons } from "@/hooks/use-lessons";
import { BookOpen, Clock, CheckCircle, Play } from "lucide-react";

export default function LessonsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { subjects, isLoading, error } = useLessons();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">Error loading lessons</h2>
            <p className="text-muted-foreground mb-4">Please try again later.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-lessons-title">
              Browse Lessons
            </h1>
            <p className="text-muted-foreground text-lg">
              Choose a subject and start learning with your AI tutor
            </p>
          </div>

          {/* Subjects and Lessons */}
          {subjects && subjects.length > 0 ? (
            <div className="space-y-8">
              {subjects.map((subject: any, subjectIndex: number) => (
                <div key={subject.id} className="space-y-4">
                  
                  {/* Subject Header */}
                  <div className="flex items-center space-x-3">
                    <div 
                      className={`w-12 h-12 rounded-lg bg-gradient-to-br ${subject.iconColor || 'from-primary to-secondary'} flex items-center justify-center`}
                      data-testid={`icon-subject-${subjectIndex}`}
                    >
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-foreground" data-testid={`text-subject-name-${subjectIndex}`}>
                        {subject.name}
                      </h2>
                      <p className="text-muted-foreground">{subject.description}</p>
                    </div>
                  </div>

                  {/* Lessons Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subject.lessons.map((lesson: any, lessonIndex: number) => {
                      const progress = lesson.progress?.progressPercentage || 0;
                      const isCompleted = lesson.progress?.status === 'completed' || lesson.progress?.status === 'mastered';
                      const isInProgress = lesson.progress?.status === 'in_progress';
                      
                      return (
                        <Card 
                          key={lesson.id} 
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => setLocation(`/lesson/${lesson.id}`)}
                          data-testid={`card-lesson-${lesson.id}`}
                        >
                          <CardContent className="pt-4">
                            <div className="space-y-3">
                              
                              {/* Lesson Header */}
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-foreground line-clamp-2" data-testid={`text-lesson-title-${lesson.id}`}>
                                    {lesson.title}
                                  </h3>
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {lesson.description}
                                  </p>
                                </div>
                                <div className="ml-2">
                                  {isCompleted ? (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                  ) : isInProgress ? (
                                    <Play className="w-5 h-5 text-primary" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full border-2 border-muted" />
                                  )}
                                </div>
                              </div>

                              {/* Progress Bar */}
                              {progress > 0 && (
                                <div className="space-y-1">
                                  <Progress value={progress} className="h-2" />
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{progress}% complete</span>
                                    {lesson.progress?.quizScore && (
                                      <span>Quiz: {lesson.progress.quizScore}%</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Lesson Metadata */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>{lesson.estimatedMinutes || 15} min</span>
                                </div>
                                <Badge variant={isCompleted ? "default" : isInProgress ? "secondary" : "outline"} className="text-xs">
                                  {isCompleted ? "Completed" : isInProgress ? "In Progress" : "Not Started"}
                                </Badge>
                              </div>

                              {/* Start/Continue Button */}
                              <Button 
                                className="w-full" 
                                variant={isCompleted ? "outline" : "default"}
                                size="sm"
                                data-testid={`button-start-lesson-${lesson.id}`}
                              >
                                {isCompleted ? "Review Lesson" : isInProgress ? "Continue" : "Start Lesson"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No lessons available</h3>
              <p className="text-muted-foreground">Check back later for new content!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}