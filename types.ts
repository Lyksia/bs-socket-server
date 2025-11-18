import type {
  Session,
  Player,
  Question,
  SessionQuestion,
  Answer,
  SessionType,
  SessionStatus,
  PlayerStatus,
  QuestionType,
  Difficulty,
} from "@prisma/client";

// ===========================
// TYPES DE BASE
// ===========================

export type {
  Session,
  Player,
  Question,
  SessionQuestion,
  Answer,
  SessionType,
  SessionStatus,
  PlayerStatus,
  QuestionType,
  Difficulty,
};

// ===========================
// TYPES COMPOSÉS
// ===========================

export type SessionWithPlayers = Session & {
  players: Player[];
};

export type SessionWithQuestionsAndPlayers = Session & {
  players: Player[];
  questions: (SessionQuestion & {
    question: Question;
  })[];
};

export type PlayerWithAnswers = Player & {
  answers: Answer[];
};

export type SessionQuestionWithDetails = SessionQuestion & {
  question: Question;
  answers: (Answer & {
    player: Player;
  })[];
};

// ===========================
// TYPES CLIENT (sans données sensibles)
// ===========================

export type PublicSession = Pick<
  Session,
  | "id"
  | "code"
  | "type"
  | "duration"
  | "difficulty"
  | "status"
  | "currentQuestion"
  | "creatorId"
  | "hostDeviceId"
> & {
  createdAt: string;
  players?: PublicPlayer[];
};

export type PublicPlayer = Pick<
  Player,
  "id" | "nickname" | "avatar" | "isReady" | "status" | "score"
> & {
  joinedAt: string;
  isCreator?: boolean; // Calculé: player.id === session.creatorId
};

export type PublicQuestion = Omit<Question, "correctIndex">;

// ===========================
// DONNÉES DE JEU
// ===========================

export interface GameState {
  session: PublicSession;
  players: PublicPlayer[];
  currentQuestion: PublicQuestion | null;
  questionNumber: number;
  totalQuestions: number;
  phase: GamePhase;
  timer: number;
}

export type GamePhase =
  | "waiting" // En attente de joueurs
  | "ready_check" // Vérification des ready-ups
  | "countdown" // Compte à rebours 3-2-1
  | "question" // Affichage de la question
  | "answers" // Joueurs répondent
  | "results" // Affichage des résultats
  | "leaderboard" // Classement intermédiaire
  | "final" // Classement final
  | "finished"; // Partie terminée

// ===========================
// EVENTS WEBSOCKET
// ===========================

export interface ServerToClientEvents {
  "session:updated": (data: { session: PublicSession }) => void;
  "player:joined": (data: PublicPlayer) => void;
  "player:left": (data: { playerId: string }) => void;
  "player:ready-changed": (data: {
    playerId: string;
    isReady: boolean;
  }) => void;
  "game:started": (data: GameState) => void;
  "game:phase-changed": (data: { phase: GamePhase; timer: number }) => void;
  "game:question": (data: {
    question: PublicQuestion;
    questionNumber: number;
  }) => void;
  "game:answer-recorded": (data: { playerId: string }) => void;
  "game:results": (data: {
    correctIndex: number;
    playerAnswers: Array<{
      playerId: string;
      answerIndex: number;
      isCorrect: boolean;
      points: number;
      responseTime: number;
    }>;
  }) => void;
  "game:leaderboard": (data: {
    players: Array<{
      playerId: string;
      nickname: string;
      avatar: string;
      score: number;
      rank: number;
    }>;
  }) => void;
  "game:finished": (data: { finalLeaderboard: PublicPlayer[] }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  "host:join-room": (data: { sessionId: string }) => void;
  "host:leave-room": (data: { sessionId: string }) => void;
  "player:join-room": (data: { sessionId: string; playerId?: string }) => void;
  "player:leave-room": (data: { sessionId: string }) => void;
  "player:join": (data: {
    sessionCode: string;
    nickname: string;
    avatar: string;
  }) => void;
  "player:ready": (data: { playerId: string; isReady?: boolean }) => void;
  "player:answer": (data: {
    playerId: string;
    answerIndex: number;
    responseTime: number;
  }) => void;
  "host:start-game": (data: { sessionId: string }) => void;
  "host:next-question": (data: { sessionId: string }) => void;
  "host:kick-player": (data: { sessionId: string; playerId: string }) => void;
}

// Type combiné pour Socket.io
export interface WebSocketEvents
  extends ServerToClientEvents,
    ClientToServerEvents {}

// ===========================
// CRÉATION DE SESSION
// ===========================

export interface CreateSessionDTO {
  type: SessionType;
  duration: 20 | 50 | 100;
  difficulty: Difficulty;
  host: {
    // Pour Mode SHARED
    deviceId?: string;
    // Pour Mode ONLINE
    nickname?: string;
    avatar?: string;
  };
}

export interface JoinSessionDTO {
  code: string;
  nickname: string;
  avatar: string;
}

// ===========================
// SCORING
// ===========================

export interface ScoreCalculation {
  rank: number;
  points: number;
}

export const SCORE_POINTS: Record<number, number> = {
  1: 10, // 1ère place
  2: 8, // 2e place
  3: 5, // 3e place
};

export const DEFAULT_POINTS = 1; // 4e+ place
