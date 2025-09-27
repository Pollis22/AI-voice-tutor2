import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TutorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Tutor error boundary:", error, errorInfo);
    this.props.onError?.(error, errorInfo);

    // Analytics tracking for errors
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_error_boundary', {
        event_category: 'error',
        event_label: error.message || 'unknown_error',
        custom_parameter_1: errorInfo.componentStack
      });
    }

    // Legacy analytics support
    if ((window as any).analytics) {
      (window as any).analytics.track("Tutor Error", {
        error: error.toString(),
        stack: error.stack,
        component: errorInfo.componentStack,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <CardTitle className="text-xl">Learning Session Error</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <p className="text-muted-foreground">
                  We encountered an issue with the tutor. Please refresh and try again.
                </p>
                
                <div className="space-y-2">
                  <Button 
                    onClick={() => window.location.reload()}
                    className="w-full"
                    data-testid="button-refresh-page"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Page
                  </Button>
                  
                  <details className="text-left">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Show Error Details
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-32">
                        {this.state.error?.toString()}
                      </pre>
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      );
    }
    return this.props.children;
  }
}