// Session telemetry and transcript management

export interface TranscriptEntry {
  timestamp: number;
  speaker: 'user' | 'tutor';
  content: string;
  topic?: string;
  energyLevel?: string;
}

export interface SessionTelemetry {
  sessionId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  transcript: TranscriptEntry[];
  topics: string[];
  totalInteractions: number;
  lastActivity: number;
  shareToken?: string;
  shareExpiry?: number;
}

export class TelemetryManager {
  private sessions: Map<string, SessionTelemetry> = new Map();
  private readonly MAX_SESSIONS = 1000; // Prevent memory growth

  // Start a new session
  startSession(sessionId: string, userId: string): SessionTelemetry {
    const telemetry: SessionTelemetry = {
      sessionId,
      userId,
      startTime: Date.now(),
      transcript: [],
      topics: [],
      totalInteractions: 0,
      lastActivity: Date.now()
    };
    
    this.sessions.set(sessionId, telemetry);
    console.log(`[Telemetry] Started session: ${sessionId}`);
    return telemetry;
  }

  // Add transcript entry
  addTranscriptEntry(sessionId: string, entry: Omit<TranscriptEntry, 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const transcriptEntry: TranscriptEntry = {
      ...entry,
      timestamp: Date.now()
    };

    session.transcript.push(transcriptEntry);
    session.totalInteractions++;
    session.lastActivity = Date.now();

    // Track unique topics
    if (entry.topic && !session.topics.includes(entry.topic)) {
      session.topics.push(entry.topic);
    }

    console.log(`[Telemetry] Added ${entry.speaker} entry to session ${sessionId}`);
  }

  // End session
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      console.log(`[Telemetry] Ended session: ${sessionId}, duration: ${(session.endTime - session.startTime) / 1000}s`);
    }
  }

  // Get session transcript
  getTranscript(sessionId: string): TranscriptEntry[] {
    const session = this.sessions.get(sessionId);
    return session ? session.transcript : [];
  }

  // Get session summary
  getSessionSummary(sessionId: string): SessionTelemetry | null {
    return this.sessions.get(sessionId) || null;
  }

  // Generate secure share token for a session
  generateShareToken(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Generate random share token and set expiry (24 hours)
    const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    session.shareToken = shareToken;
    session.shareExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    console.log(`[Telemetry] Generated share token for session: ${sessionId}`);
    return shareToken;
  }

  // Basic PII redaction
  private redactPII(text: string): string {
    // Basic patterns for common PII
    return text
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE_REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
      .replace(/\b(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, 'my name is [NAME_REDACTED]');
  }

  // Generate shareable transcript (with PII redaction)
  generateShareableTranscript(sessionId: string, shareToken?: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    // Verify share token if provided
    if (shareToken) {
      if (!session.shareToken || session.shareToken !== shareToken) {
        return '';
      }
      if (session.shareExpiry && Date.now() > session.shareExpiry) {
        return '';
      }
    }

    const duration = session.endTime 
      ? Math.round((session.endTime - session.startTime) / 1000)
      : Math.round((Date.now() - session.startTime) / 1000);

    let transcript = `# AI Tutor Session Transcript\n\n`;
    transcript += `**Duration:** ${Math.floor(duration / 60)}m ${duration % 60}s\n`;
    transcript += `**Topics:** ${session.topics.join(', ') || 'General'}\n`;
    transcript += `**Interactions:** ${session.totalInteractions}\n\n`;
    transcript += `---\n\n`;

    session.transcript.forEach((entry, index) => {
      const timeFromStart = Math.round((entry.timestamp - session.startTime) / 1000);
      const speaker = entry.speaker === 'user' ? '**Student**' : '**Tutor**';
      const content = entry.speaker === 'user' ? this.redactPII(entry.content) : entry.content;
      transcript += `**[${Math.floor(timeFromStart / 60)}:${(timeFromStart % 60).toString().padStart(2, '0')}]** ${speaker}: ${content}\n\n`;
    });

    return transcript;
  }

  // Cleanup old sessions
  cleanup(): void {
    if (this.sessions.size <= this.MAX_SESSIONS) return;

    const sessions = Array.from(this.sessions.entries());
    sessions.sort(([,a], [,b]) => a.lastActivity - b.lastActivity);

    const toDelete = sessions.slice(0, sessions.length - this.MAX_SESSIONS);
    toDelete.forEach(([sessionId]) => {
      this.sessions.delete(sessionId);
    });

    console.log(`[Telemetry] Cleaned up ${toDelete.length} old sessions`);
  }

  // Get all session IDs for a user
  getUserSessions(userId: string): string[] {
    const userSessions: string[] = [];
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)!;
      if (session.userId === userId) {
        userSessions.push(sessionId);
      }
    }
    return userSessions;
  }
}

// Singleton instance
export const telemetryManager = new TelemetryManager();