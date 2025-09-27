import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { TutorErrorBoundary } from "@/components/tutor-error-boundary";
import { AGENTS, GREETINGS, type AgentLevel } from "@/agents";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': {
        'agent-id': string;
        'first-user-message'?: string;
        'metadata-student-name'?: string;
        'metadata-student-grade'?: string;
        style?: string;
      };
    }
  }
}

const SUBJECT_STARTERS: Record<string, string> = {
  general: "I'd like a quick skills check to see where I should start.",
  math:    "I want to work on math today. Begin with a warm-up problem at my level.",
  english: "I want help with reading/writing. Start with a short exercise at my level.",
  spanish: "I want to practice Spanish. Start with simple call-and-response drills."
};

type ProgressNote = {
  lastLevel?: string;
  lastSubject?: string;
  lastSummary?: string;
  updatedAt?: string;
};

const PROGRESS_KEY = "tutormind_progress_v1";

const loadProgress = (): ProgressNote => {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveProgress = (p: ProgressNote) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {}
};

export default function TutorPage() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [widgetStatus, setWidgetStatus] = useState<'loading' | 'ready' | 'error' | 'reconnecting'>('loading');
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  // Check microphone permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setPermissionState(result.state);
        result.addEventListener('change', () => {
          setPermissionState(result.state);
        });
      } catch (error) {
        console.warn('Permissions API not supported:', error);
      }
    };
    checkPermissions();
  }, []);

  // Load ElevenLabs script with performance tracking
  useEffect(() => {
    if (document.querySelector('script[data-elevenlabs-convai]')) {
      setScriptReady(true);
      return;
    }
    
    setLoadStartTime(Date.now());
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    
    s.onload = () => {
      const loadTime = Date.now() - (loadStartTime || 0);
      console.log(`ConvAI widget loaded in ${loadTime}ms`);
      
      // Analytics hook for performance tracking
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_loaded', {
          custom_parameter_1: loadTime,
          event_category: 'performance'
        });
      }
      
      setScriptReady(true);
      setNetworkError(null);
      setWidgetStatus('ready');
      
      // Add global error handler for unhandled promises
      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        if (typeof window !== 'undefined' && (window as any).gtag) {
          (window as any).gtag('event', 'unhandled_error', {
            event_category: 'error',
            event_label: event.reason?.toString() || 'unknown'
          });
        }
      });
    };
    
    s.onerror = (error) => {
      console.error('Failed to load ElevenLabs ConvAI script:', error);
      setNetworkError('Failed to load ConvAI widget. Please check your internet connection and try again.');
      
      // Analytics hook for error tracking
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_error', {
          event_category: 'error',
          event_label: 'script_load_failed'
        });
      }
    };
    
    document.body.appendChild(s);
  }, [loadStartTime]);

  const composeFirstUserMessage = () => {
    const starter = SUBJECT_STARTERS[subject] || "";
    const tail = lastSummary ? ` Also, resume from last time: ${lastSummary}` : "";
    return `${starter}${tail}`.trim();
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionState('granted');
      
      // Analytics hook for permission granted
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'microphone_permission_granted', {
          event_category: 'permissions'
        });
      }
      
      // Stop the stream immediately as we just needed permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error: any) {
      console.error('Microphone permission error:', error);
      setPermissionState('denied');
      
      // Analytics hook for permission denied
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'microphone_permission_denied', {
          event_category: 'permissions',
          event_label: error.name
        });
      }
      
      return false;
    }
  };

  const mount = (agentId: string, firstUserMessage?: string) => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const el = document.createElement("elevenlabs-convai");
    el.setAttribute("agent-id", agentId);
    if (firstUserMessage) el.setAttribute("first-user-message", firstUserMessage);
    if (studentName) el.setAttribute("metadata-student-name", studentName);
    if (gradeText) el.setAttribute("metadata-student-grade", gradeText);
    
    // Add event listeners for session continuity
    el.addEventListener('conversation-end', (event: any) => {
      const summary = event.detail?.summary || "Session completed";
      setLastSummary(summary);
      const currentProgress = loadProgress();
      saveProgress({
        ...currentProgress,
        lastLevel: level,
        lastSubject: subject,
        lastSummary: summary,
        updatedAt: new Date().toISOString(),
      });
      
      // Analytics hook for conversation end
      const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'conversation_end', {
          event_category: 'engagement',
          custom_parameter_1: level,
          custom_parameter_2: subject,
          custom_parameter_3: Math.round(sessionDuration / 1000) // duration in seconds
        });
      }
    });
    
    // Add error and connection event listeners
    el.addEventListener("error", (e: any) => {
      console.error("ConvAI widget error:", e.detail);
      setWidgetStatus('error');
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'widget_error', {
          event_category: 'error',
          event_label: e.detail?.type || 'unknown'
        });
      }
    });
    
    el.addEventListener("connection-lost", (e: any) => {
      console.warn("ConvAI connection lost, attempting reconnect...");
      setWidgetStatus('reconnecting');
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'connection_lost', {
          event_category: 'connectivity'
        });
      }
    });
    
    el.addEventListener("reconnected", (e: any) => {
      console.log("ConvAI reconnected successfully");
      setWidgetStatus('ready');
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'reconnected', {
          event_category: 'connectivity'
        });
      }
    });
    
    el.addEventListener("widget-ready", (e: any) => {
      const widgetReadyTime = Date.now() - (sessionStartTime || 0);
      console.log(`ConvAI widget ready in ${widgetReadyTime}ms`);
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'widget_ready', {
          event_category: 'performance',
          custom_parameter_1: widgetReadyTime
        });
      }
    });
    
    containerRef.current.appendChild(el);

    // Save initial progress on mount
    const currentProgress = loadProgress();
    saveProgress({
      ...currentProgress,
      lastLevel: level,
      lastSubject: subject,
      updatedAt: new Date().toISOString(),
    });
    setIsStarted(true);
  };

  const startTutor = async () => {
    // Request microphone permission before starting
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      return; // Don't start if permission denied
    }
    
    // Analytics hook for session start
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_started', {
        event_category: 'engagement',
        custom_parameter_1: level,
        custom_parameter_2: subject
      });
    }
    
    setIsStarted(true);
    setSessionStartTime(Date.now());
  };
  
  const switchTutor = () => {
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    
    // Analytics hook for switch tutor
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'switch_tutor', {
        event_category: 'engagement',
        custom_parameter_1: level,
        custom_parameter_2: subject
      });
    }
    
    // Remount with new configuration
    setTimeout(() => mount(AGENTS[level], composeFirstUserMessage()), 100);
  };
  
  // Mount the widget when started
  useEffect(() => {
    if (isStarted && scriptReady) {
      mount(AGENTS[level], composeFirstUserMessage());
    }
  }, [isStarted, scriptReady]);
  
  // Save progress when level or subject changes
  useEffect(() => {
    if (isStarted) {
      const currentProgress = loadProgress();
      saveProgress({
        ...currentProgress,
        lastLevel: level,
        lastSubject: subject,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [level, subject, isStarted]);

  return (
    <TutorErrorBoundary>
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        
        <div className="flex-1 p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-tutor-title">
              JIE Tutor — Multi-Agent
            </h1>
            <p className="text-muted-foreground text-lg">
              Age-appropriate AI tutoring with voice conversation
            </p>
          </div>

          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Tutor Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="level">Level</Label>
                  <Select value={level} onValueChange={(value: AgentLevel) => setLevel(value)}>
                    <SelectTrigger data-testid="select-level">
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
                    <SelectTrigger data-testid="select-subject">
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
                  <Label htmlFor="studentName">Student Name</Label>
                  <Input
                    id="studentName"
                    placeholder="Optional"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    data-testid="input-student-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gradeText">Grade</Label>
                  <Input
                    id="gradeText"
                    placeholder="e.g., 3rd grade"
                    value={gradeText}
                    onChange={(e) => setGradeText(e.target.value)}
                    data-testid="input-grade-text"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                {!isStarted ? (
                  <Button 
                    onClick={startTutor} 
                    disabled={!scriptReady || permissionState === 'denied'}
                    size="lg"
                    data-testid="button-start-tutor"
                  >
                    {permissionState === 'granted' ? 'Start Tutor' : 'Start Tutor (Mic Required)'}
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={switchTutor} 
                      disabled={!scriptReady}
                      size="lg"
                      data-testid="button-switch-tutor"
                    >
                      Switch Tutor
                    </Button>
                    <Button 
                      onClick={() => {
                        // Analytics hook for stop session
                        const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
                        if (typeof window !== 'undefined' && (window as any).gtag) {
                          (window as any).gtag('event', 'stop_session', {
                            event_category: 'engagement',
                            custom_parameter_1: level,
                            custom_parameter_2: subject,
                            custom_parameter_3: Math.round(sessionDuration / 1000) // duration in seconds
                          });
                        }
                        
                        setIsStarted(false);
                        if (containerRef.current) {
                          containerRef.current.innerHTML = "";
                        }
                      }} 
                      variant="outline"
                      size="lg"
                      data-testid="button-stop-tutor"
                    >
                      Stop Session
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Greeting Preview */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Your Tutor Will Say:</h3>
                <p className="text-muted-foreground italic" data-testid="text-greeting-preview">
                  "{GREETINGS[level]}"
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ConvAI Widget */}
          <Card className="shadow-lg">
            <CardContent className="p-0">
              {networkError ? (
                <div className="text-center py-16" data-testid="text-network-error">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">⚠️</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Connection Error
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {networkError}
                  </p>
                  <Button 
                    onClick={() => window.location.reload()} 
                    variant="outline"
                    data-testid="button-retry"
                  >
                    Retry Connection
                  </Button>
                </div>
              ) : !scriptReady ? (
                <div className="text-center py-16" data-testid="text-loading">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading ConvAI widget...</p>
                  {loadStartTime && Date.now() - loadStartTime > 5000 && (
                    <p className="text-sm text-amber-600 mt-2">
                      This is taking longer than expected. Check your connection.
                    </p>
                  )}
                </div>
              ) : permissionState === 'denied' ? (
                <div className="text-center py-16" data-testid="text-permission-denied">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🎤</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Microphone Access Required
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Voice tutoring requires microphone access. Please allow microphone permissions and refresh the page.
                  </p>
                  <div className="space-y-2">
                    <Button 
                      onClick={requestMicrophonePermission} 
                      data-testid="button-request-mic"
                    >
                      Request Permission
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      iOS: Settings → Safari → Microphone<br/>
                      Android: Site settings → Permissions → Microphone
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div 
                    className={`${!isStarted ? "block" : "hidden"} text-center py-16`} 
                    data-testid="text-not-started"
                  >
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">🎓</span>
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      Ready to Start Learning
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Configure your settings above and click "Start Tutor" to begin your personalized learning session.
                    </p>
                  </div>
                  <div 
                    ref={containerRef} 
                    className={`${isStarted ? "block" : "hidden"}`}
                    data-testid="convai-widget-container" 
                  />
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
    </TutorErrorBoundary>
  );
}