import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': {
        'agent-id': string;
        style: string;
      };
    }
  }
}

export default function TutorPage() {
  const { user } = useAuth();
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Get health status to check ConvAI configuration
  const { data: health } = useQuery({
    queryKey: ["/api/health"],
    enabled: !!user,
  }) as { data?: { convai?: boolean; useConvai?: boolean } };

  // Load ElevenLabs ConvAI widget script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => console.error('Failed to load ElevenLabs ConvAI script');
    document.head.appendChild(script);

    return () => {
      // Clean up script if component unmounts
      const existingScript = document.querySelector('script[src="https://unpkg.com/@elevenlabs/convai-widget-embed"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  // Get agent ID from environment
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-tutor-title">
              AI Tutor Conversation
            </h1>
            <p className="text-muted-foreground text-lg">
              Talk directly with your AI tutor using advanced voice technology
            </p>
          </div>

          {/* Connection Status */}
          <div className="flex justify-center space-x-4">
            {health?.convai ? (
              <Badge variant="default" className="flex items-center space-x-2" data-testid="badge-connection-ok">
                <CheckCircle className="w-4 h-4" />
                <span>Connection OK</span>
              </Badge>
            ) : (
              <Badge variant="destructive" className="flex items-center space-x-2" data-testid="badge-connection-error">
                <AlertCircle className="w-4 h-4" />
                <span>Set ELEVENLABS_AGENT_ID in Secrets/Deploy</span>
              </Badge>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open('/api/health', '_blank')}
              data-testid="button-health-check"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Health Check
            </Button>
          </div>

          {/* ConvAI Widget */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-center">Voice Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              {!agentId ? (
                <div className="text-center py-16" data-testid="text-no-agent-id">
                  <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    ConvAI Not Configured
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Please set ELEVENLABS_AGENT_ID in your environment variables to enable voice conversation.
                  </p>
                  <Badge variant="outline">Configuration Required</Badge>
                </div>
              ) : !scriptLoaded ? (
                <div className="text-center py-16" data-testid="text-loading">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading ConvAI widget...</p>
                </div>
              ) : (
                <div className="w-full" data-testid="convai-widget-container">
                  <elevenlabs-convai 
                    agent-id={agentId} 
                    style="width:100%;height:640px"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">🎤</span>
                  </div>
                  <h3 className="font-semibold mb-2">Start Talking</h3>
                  <p className="text-sm text-muted-foreground">
                    Click to start a voice conversation with your AI tutor
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">🧠</span>
                  </div>
                  <h3 className="font-semibold mb-2">Learn Interactively</h3>
                  <p className="text-sm text-muted-foreground">
                    Ask questions, get explanations, and receive personalized feedback
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📈</span>
                  </div>
                  <h3 className="font-semibold mb-2">Track Progress</h3>
                  <p className="text-sm text-muted-foreground">
                    Your tutor adapts to your learning style and tracks your improvements
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}