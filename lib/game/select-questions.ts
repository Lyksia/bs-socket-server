import { prisma } from "@/lib/prisma";
import type { Question } from "@prisma/client";

export type QuestionDuration = 20 | 50 | 100;
export type QuestionDifficulty = 1 | 2 | 3 | "mixed";

interface SelectQuestionsParams {
  duration: QuestionDuration;
  difficulty?: QuestionDifficulty;
}

interface SelectedQuestion extends Omit<Question, "answers"> {
  answers: string[];
  originalCorrectIndex: number;
}

/**
 * Mélange un tableau (Fisher-Yates shuffle)
 */
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Mélange les réponses d'une question et met à jour l'index correct
 */
function shuffleAnswers(question: Question): SelectedQuestion {
  const answers = question.answers as string[];
  const originalCorrectIndex = question.correctIndex;

  // Créer un tableau d'indices [0, 1, 2, 3]
  const indices = answers.map((_, i) => i);

  // Mélanger les indices
  const shuffledIndices = shuffle(indices);

  // Réorganiser les réponses selon les indices mélangés
  const shuffledAnswers = shuffledIndices.map((i) => answers[i]);

  // Trouver le nouvel index de la réponse correcte
  const newCorrectIndex = shuffledIndices.indexOf(originalCorrectIndex);

  return {
    ...question,
    answers: shuffledAnswers,
    correctIndex: newCorrectIndex,
    originalCorrectIndex,
  };
}

/**
 * Sélectionne N questions aléatoires selon les critères
 */
export async function selectRandomQuestions({
  duration,
  difficulty = "mixed",
}: SelectQuestionsParams): Promise<SelectedQuestion[]> {
  let questions: Question[];

  if (difficulty === "mixed") {
    // Mix équilibré des 3 niveaux de difficulté
    const questionsPerDifficulty = Math.floor(duration / 3);
    const remainder = duration % 3;

    const [easy, medium, hard] = await Promise.all([
      prisma.question.findMany({
        where: { difficulty: 1 },
        take: questionsPerDifficulty + (remainder > 0 ? 1 : 0),
        orderBy: { id: "asc" }, // We'll shuffle later
      }),
      prisma.question.findMany({
        where: { difficulty: 2 },
        take: questionsPerDifficulty + (remainder > 1 ? 1 : 0),
        orderBy: { id: "asc" },
      }),
      prisma.question.findMany({
        where: { difficulty: 3 },
        take: questionsPerDifficulty,
        orderBy: { id: "asc" },
      }),
    ]);

    // Combiner et mélanger
    questions = shuffle([...easy, ...medium, ...hard]);
  } else {
    // Difficulté spécifique
    questions = await prisma.question.findMany({
      where: { difficulty },
      take: duration,
      orderBy: { id: "asc" },
    });

    // Mélanger l'ordre des questions
    questions = shuffle(questions);
  }

  // Limiter au nombre demandé
  questions = questions.slice(0, duration);

  // Mélanger les réponses de chaque question
  return questions.map(shuffleAnswers);
}

/**
 * Version optimisée avec ORDER BY RANDOM() (PostgreSQL)
 * Plus performante pour de grandes bases de données
 */
export async function selectRandomQuestionsOptimized({
  duration,
  difficulty = "mixed",
}: SelectQuestionsParams): Promise<SelectedQuestion[]> {
  let questions: Question[];

  if (difficulty === "mixed") {
    // Mix équilibré des 3 niveaux de difficulté
    const questionsPerDifficulty = Math.floor(duration / 3);
    const remainder = duration % 3;

    // Distribuer le reste : +1 pour easy si remainder >= 1, +1 pour medium si remainder >= 2
    const easyCount = questionsPerDifficulty + (remainder >= 1 ? 1 : 0);
    const mediumCount = questionsPerDifficulty + (remainder >= 2 ? 1 : 0);
    const hardCount = questionsPerDifficulty;

    console.log(
      `[SelectQuestions] Duration: ${duration} → Easy: ${easyCount}, Medium: ${mediumCount}, Hard: ${hardCount}, Total: ${easyCount + mediumCount + hardCount}`,
    );

    // Utiliser raw SQL pour ORDER BY RANDOM()
    const [easy, medium, hard] = await Promise.all([
      prisma.$queryRaw<Question[]>`
        SELECT * FROM "Question"
        WHERE difficulty = 1
        ORDER BY RANDOM()
        LIMIT ${easyCount}
      `,
      prisma.$queryRaw<Question[]>`
        SELECT * FROM "Question"
        WHERE difficulty = 2
        ORDER BY RANDOM()
        LIMIT ${mediumCount}
      `,
      prisma.$queryRaw<Question[]>`
        SELECT * FROM "Question"
        WHERE difficulty = 3
        ORDER BY RANDOM()
        LIMIT ${hardCount}
      `,
    ]);

    // Combiner et mélanger
    questions = shuffle([...easy, ...medium, ...hard]);
  } else {
    // Difficulté spécifique avec ORDER BY RANDOM()
    questions = await prisma.$queryRaw<Question[]>`
      SELECT * FROM "Question"
      WHERE difficulty = ${difficulty}
      ORDER BY RANDOM()
      LIMIT ${duration}
    `;
  }

  // Mélanger les réponses de chaque question
  return questions.map(shuffleAnswers);
}
