import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { TutorErrorBoundary } from "@/components/tutor-error-boundary";
import { NetworkAwareWrapper } from "@/components/network-aware-wrapper";
import { NavigationHeader } from "@/components/navigation-header";
import ConvaiHost from "@/components/convai-host";
import { AGENTS, GREETINGS, type AgentLevel } from "@/agents";
import jieLogo from "@/assets/jie-logo.png";
import { AlertTriangle, BookOpen, Users, Award } from "lucide-react";

interface ProgressData {
  lastLevel?: string;
  lastSubject?: string;
  lastSummary?: string;
  updatedAt?: string;
}

const loadProgress = (): ProgressData => {
  try {
    const saved = localStorage.getItem('jie-tutor-progress');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const saveProgress = (data: ProgressData) => {
  try {
    localStorage.setItem('jie-tutor-progress', JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

export default function TutorPage() {
  const { user } = useAuth();
  const [scriptReady, setScriptReady] = useState(false);

  const memo = loadProgress();
  const [level, setLevel] = useState<AgentLevel>((memo.lastLevel as AgentLevel) || "k2");
  const [subject, setSubject] = useState(memo.lastSubject || "general");
  const [studentName, setStudentName] = useState("");
  const [gradeText, setGradeText] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [lastSummary, setLastSummary] = useState(memo.lastSummary || "");
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Check microphone permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setPermissionState('denied');
          return;
        }

        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setPermissionState(result.state as any);
        
        result.addEventListener('change', () => {
          setPermissionState(result.state as any);
        });
      } catch {
        setPermissionState('prompt');
      }
    };
    
    checkPermissions();
  }, []);

  // Load ConvAI script
  useEffect(() => {
    const existing = document.querySelector('script[data-elevenlabs-convai]');
    if (existing) {
      setScriptReady(true);
      return;
    }

    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    
    s.onload = () => {
      setScriptReady(true);
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_loaded', {
          event_category: 'performance'
        });
      }
    };
    
    s.onerror = () => {
      console.error('Failed to load ElevenLabs ConvAI script');
      setNetworkError('Failed to load ConvAI widget. Please check your internet connection and try again.');
      
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_error', {
          event_category: 'error',
          event_label: 'script_load_failed'
        });
      }
    };
    
    document.body.appendChild(s);
  }, []);

  const requestMicrophonePermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionState('granted');
    } catch {
      setPermissionState('denied');
    }
  };

  const startTutor = () => {
    if (!scriptReady) return;
    
    setIsStarted(true);
    
    // Save progress
    const currentProgress = loadProgress();
    saveProgress({
      ...currentProgress,
      lastLevel: level,
      lastSubject: subject,
      updatedAt: new Date().toISOString(),
    });

    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_start', {
        event_category: 'tutoring',
        custom_parameter_1: level,
        custom_parameter_2: subject,
        custom_parameter_3: studentName || 'anonymous'
      });
    }
  };

  const stopTutor = () => {
    setIsStarted(false);
    
    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_end', {
        event_category: 'tutoring'
      });
    }
  };

  const switchAgent = () => {
    setIsStarted(false);
    setTimeout(() => setIsStarted(true), 100);
  };

  const agentId = AGENTS[level as keyof typeof AGENTS];
  const levelGreetings = GREETINGS[level as keyof typeof GREETINGS];
  const greetingPreview = levelGreetings?.[subject as keyof typeof levelGreetings] || 
                         levelGreetings?.["general"] || 
                         "Hello! I'm your AI tutor, ready to help you learn.";

  const metadata = {
    ...(studentName && { student_name: studentName }),
    ...(gradeText && { grade: gradeText }),
    subject,
    level
  };

  const firstUserMessage = lastSummary ? 
    `Previous session summary: ${lastSummary}. Please continue our learning journey from here.` : 
    undefined;

  // Save progress when level or subject changes
  useEffect(() => {
    if (level && subject) {
      const currentProgress = loadProgress();
      saveProgress({
        ...currentProgress,
        lastLevel: level,
        lastSubject: subject,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [level, subject]);

  return (
    <TutorErrorBoundary>
      <NetworkAwareWrapper 
        onOffline={() => {
          console.log('Network went offline');
          setNetworkError('Connection lost. Please check your internet connection.');
        }}
        onOnline={() => {
          console.log('Network came back online');
          setNetworkError(null);
        }}
      >
        <div className="min-h-screen bg-background">
          <NavigationHeader />
          
          <div className="flex-1 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-6">
            
              {/* Header with Logo */}
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <img 
                    src={jieLogo} 
                    alt="JIE Mastery Logo" 
                    className="h-16 w-auto"
                    data-testid="img-jie-logo"
                  />
                  <div>
                    <h1 
                      className="text-3xl font-bold text-foreground mb-1" 
                      data-testid="text-tutor-title"
                      id="page-title"
                    >
                      JIE Mastery Tutor
                    </h1>
                    <p className="text-muted-foreground">
                      Multi-Agent AI Tutoring System
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Experience personalized learning with age-appropriate AI tutors for Math, English, and Spanish
                </p>
              </div>

              {/* Configuration Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Tutor Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {/* Settings Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="age-range">Age Group</Label>
                      <Select value={level} onValueChange={(value: AgentLevel) => setLevel(value)}>
                        <SelectTrigger data-testid="select-level" id="age-range">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="k2">Kindergarten–2</SelectItem>
                          <SelectItem value="g3_5">Grades 3–5</SelectItem>
                          <SelectItem value="g6_8">Grades 6–8</SelectItem>
                          <SelectItem value="g9_12">Grades 9–12</SelectItem>
                          <SelectItem value="college">College/Adult</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Select value={subject} onValueChange={setSubject}>
                        <SelectTrigger data-testid="select-subject" id="subject">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="math">Math</SelectItem>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value="spanish">Spanish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="student-name">Student Name</Label>
                      <Input
                        id="student-name"
                        placeholder="Optional"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        data-testid="input-student-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="grade-text">Grade</Label>
                      <Input
                        id="grade-text"
                        placeholder="e.g., 3rd grade"
                        value={gradeText}
                        onChange={(e) => setGradeText(e.target.value)}
                        data-testid="input-grade-text"
                      />
                    </div>
                  </div>

                  {/* Greeting Preview */}
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Your Tutor Will Say:
                        </div>
                        <div className="text-base text-foreground italic">
                          "{greetingPreview}"
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3 justify-center">
                    {!isStarted ? (
                      <Button 
                        onClick={startTutor} 
                        disabled={!scriptReady || permissionState === 'denied'}
                        size="lg"
                        data-testid="button-start-tutor"
                        id="start-btn"
                        className="flex items-center gap-2"
                      >
                        <Award className="h-4 w-4" />
                        {permissionState === 'granted' ? 'Start Learning' : 'Start Learning (Mic Required)'}
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={switchAgent} 
                          variant="outline"
                          data-testid="button-switch-agent"
                          id="switch-btn"
                        >
                          Switch Tutor
                        </Button>
                        <Button 
                          onClick={stopTutor} 
                          variant="destructive"
                          data-testid="button-stop-tutor"
                          id="end-btn"
                        >
                          Stop Session
                        </Button>
                      </>
                    )}
                  </div>

                </CardContent>
              </Card>

              {/* Network Error Display */}
              {networkError && (
                <Card className="border-destructive bg-destructive/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm">{networkError}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ConvAI Widget Area */}
              <Card>
                <CardContent className="p-6">
                  {permissionState === 'denied' ? (
                    <div className="text-center py-12 space-y-4">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold">Microphone Access Required</h3>
                        <p className="text-muted-foreground">
                          Voice tutoring requires microphone access. Please allow microphone permissions and refresh the page.
                        </p>
                        <Button 
                          onClick={requestMicrophonePermission} 
                          data-testid="button-request-mic"
                          className="mt-4"
                        >
                          Request Permission
                        </Button>
                        <div className="text-xs text-muted-foreground mt-2">
                          iOS: Settings → Safari → Microphone<br/>
                          Android: Site settings → Permissions → Microphone
                        </div>
                      </div>
                    </div>
                  ) : !isStarted ? (
                    <div className="text-center py-16 space-y-4">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                        <BookOpen className="h-8 w-8 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold">Ready to Start Learning</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Configure your settings above and click "Start Learning" to begin your personalized tutoring session.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Active Learning Session</h3>
                        <div className="text-sm text-muted-foreground">
                          {level.toUpperCase()} • {subject.toUpperCase()}
                        </div>
                      </div>
                      <ConvaiHost
                        agentId={agentId}
                        firstUserMessage={firstUserMessage}
                        metadata={metadata}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </NetworkAwareWrapper>
    </TutorErrorBoundary>
  );
}