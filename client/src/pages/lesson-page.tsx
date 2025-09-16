import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { VoiceControls } from "@/components/voice-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["/api/lessons", lessonId],
    enabled: !!user && !!lessonId,
  });

  const progressMutation = useMutation({
    mutationFn: async (data: { progressPercentage: number; status: string }) => {
      return await apiRequest("POST", `/api/lessons/${lessonId}/progress`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] });
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

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">Lesson not found</h2>
            <p className="text-muted-foreground mb-4">The lesson you're looking for doesn't exist.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleGoBack = () => {
    setLocation("/");
  };

  const handleContinue = () => {
    const newProgress = Math.min(100, (lesson.progress?.progressPercentage || 0) + 20);
    progressMutation.mutate({
      progressPercentage: newProgress,
      status: newProgress >= 100 ? 'completed' : 'in_progress'
    });

    if (newProgress >= 100) {
      setLocation(`/quiz/${lessonId}`);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progressPercentage = lesson.progress?.progressPercentage || 0;

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Lesson Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGoBack}
                data-testid="button-go-back"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
                </svg>
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-lesson-title">
                  {lesson.content?.title || lesson.title}
                </h1>
                <p className="text-muted-foreground">
                  {lesson.subject?.name} • Lesson {lesson.orderIndex + 1}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Progress value={progressPercentage} className="w-32" />
              <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
            </div>
          </div>

          {/* Main Lesson Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Lesson Content Panel */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Voice Control Panel */}
              <VoiceControls lessonId={lessonId!} />

              {/* Lesson Content */}
              <Card className="shadow-sm">
                <CardContent className="pt-6">
                  <div className="prose prose-sm max-w-none">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Learning Objective</h3>
                    <p className="text-muted-foreground mb-6">
                      {lesson.content?.objective || lesson.description}
                    </p>
                    
                    {lesson.content?.concepts && (
                      <div className="bg-secondary/5 rounded-lg p-4 mb-6">
                        <h4 className="font-medium text-secondary mb-2">💡 Key Concepts</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {lesson.content.concepts.map((concept: string, index: number) => (
                            <li key={index}>• {concept}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Interactive Examples */}
                    {lesson.content?.examples && (
                      <div className="space-y-4">
                        <h4 className="font-medium text-foreground">Let's Practice Together</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {lesson.content.examples.slice(0, 2).map((example: any, index: number) => (
                            <div key={index} className="bg-primary/5 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-primary mb-2">
                                {example.problem}
                              </div>
                              {example.visual && (
                                <div className="mb-3" dangerouslySetInnerHTML={{ __html: example.visual }} />
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toast({
                                  title: "Answer",
                                  description: example.explanation,
                                })}
                                data-testid={`button-show-answer-${index}`}
                              >
                                Show Answer
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              
              {/* Lesson Progress */}
              <Card className="shadow-sm">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-foreground mb-3">Lesson Progress</h4>
                  <div className="space-y-3">
                    {[
                      { name: "Introduction", completed: progressPercentage >= 20 },
                      { name: "Basic Concepts", completed: progressPercentage >= 40 },
                      { name: "Practice Examples", completed: progressPercentage >= 60 },
                      { name: "Interactive Quiz", completed: progressPercentage >= 80 },
                      { name: "Mastery Check", completed: progressPercentage >= 100 },
                    ].map((step, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          step.completed 
                            ? 'bg-secondary text-secondary-foreground' 
                            : index === Math.floor(progressPercentage / 20)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {step.completed ? (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                          ) : (
                            <span className="text-xs font-medium">{index + 1}</span>
                          )}
                        </div>
                        <span className={`text-sm ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Study Notes */}
              <Card className="shadow-sm">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-foreground mb-3">Quick Notes</h4>
                  <div className="space-y-2 text-sm">
                    <div className="bg-accent/5 rounded p-2">
                      <p className="text-accent-foreground">Remember: Take your time to understand each concept!</p>
                    </div>
                    <div className="bg-secondary/5 rounded p-2">
                      <p className="text-secondary-foreground">Tip: Use voice interaction for better understanding</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mt-3"
                    data-testid="button-add-note"
                  >
                    Add Personal Note
                  </Button>
                </CardContent>
              </Card>

              {/* Lesson Navigation */}
              <Card className="shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePrevious}
                      disabled={currentStep === 0}
                      data-testid="button-previous"
                    >
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                      Previous
                    </Button>
                    <Button
                      onClick={handleContinue}
                      size="sm"
                      disabled={progressMutation.isPending}
                      data-testid="button-continue"
                    >
                      {progressPercentage >= 80 ? "Take Quiz" : "Continue"}
                      <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                      </svg>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
