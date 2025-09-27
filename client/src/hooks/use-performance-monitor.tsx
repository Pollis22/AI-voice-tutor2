import { useEffect, useRef } from "react";

interface PerformanceMetrics {
  scriptLoadTime: number;
  widgetMountTime: number;
  firstInteractionTime: number;
  sessionDuration: number;
  turnCount: number;
  errorCount: number;
}

export const usePerformanceMonitor = (agentId: string) => {
  const metricsRef = useRef<PerformanceMetrics>({
    scriptLoadTime: 0,
    widgetMountTime: 0,
    firstInteractionTime: 0,
    sessionDuration: 0,
    turnCount: 0,
    errorCount: 0,
  });

  const startTimeRef = useRef<number>(Date.now());

  const markScriptLoaded = () => {
    metricsRef.current.scriptLoadTime = Date.now() - startTimeRef.current;
  };

  const markWidgetMounted = () => {
    metricsRef.current.widgetMountTime = Date.now() - startTimeRef.current;
  };

  const markFirstInteraction = () => {
    if (!metricsRef.current.firstInteractionTime) {
      metricsRef.current.firstInteractionTime = Date.now() - startTimeRef.current;
    }
  };

  const incrementTurn = () => {
    metricsRef.current.turnCount++;
  };

  const incrementError = () => {
    metricsRef.current.errorCount++;
  };

  const getMetrics = (): PerformanceMetrics => ({
    ...metricsRef.current,
    sessionDuration: Date.now() - startTimeRef.current,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      sendMetrics(agentId, getMetrics());
    }, 300000); // every 5 minutes

    return () => {
      clearInterval(interval);
      sendMetrics(agentId, getMetrics());
    };
  }, [agentId]);

  return {
    markScriptLoaded,
    markWidgetMounted,
    markFirstInteraction,
    incrementTurn,
    incrementError,
    getMetrics,
  };
};

const sendMetrics = (agentId: string, metrics: PerformanceMetrics) => {
  // Google Analytics integration
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'tutor_performance_metrics', {
      event_category: 'performance',
      custom_parameter_1: agentId,
      custom_parameter_2: metrics.scriptLoadTime,
      custom_parameter_3: metrics.widgetMountTime,
      custom_parameter_4: metrics.firstInteractionTime,
      custom_parameter_5: metrics.sessionDuration,
      custom_parameter_6: metrics.turnCount,
      custom_parameter_7: metrics.errorCount
    });
  }

  // Legacy analytics support
  if ((window as any).analytics) {
    (window as any).analytics.track("Tutor Performance", {
      agentId,
      ...metrics,
      timestamp: Date.now(),
    });
  }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("Performance metrics:", { agentId, ...metrics });
  }
};