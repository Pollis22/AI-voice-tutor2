import { useEffect, useRef, useState } from "react";
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor";

type Props = {
  agentId: string;
  firstUserMessage?: string;
  metadata?: Record<string, string>;
  onMounted?: () => void;
  onUnmounted?: () => void;
};

export default function ConvaiHost({
  agentId,
  firstUserMessage,
  metadata = {},
  onMounted,
  onUnmounted,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const perf = usePerformanceMonitor(agentId);

  // Load embed script once
  useEffect(() => {
    const existing = document.querySelector('script[data-elevenlabs-convai]');
    if (existing) {
      setReady(true);
      perf.markScriptLoaded();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    s.onload = () => {
      setReady(true);
      perf.markScriptLoaded();
    };
    s.onerror = () => {
      perf.incrementError();
      console.error('Failed to load ElevenLabs ConvAI script');
    };
    document.body.appendChild(s);
  }, [perf]);

  // Mount on agentId change
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    if (!containerRef.current) return;
    
    containerRef.current.setAttribute("aria-busy", "true"); // accessibility hint
    containerRef.current.innerHTML = "";

    const el = document.createElement("elevenlabs-convai");
    el.setAttribute("agent-id", agentId);
    if (firstUserMessage) el.setAttribute("first-user-message", firstUserMessage);
    for (const [k, v] of Object.entries(metadata)) {
      el.setAttribute(`metadata-${k}`, v);
    }

    // Add event listeners for performance monitoring
    el.addEventListener("widget-ready", () => {
      console.log("[ConvAI] Widget ready for agent:", agentId);
      perf.markFirstInteraction();
    });

    el.addEventListener("user-spoke", () => {
      console.log("[ConvAI] User speaking");
      perf.incrementTurn();
    });

    el.addEventListener("agent-spoke", () => {
      console.log("[ConvAI] Agent responding");
      perf.incrementTurn();
    });

    el.addEventListener("error", (e: any) => {
      console.error("[ConvAI] Widget error:", e.detail || e);
      perf.incrementError();
    });

    if (containerRef.current) {
      containerRef.current.appendChild(el);
      containerRef.current.removeAttribute("aria-busy");
    }
    perf.markWidgetMounted();
    onMounted?.();

    return () => {
      try {
        (el as any)?.disconnect?.();
      } catch {}
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      onUnmounted?.();
    };
  }, [ready, agentId, firstUserMessage, metadata, onMounted, onUnmounted, perf]);

  return <div ref={containerRef} className="convai-container" data-testid="convai-widget-container" />;
}