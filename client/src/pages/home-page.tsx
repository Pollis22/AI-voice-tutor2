import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import jieLogo from "@/assets/jie-logo.png";

export default function HomePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  const { data: resumeData } = useQuery({
    queryKey: ["/api/resume"],
    enabled: !!user,
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

  const handleResumeSession = () => {
    if ((resumeData as any)?.lessonId) {
      setLocation(`/lesson/${(resumeData as any).lessonId}`);
    }
  };

  const handleStartNewLesson = () => {
    // Navigate to first available lesson or lesson selection
    setLocation("/lessons");
  };

  const handlePracticeQuiz = () => {
    // Navigate to quiz selection or most recent lesson quiz
    setLocation("/quiz");
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Welcome Section */}
          <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-8 text-white">
            <div className="flex items-center gap-4 mb-4">
              <img 
                src={jieLogo} 
                alt="JIE Mastery Logo" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-3xl font-bold" data-testid="text-welcome">
                  Welcome back, {(dashboard as any)?.user?.firstName || 'Student'}! 👋
                </h1>
                <p className="text-primary-foreground/90 text-lg">Ready to master your subjects with JIE Mastery Tutor?</p>
              </div>
            </div>
          </div>

          {/* Resume Learning Card */}
          {(resumeData as any)?.hasResumeSession && (
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground">Resume Where You Left Off</h2>
                  <span className="text-sm text-muted-foreground" data-testid="text-last-activity">
                    {(resumeData as any)?.session?.lastActivity}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <svg className="w-8 h-8 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground" data-testid="text-resume-subject">
                      {(resumeData as any)?.session?.subject}
                    </h3>
                    <p className="text-muted-foreground text-sm" data-testid="text-resume-lesson">
                      {(resumeData as any)?.session?.lesson}
                    </p>
                    <div className="flex items-center space-x-2 mt-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div 
                          className="bg-secondary h-2 rounded-full" 
                          style={{ width: `${(resumeData as any)?.session?.progressPercentage || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {(resumeData as any)?.session?.progressPercentage || 0}% complete
                      </span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleResumeSession}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    data-testid="button-resume-session"
                  >
                    Continue Learning
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subject Progress Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(dashboard as any)?.subjectProgress?.map((subject: any, index: number) => {
              const colors = [
                { bg: 'bg-blue-100', text: 'text-blue-600', progress: 'text-blue-600' },
                { bg: 'bg-green-100', text: 'text-green-600', progress: 'text-green-600' },
                { bg: 'bg-orange-100', text: 'text-orange-600', progress: 'text-orange-600' },
              ];
              const color = colors[index] || colors[0];

              return (
                <Card key={subject.subject.id} className="shadow-sm" data-testid={`card-subject-${index}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 ${color.bg} rounded-lg flex items-center justify-center`}>
                          <svg className={`w-5 h-5 ${color.text}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground" data-testid={`text-subject-name-${index}`}>
                            {subject.subject.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {subject.subject.description}
                          </p>
                        </div>
                      </div>
                      <ProgressRing 
                        percentage={subject.progressPercentage} 
                        className={color.progress}
                        data-testid={`progress-${index}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Lessons completed</span>
                        <span className="font-medium" data-testid={`text-completed-${index}`}>
                          {subject.completed}/{subject.total}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Quiz score avg</span>
                        <span className="font-medium text-secondary" data-testid={`text-score-${index}`}>
                          {subject.avgQuizScore}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Usage Meter & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Weekly Usage Meter */}
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Weekly Usage</h3>
                  <span className="text-sm text-muted-foreground">Resets in 3 days</span>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Voice minutes used</span>
                    <span className="font-medium" data-testid="text-usage-minutes">
                      {(dashboard as any)?.usage?.voiceMinutes || '0 / 60 min'}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-secondary to-primary h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((dashboard as any)?.usage?.percentage || 0, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 min</span>
                    <span>90 min</span>
                  </div>
                  <div className="bg-secondary/10 rounded-lg p-3 mt-4">
                    <p className="text-sm text-secondary-foreground">
                      <svg className="w-4 h-4 inline mr-1 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                      </svg>
                      {((dashboard as any)?.usage?.percentage || 0) < 80 
                        ? "You have plenty of voice time remaining this week!"
                        : "Consider upgrading for more voice time!"
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 text-left"
                    onClick={handleStartNewLesson}
                    data-testid="button-start-lesson"
                  >
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Start New Lesson</p>
                      <p className="text-sm text-muted-foreground">Begin learning something new</p>
                    </div>
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 text-left"
                    onClick={handlePracticeQuiz}
                    data-testid="button-practice-quiz"
                  >
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Practice Quiz</p>
                      <p className="text-sm text-muted-foreground">Review previous lessons</p>
                    </div>
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 text-left"
                    onClick={() => setLocation("/transcripts")}
                    data-testid="button-view-transcripts"
                  >
                    <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">View Transcripts</p>
                      <p className="text-sm text-muted-foreground">Review your conversations</p>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
