import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (document.querySelector('script[data-elevenlabs-convai]')) {
      setScriptReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    s.onload = () => setScriptReady(true);
    s.onerror = () => console.error('Failed to load ElevenLabs ConvAI script');
    document.body.appendChild(s);
  }, []);

  const composeFirstUserMessage = () => {
    const starter = SUBJECT_STARTERS[subject] || "";
    const tail = lastSummary ? ` Also, resume from last time: ${lastSummary}` : "";
    return `${starter}${tail}`.trim();
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

  const startTutor = () => {
    setIsStarted(true);
  };
  
  const switchTutor = () => {
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
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
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

              <div className="flex justify-center gap-4 pt-4">
                {!isStarted ? (
                  <Button 
                    onClick={startTutor} 
                    disabled={!scriptReady}
                    size="lg"
                    data-testid="button-start-tutor"
                  >
                    Start Tutor
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
              {!scriptReady ? (
                <div className="text-center py-16" data-testid="text-loading">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading ConvAI widget...</p>
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
  );
}