import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  visual?: string;
}

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [quizResults, setQuizResults] = useState<any>(null);
  const [timeSpent, setTimeSpent] = useState(0);

  const { data: lesson } = useQuery({
    queryKey: ["/api/lessons", lessonId],
    enabled: !!user && !!lessonId,
  });

  const submitQuizMutation = useMutation({
    mutationFn: async (data: { answers: Record<string, number>; timeSpent: number }) => {
      const response = await apiRequest("POST", `/api/quiz/${lessonId}/submit`, data);
      return await response.json();
    },
    onSuccess: (results) => {
      setQuizResults(results);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", lessonId] });
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

  // Track time spent
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!lesson?.content?.quiz) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">Quiz not available</h2>
            <p className="text-muted-foreground mb-4">This lesson doesn't have a quiz yet.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const quiz = lesson.content.quiz;
  const totalQuestions = quiz.length;
  const progressPercentage = Math.round(((currentQuestion + 1) / totalQuestions) * 100);

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswer(answerIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.toString()]: selectedAnswer,
    };
    setAnswers(newAnswers);

    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
    } else {
      // Submit quiz
      submitQuizMutation.mutate({
        answers: newAnswers,
        timeSpent,
      });
    }
  };

  const handleSkipQuestion = () => {
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
    }
  };

  const handleQuizHelp = () => {
    toast({
      title: "Need help?",
      description: "Take your time and think through each option carefully. There's no penalty for wrong answers!",
    });
  };

  const handleRetakeQuiz = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setSelectedAnswer(null);
    setShowResults(false);
    setQuizResults(null);
    setTimeSpent(0);
  };

  const handleFinishQuiz = () => {
    setLocation("/");
  };

  if (showResults && quizResults) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                quizResults.passed ? 'bg-secondary/10' : 'bg-destructive/10'
              }`}>
                {quizResults.passed ? (
                  <svg className="w-8 h-8 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-destructive" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                )}
              </div>
              
              <h1 className="text-3xl font-bold mb-2" data-testid="text-quiz-result">
                {quizResults.passed ? "Great job! 🎉" : "Keep practicing! 💪"}
              </h1>
              
              <p className="text-xl text-muted-foreground mb-4">
                You scored {quizResults.score} out of {quizResults.totalQuestions} ({quizResults.percentage}%)
              </p>

              {quizResults.passed ? (
                <p className="text-secondary mb-6">
                  Excellent work! You've mastered this lesson.
                </p>
              ) : (
                <p className="text-muted-foreground mb-6">
                  You need 70% to pass. Review the lesson and try again!
                </p>
              )}
            </div>

            <Card className="shadow-sm mb-6">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Question Breakdown</h3>
                <div className="space-y-3">
                  {quizResults.feedback.map((feedback: any, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-medium">Question {index + 1}</p>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          feedback.correct ? 'bg-secondary text-secondary-foreground' : 'bg-destructive text-destructive-foreground'
                        }`}>
                          {feedback.correct ? '✓' : '✗'}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {feedback.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center space-x-4">
              {!quizResults.passed && (
                <Button variant="outline" onClick={handleRetakeQuiz} data-testid="button-retake-quiz">
                  Retake Quiz
                </Button>
              )}
              <Button onClick={handleFinishQuiz} data-testid="button-finish-quiz">
                {quizResults.passed ? "Continue Learning" : "Review Lesson"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuizQuestion = quiz[currentQuestion];

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Quiz Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-quiz-title">
              {lesson.title} Quiz
            </h1>
            <p className="text-muted-foreground">Test your knowledge and understanding</p>
            <div className="flex items-center justify-center space-x-4 mt-4">
              <span className="text-sm text-muted-foreground">
                Question <span data-testid="text-current-question">{currentQuestion + 1}</span> of{' '}
                <span data-testid="text-total-questions">{totalQuestions}</span>
              </span>
              <Progress value={progressPercentage} className="w-32" />
            </div>
          </div>

          {/* Quiz Question */}
          <Card className="shadow-sm mb-6">
            <CardContent className="pt-8">
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-foreground mb-4" data-testid="text-question">
                  {currentQuizQuestion.question}
                </h2>
                
                {currentQuizQuestion.visual && (
                  <div className="mb-8" dangerouslySetInnerHTML={{ __html: currentQuizQuestion.visual }} />
                )}
              </div>

              {/* Answer Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {currentQuizQuestion.options.map((option, index) => (
                  <Button
                    key={index}
                    variant={selectedAnswer === index ? "default" : "outline"}
                    className="h-auto p-6 text-xl font-semibold text-center"
                    onClick={() => handleAnswerSelect(index)}
                    data-testid={`button-option-${index}`}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quiz Actions */}
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={handleQuizHelp}
              data-testid="button-quiz-help"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              Need a hint?
            </Button>
            
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={handleSkipQuestion}
                disabled={currentQuestion >= totalQuestions - 1}
                data-testid="button-skip-question"
              >
                Skip
              </Button>
              <Button
                onClick={handleSubmitAnswer}
                disabled={selectedAnswer === null || submitQuizMutation.isPending}
                data-testid="button-submit-answer"
              >
                {currentQuestion < totalQuestions - 1 ? "Next Question" : "Submit Quiz"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
