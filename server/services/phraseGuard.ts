// Minimal runtime sanitizer + topic guard (no external deps)
export const BANNED_SNIPPETS = [
  'show me three fingers',
  'how many fingers do you have',
  'fingers on your hand',
  'raise your hand',
  'stand up',
  'jump up',
  'walk to',
  'run around',
  'touch your',
  'clap your hands',
  'look at your'
];

const SAFE_REPLACEMENTS: Record<string,string> = {
  'how many fingers do you have': 'how many fingers are typically on a hand',
  'fingers on your hand': 'fingers on a hand',
  'raise your hand': 'what would you say',
  'stand up': 'imagine you stand',
  'jump up': 'count up',
  'walk to': 'think about going to',
  'run around': 'imagine moving around',
  'touch your': 'point to where a',
  'clap your hands': 'count the claps: clap, clap',
  'look at your': 'think about a'
};

export function sanitizeInclusive(text: string): string {
  let s = text ?? '';
  for (const [bad, good] of Object.entries(SAFE_REPLACEMENTS)) {
    s = s.replace(new RegExp(bad, 'gi'), good);
  }
  return s;
}

export function enforceTwoSentenceQuestion(text: string): string {
  const parts = (text.match(/[^.!?]+[.!?]+/g) ?? [text]).slice(0,2);
  let out = parts.join(' ').trim();
  if (!/\?$/.test(out)) out = out.replace(/[.!?]+$/, '').trim() + '. What do you think?';
  return out;
}

export function topicGuard(text: string, topic?: string): string {
  if (!topic) return text;
  const t = topic.toLowerCase();
  const hasTopic = text.toLowerCase().includes(t);
  return hasTopic ? text : `Let's focus on ${topic}. ${text}`;
}

export function antiRepeat(sessionId: string, text: string, store: Map<string,string[]>): string {
  const key = sessionId || 'default';
  const recent = store.get(key) ?? [];
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g,' ').trim();
  const dup = recent.some(r => norm(r) === norm(text));
  if (dup) text = "Here's another way to think about it. What pattern do you notice?";
  recent.push(text);
  if (recent.length > 3) recent.shift();
  store.set(key, recent);
  return text;
}

export function hardBlockIfBanned(text: string): string {
  const bad = BANNED_SNIPPETS.find(b => text.toLowerCase().includes(b));
  return bad ? "Let's count together using numbers. What number comes after 2?" : text;
}