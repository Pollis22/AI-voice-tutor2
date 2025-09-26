import { LessonContext } from '../types/lessonContext';
import * as fs from 'fs';
import * as path from 'path';

// Mapping of short lesson IDs to actual file names
const LESSON_ID_MAPPING: Record<string, string> = {
  // Math lessons
  'math-1': 'math-numbers-counting',
  'math-2': 'math-basic-addition',
  'math-3': 'math-basic-subtraction',
  
  // English lessons
  'english-1': 'english-parts-of-speech',
  'english-2': 'english-sentence-structure',
  'english-3': 'english-reading-comprehension',
  
  // Spanish lessons
  'spanish-1': 'spanish-greetings',
  'spanish-2': 'spanish-numbers',
  'spanish-3': 'spanish-colors',
};

export class LessonService {
  private lessonCache: Map<string, LessonContext> = new Map();
  
  // Load lesson context from JSON files
  async getLessonContext(lessonId: string): Promise<LessonContext | null> {
    // Check cache first
    if (this.lessonCache.has(lessonId)) {
      return this.lessonCache.get(lessonId)!;
    }
    
    try {
      // Map lesson ID to actual filename
      const filename = LESSON_ID_MAPPING[lessonId] || lessonId;
      
      // Try to load from content/lessons directory
      const lessonPath = path.join(process.cwd(), 'content', 'lessons', `${filename}.json`);
      
      if (!fs.existsSync(lessonPath)) {
        console.warn(`[LessonService] Lesson file not found: ${lessonPath}`);
        
        // Try direct lessonId if mapping didn't work
        const fallbackPath = path.join(process.cwd(), 'content', 'lessons', `${lessonId}.json`);
        if (fs.existsSync(fallbackPath)) {
          const content = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
          const subject = this.extractSubject(lessonId);
          const context = this.mapToLessonContext(lessonId, subject, content);
          this.lessonCache.set(lessonId, context);
          return context;
        }
        
        console.warn(`[LessonService] Could not find lesson file for ID: ${lessonId}`);
        return null;
      }
      
      const content = JSON.parse(fs.readFileSync(lessonPath, 'utf-8'));
      const subject = this.extractSubject(lessonId);
      const context = this.mapToLessonContext(lessonId, subject, content);
      
      // Cache the result
      this.lessonCache.set(lessonId, context);
      
      console.log(`[LessonService] Loaded lesson context for ${lessonId}: ${context.title}`);
      return context;
    } catch (error) {
      console.error(`[LessonService] Error loading lesson ${lessonId}:`, error);
      return null;
    }
  }
  
  private extractSubject(lessonId: string): string {
    // Extract subject from lesson ID pattern (e.g., 'math-1', 'english-grammar-1')
    if (lessonId.startsWith('math')) return 'math';
    if (lessonId.includes('grammar')) return 'grammar';
    if (lessonId.includes('reading')) return 'reading';
    if (lessonId.startsWith('english')) return 'english';
    if (lessonId.startsWith('spanish')) return 'spanish';
    return 'general';
  }
  
  private mapToLessonContext(lessonId: string, subject: string, content: any): LessonContext {
    return {
      lessonId,
      subject,
      title: content.title || 'Lesson',
      objectives: content.objectives || content.learningObjectives || [],
      keyTerms: this.extractKeyTerms(content),
      stepsOutline: this.extractSteps(content),
      difficulty: content.difficulty || 'beginner'
    };
  }
  
  private extractKeyTerms(content: any): string[] {
    const terms: string[] = [];
    
    // Extract from various possible locations
    if (content.keyTerms) terms.push(...content.keyTerms);
    if (content.vocabulary) terms.push(...Object.keys(content.vocabulary));
    if (content.concepts) {
      content.concepts.forEach((concept: any) => {
        if (concept.term) terms.push(concept.term);
        if (concept.name) terms.push(concept.name);
      });
    }
    
    return terms;
  }
  
  private extractSteps(content: any): string[] {
    const steps: string[] = [];
    
    if (content.steps) {
      content.steps.forEach((step: any) => {
        if (typeof step === 'string') {
          steps.push(step);
        } else if (step.title) {
          steps.push(step.title);
        }
      });
    }
    
    if (content.sections) {
      content.sections.forEach((section: any) => {
        if (section.title) steps.push(section.title);
      });
    }
    
    return steps;
  }
  
  // Clear cache when switching lessons
  clearCache(): void {
    this.lessonCache.clear();
    console.log('[LessonService] Cache cleared');
  }
}

export const lessonService = new LessonService();