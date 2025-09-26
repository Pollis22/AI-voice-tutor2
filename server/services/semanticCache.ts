import crypto from 'crypto';
import { LRUCache } from 'lru-cache';

interface CacheEntry {
  content: string;
  lessonId: string;
  subject: string;
  timestamp: number;
  hits: number;
  embedding?: number[]; // Store for similarity checks
  citations?: string[]; // Citations for cached responses
}

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  memoryUsage: number;
}

export class SemanticCache {
  private cache: LRUCache<string, CacheEntry>;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    memoryUsage: 0
  };

  constructor() {
    const maxSize = parseInt(process.env.SEMANTIC_CACHE_SIZE || '10000');
    const ttlMinutes = parseInt(process.env.CACHE_TTL_MIN || '1440'); // 24 hours default
    
    this.cache = new LRUCache<string, CacheEntry>({
      max: maxSize,
      ttl: ttlMinutes * 60 * 1000, // Convert to milliseconds
      updateAgeOnGet: true,
      allowStale: false,
      dispose: (value: CacheEntry, key: string) => {
        console.log(`[SemanticCache] Evicted entry for key: ${key.substring(0, 50)}...`);
      }
    });

    console.log(`[SemanticCache] Initialized with max size: ${maxSize}, TTL: ${ttlMinutes}min (${process.env.CACHE_TTL_MIN || '1440'} from env)`);
  }

  // Generate cache key with exact format: ${lessonId}:${hash(embedding(normalizedQuestion))}
  private generateCacheKey(lessonId: string, question: string): string {
    const normalizedQuestion = this.normalizeQuestion(question);
    
    // For now, use hash of normalized question as proxy for embedding hash
    // In production, this would use actual embeddings from OpenAI or similar
    const questionHash = crypto.createHash('sha256')
      .update(normalizedQuestion)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for brevity
    
    return `${lessonId}:${questionHash}`;
  }

  // Normalize question for better cache hits
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      // Remove punctuation except question marks
      .replace(/[^\w\s?]/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove common filler words that don't affect meaning
      .replace(/\b(um|uh|like|you know|i mean|well|so|okay|alright)\b/gi, '')
      .trim();
  }

  // Check for semantic similarity (simple keyword-based for now)
  private calculateSimilarity(question1: string, question2: string): number {
    const words1 = new Set(question1.toLowerCase().split(/\s+/));
    const words2 = new Set(question2.toLowerCase().split(/\s+/));
    
    const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  // Get cached response
  get(lessonId: string, question: string): CacheEntry | null {
    const primaryKey = this.generateCacheKey(lessonId, question);
    let entry = this.cache.get(primaryKey);
    
    if (entry) {
      entry.hits++;
      this.metrics.hits++;
      this.updateMetrics();
      console.log(`[SemanticCache] Cache HIT for lesson: ${lessonId}, question: "${question.substring(0, 50)}...", citations: ${entry.citations?.length || 0}`);
      return entry;
    }

    // Try semantic similarity search (expensive, only for small caches)
    if (this.cache.size < 1000) {
      const normalizedQuestion = this.normalizeQuestion(question);
      
      this.cache.forEach((cachedEntry, key) => {
        if (cachedEntry.lessonId === lessonId) {
          // Extract original question from cache entry metadata if available
          const similarity = this.calculateSimilarity(normalizedQuestion, key.split(':')[1] || '');
          
          if (similarity > 0.7) { // 70% similarity threshold
            cachedEntry.hits++;
            this.metrics.hits++;
            this.updateMetrics();
            console.log(`[SemanticCache] Semantic HIT (${(similarity * 100).toFixed(1)}% similar) for lesson: ${lessonId}`);
            entry = cachedEntry;
            return;
          }
        }
      });
      
      if (entry) {
        return entry;
      }
    }

    this.metrics.misses++;
    this.updateMetrics();
    console.log(`[SemanticCache] Cache MISS for lesson: ${lessonId}, question: "${question.substring(0, 50)}..."`);
    return null;
  }

  // Store response in cache with citations
  set(lessonId: string, question: string, content: string, subject: string): void {
    const key = this.generateCacheKey(lessonId, question);
    const citations = this.generateCitations(lessonId, subject);
    
    const entry: CacheEntry = {
      content,
      lessonId,
      subject,
      timestamp: Date.now(),
      hits: 0,
      citations
    };

    this.cache.set(key, entry);
    this.updateMetrics();
    
    console.log(`[SemanticCache] Cached response for lesson: ${lessonId}, question: "${question.substring(0, 50)}...", citations: ${citations.length}`);
  }

  // Generate citations for cached responses
  private generateCitations(lessonId: string, subject?: string): string[] {
    const citations: string[] = [];
    
    // Add lesson-specific citation
    if (lessonId && lessonId !== 'general') {
      citations.push(`Lesson: ${lessonId}`);
    }
    
    // Add subject-area citation
    if (subject && subject !== 'general') {
      citations.push(`Subject: ${subject.charAt(0).toUpperCase() + subject.slice(1)}`);
    }
    
    // Add cache timestamp for reproducibility
    citations.push(`Cached: ${new Date().toISOString()}`);
    
    return citations;
  }

  // Update metrics
  private updateMetrics(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    this.metrics.totalEntries = this.cache.size;
    
    // Rough memory usage estimation (in KB)
    this.metrics.memoryUsage = this.cache.size * 0.5; // ~500 bytes per entry average
  }

  // Get performance metrics
  getMetrics(): CacheMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  // Clear cache
  clear(): void {
    this.cache.clear();
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalEntries: 0,
      memoryUsage: 0
    };
    console.log('[SemanticCache] Cache cleared');
  }

  // Get cache status
  getStatus() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      metrics: this.getMetrics(),
      enabled: true
    };
  }

  // Warm up cache with common lesson patterns
  warmUp(lessonId: string, commonQuestions: Array<{ question: string; response: string; subject: string }>): void {
    for (const { question, response, subject } of commonQuestions) {
      this.set(lessonId, question, response, subject);
    }
    console.log(`[SemanticCache] Warmed up with ${commonQuestions.length} entries for lesson: ${lessonId}`);
  }
}

// Global semantic cache instance
export const semanticCache = new SemanticCache();