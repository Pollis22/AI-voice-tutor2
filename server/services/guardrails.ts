import { hardBlockIfBanned, sanitizeInclusive, enforceTwoSentenceQuestion, topicGuard, antiRepeat } from './phraseGuard';

export class TutorGuardrails {
  private recentResponses: Map<string, string[]> = new Map();
  private readonly maxRecent = 3;

  sanitizeTutorQuestion(text: string): string {
    // P0 HOTFIX: Hard block any banned phrases first
    let s = hardBlockIfBanned(text);
    
    // Apply inclusive sanitization
    s = sanitizeInclusive(s);
    
    // Generic physical-command softening (assumptions → imagination)
    const verbs = ['stand','walk','run','jump','see','hear','touch','hold','grab','reach','climb','skip','hop'];
    verbs.forEach(v => {
      s = s.replace(new RegExp(`\\b(you ${v}|${v} up|${v} down|${v} around)\\b`, 'gi'), `imagine you ${v}`);
    });

    // Normalize capitalization
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  avoidRepeat(sessionId: string, candidate: string, subject?: string): string {
    // P0 HOTFIX: Use new optimized anti-repeat system with subject context
    return antiRepeat(sessionId, candidate, this.recentResponses, subject);
  }

  enforceFormat(text: string): string {
    // P0 HOTFIX: Use optimized two-sentence question enforcer
    return enforceTwoSentenceQuestion(text);
  }

  preventUserFabrication(messages: Array<{role:string; content:string}>): Array<{role:string; content:string}> {
    const forbidden = ['you said:', 'you mentioned:', 'you told me:', 'you asked:', 'you answered:', 'your answer was:', 'you responded:'];
    return messages.filter(m => m.role !== 'assistant' || !forbidden.some(f => m.content.toLowerCase().includes(f)));
  }

  // --- helpers ---
  private similarity(a: string, b: string): number {
    const A = a.toLowerCase().split(/\s+/);
    const B = b.toLowerCase().split(/\s+/);
    const setA = new Set(A);
    const setB = new Set(B);
    const inter = A.filter(x=>setB.has(x)).length;
    const union = new Set(A.concat(B)).size;
    return union ? inter/union : 0;
  }
  
  private getStepHint(sessionId: string): string {
    const hints = [
      'Here\'s another way to think about it. What patterns do you notice?',
      'Let me give you a hint. Try breaking it into smaller parts.',
      'Good effort! Consider this approach instead. What\'s the first step?',
      'Think about what we just learned. How does it apply here?',
      'Let\'s look at this differently. What information do we have?',
      'Remember our previous example. What was similar about it?',
      'Take your time with this one. What are we trying to find?',
      'You\'re on the right track. What comes next?',
      'Let\'s review the concept. What\'s the key idea?'
    ];
    return hints[(sessionId.charCodeAt(0)+Date.now())%hints.length];
  }
}

export const guardrails = new TutorGuardrails();