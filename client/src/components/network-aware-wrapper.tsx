import { useState, useEffect, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NetworkAwareWrapperProps {
  children: ReactNode;
  onOffline?: () => void;
  onOnline?: () => void;
  offlineFallback?: ReactNode;
}

export const NetworkAwareWrapper = ({
  children,
  onOffline,
  onOnline,
  offlineFallback,
}: NetworkAwareWrapperProps) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionType, setConnectionType] = useState<string>("unknown");

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onOnline?.();
      // Track network status changes
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'network_online', {
          event_category: 'network',
          event_label: 'connection_restored'
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      onOffline?.();
      // Track network status changes
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'network_offline', {
          event_category: 'network',
          event_label: 'connection_lost'
        });
      }
    };

    const updateConnectionType = () => {
      const connection = (navigator as any).connection;
      if (connection) {
        const effectiveType = connection.effectiveType || "unknown";
        setConnectionType(effectiveType);
        
        // Track connection quality changes
        if (typeof window !== 'undefined' && (window as any).gtag) {
          (window as any).gtag('event', 'connection_quality_change', {
            event_category: 'network',
            event_label: effectiveType
          });
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener("change", updateConnectionType);
    }

    updateConnectionType();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ((navigator as any).connection) {
        (navigator as any).connection.removeEventListener("change", updateConnectionType);
      }
    };
  }, [onOffline, onOnline]);

  if (!isOnline) {
    return (
      <Card className="max-w-md mx-auto mt-8" data-testid="card-offline-notice">
        <CardContent className="pt-6">
          {offlineFallback || (
            <div className="text-center space-y-4" role="alert">
              <div className="flex justify-center">
                <WifiOff className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold" data-testid="text-offline-title">You're Offline</h3>
                <p className="text-muted-foreground" data-testid="text-offline-message">
                  The AI tutor requires an internet connection. Please check your connection and try again.
                </p>
              </div>
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                className="w-full"
                data-testid="button-retry-connection"
              >
                <Wifi className="h-4 w-4 mr-2" />
                Retry Connection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (connectionType === "2g" || connectionType === "slow-2g") {
    return (
      <div className="space-y-4">
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950" data-testid="card-slow-connection">
          <CardContent className="pt-4">
            <div className="flex items-center space-x-2 text-yellow-800 dark:text-yellow-200" role="status">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm" data-testid="text-slow-connection-warning">
                Slow connection detected. Voice features may be delayed.
              </p>
            </div>
          </CardContent>
        </Card>
        {children}
      </div>
    );
  }

  return <>{children}</>;
};