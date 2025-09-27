// Enhanced runtime sanitizer + topic guard with regex patterns
export const BANNED_PATTERNS = [
  'show me.*fingers',
  'hold up.*fingers', 
  'count.*your.*fingers',
  'how many fingers.*you have',
  'fingers on your hand',
  'use your hand',
  'with your hand',
  'raise your hand',
  'stand up',
  'sit down',
  'walk to',
  'run around',
  'jump up',
  'look at your',
  'touch your',
  'point to your',
  'clap your hands',
  'can you see',
  'can you hear',
  'can you feel'
];

const SAFE_REPLACEMENTS: Record<string,string> = {
  'your hand': 'a hand',
  'your fingers': 'fingers',
  'you have': 'there are',
  'can you': 'let\'s',
  'show me': 'think about',
  'count on your': 'count using',
  'how many fingers do you have': 'how many fingers are typically on a hand',
  'fingers on your hand': 'fingers on a hand',
  'raise your hand': 'what would you say',
  'stand up': 'imagine you stand',
  'jump up': 'count up',
  'walk to': 'think about going to',
  'run around': 'imagine moving around',
  'touch your': 'point to where a',
  'clap your hands': 'count the claps: clap, clap',
  'look at your': 'think about a',
  'point to': 'name'
};

export function sanitizeInclusive(text: string): string {
  let s = text ?? '';
  for (const [bad, good] of Object.entries(SAFE_REPLACEMENTS)) {
    s = s.replace(new RegExp(bad, 'gi'), good);
  }
  return s;
}

export function enforceTwoSentenceQuestion(text: string): string {
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  // Take only first 2 sentences
  let result = sentences.slice(0, 2).join(' ').trim();
  
  // Ensure ends with question - randomized endings
  if (!result.endsWith('?')) {
    const endings = [
      "What do you think?",
      "Can you try it?",
      "What's your answer?", 
      "Ready to solve this?",
      "How does that sound?",
      "Does that make sense?",
      "Ready to continue?"
    ];
    const ending = endings[Math.floor(Math.random() * endings.length)];
    result = result.replace(/[.!?]?\s*$/, '. ') + ending;
  }
  
  return result;
}

export function topicGuard(text: string, topic?: string): string {
  if (!topic) return text;
  const t = topic.toLowerCase();
  const hasTopic = text.toLowerCase().includes(t);
  return hasTopic ? text : `Let's focus on ${topic}. ${text}`;
}

export function antiRepeat(sessionId: string, text: string, store: Map<string,string[]>, subject?: string): string {
  const key = sessionId || 'default';
  const recent = store.get(key) ?? [];
  const normalized = text.toLowerCase().replace(/\s+/g,' ').trim();
  
  // Check for exact or near-exact repeats using similarity
  const isRepeat = recent.some(r => {
    const recentNorm = r.toLowerCase().replace(/\s+/g,' ').trim();
    if (recentNorm === normalized) return true;
    const similarity = getSimilarity(recentNorm, normalized);
    return similarity > 0.85;
  });
  
  if (isRepeat) {
    // Subject-specific alternatives to prevent mixing subjects
    const subjectAlternatives: Record<string, string[]> = {
      math: [
        "Let me try explaining differently. What's 2 plus 1?",
        "Here's another approach. If you have 2 apples and get 1 more, how many total?",
        "Let's use a different example. Count: 1, 2, and then?",
        "Try breaking it down. Start at 2 and add 1, what do you get?"
      ],
      english: [
        "Let me try a different question. Can you name a word that describes something?",
        "Here's another approach. What's your favorite action word?",
        "Let's think differently. Can you give me a word that names a person?",
        "Try this instead. What word describes how something looks?"
      ],
      spanish: [
        "Intentemos algo diferente. ¿Cómo se dice 'hello' en español?",
        "Otra pregunta. ¿Puedes contar hasta tres en español?",
        "Vamos a cambiar. ¿Qué significa 'gracias'?",
        "Probemos esto. ¿Cómo se dice 'good' en español?"
      ],
      general: [
        "Here's another way to think about it. What pattern do you notice?",
        "Let me give you a hint. Try breaking it into smaller parts.",
        "Good effort! Consider this approach instead. What's the first step?",
        "Let's try a different angle. What do you think happens next?"
      ]
    };
    
    const currentSubject = subject?.toLowerCase() || 'general';
    const alternatives = subjectAlternatives[currentSubject] || subjectAlternatives.general;
    const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
    
    if (process.env.TUTOR_DEBUG_CORRECTIONS === 'true') {
      console.log(`[AntiRepeat] Replaced repetitive response for ${currentSubject} with:`, alt);
    }
    
    return alt;
  }
  
  // Store this response
  recent.push(text);
  if (recent.length > 3) recent.shift();
  store.set(key, recent);
  
  return text;
}

function getSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  
  // Convert sets to arrays for intersection calculation
  const arrA = Array.from(wordsA);
  const arrB = Array.from(wordsB);
  
  const intersection = arrA.filter(x => wordsB.has(x));
  const unionSize = new Set(arrA.concat(arrB)).size;
  
  return unionSize > 0 ? intersection.length / unionSize : 0;
}

export function hardBlockIfBanned(text: string): string {
  const lower = text.toLowerCase();
  
  for (const bannedPattern of BANNED_PATTERNS) {
    if (new RegExp(bannedPattern, 'i').test(lower)) {
      if (process.env.TUTOR_DEBUG_CORRECTIONS === 'true') {
        console.warn('[PhraseGuard] Blocked banned phrase pattern:', bannedPattern);
      }
      
      // Randomized fallbacks to prevent repetition
      const safeAlternatives = [
        "Let's count together using numbers. What number comes after 2?",
        "Let's practice with numbers. Can you tell me what 1 plus 2 equals?",
        "Here's a counting question. What comes after the number 2?", 
        "Let's work with numbers. If we start at 1 and count up, what's next after 2?",
        "Time for some number practice. What number follows 2 when counting?"
      ];
      
      return safeAlternatives[Math.floor(Math.random() * safeAlternatives.length)];
    }
  }
  
  return text;
}