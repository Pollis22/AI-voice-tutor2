import { db } from "./db";
import { subjects, lessons } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";

async function seedDatabase() {
  console.log("Starting database seeding...");

  try {
    // Check if subjects already exist
    const existingSubjects = await db.select().from(subjects);
    if (existingSubjects.length === 0) {
      console.log("Inserting subjects...");
      await db.insert(subjects).values([
        {
          id: 'math',
          name: 'Mathematics',
          description: 'Learn fundamental math concepts including numbers, counting, and basic operations',
          iconColor: 'blue',
          isActive: true
        },
        {
          id: 'english',
          name: 'English',
          description: 'Master the building blocks of the English language through parts of speech and grammar',
          iconColor: 'green',
          isActive: true
        },
        {
          id: 'spanish',
          name: 'Spanish',
          description: 'Begin your Spanish journey with essential greetings and basic conversational phrases',
          iconColor: 'orange',
          isActive: true
        }
      ]);
      console.log("Subjects inserted successfully");
    } else {
      console.log("Subjects already exist, skipping...");
    }

    // Check if lessons already exist
    const existingLessons = await db.select().from(lessons);
    if (existingLessons.length === 0) {
      console.log("Loading and inserting lessons...");
      
      // Load lesson content from JSON files
      const lessonFiles = [
        { id: 'math-numbers-counting', subjectId: 'math', file: 'math-numbers-counting.json', orderIndex: 1 },
        { id: 'english-parts-of-speech', subjectId: 'english', file: 'english-parts-of-speech.json', orderIndex: 1 },
        { id: 'spanish-greetings', subjectId: 'spanish', file: 'spanish-greetings.json', orderIndex: 1 }
      ];

      for (const lessonInfo of lessonFiles) {
        const contentPath = path.join(process.cwd(), 'content', 'lessons', lessonInfo.file);
        const contentStr = await fs.readFile(contentPath, 'utf-8');
        const content = JSON.parse(contentStr);

        await db.insert(lessons).values({
          id: lessonInfo.id,
          subjectId: lessonInfo.subjectId,
          title: content.title,
          description: content.description,
          content: content,
          orderIndex: lessonInfo.orderIndex,
          estimatedMinutes: 15,
          isActive: true
        });
        
        console.log(`Inserted lesson: ${content.title}`);
      }
      
      console.log("Lessons inserted successfully");
    } else {
      console.log("Lessons already exist, skipping...");
    }

    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

// Run the seeding function
seedDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

export { seedDatabase };