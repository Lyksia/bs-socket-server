import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import type { ClientToServerEvents, ServerToClientEvents } from "../types";
import { PlayerStatus } from "@prisma/client";
import {
  GameSessionManager,
  type GameSessionConfig,
  PHASE_DURATIONS,
} from "../lib/game";

/**
 * Map des sessions de jeu actives
 * sessionId => GameSessionManager
 */
const activeSessions = new Map<string, GameSessionManager>();

/**
 * Gestionnaire d'événements Socket.io pour le jeu
 */
export function registerGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  /**
   * Démarrage de la partie - Crée le GameSessionManager
   */
  socket.on("host:start-game", async (data) => {
    try {
      const { sessionId } = data;

      // Récupérer la session avec les joueurs et les questions
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          players: true,
          questions: {
            include: { question: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      if (!session) {
        socket.emit("error", { message: "Session introuvable" });
        return;
      }

      // Vérifier que tous les joueurs sont prêts
      const allReady = session.players.every(
        (p) => p.isReady || p.id === session.creatorId,
      );
      if (!allReady) {
        socket.emit("error", {
          message: "Tous les joueurs doivent être prêts",
        });
        return;
      }

      // Créer la configuration de la session de jeu
      const questions = session.questions.map((sq) => sq.question);

      console.log(
        `[Game] Questions chargées: ${questions.length} / Durée demandée: ${session.duration}`,
      );

      const difficultyMap: Record<"EASY" | "MEDIUM" | "HARD", 1 | 2 | 3> = {
        EASY: 1,
        MEDIUM: 2,
        HARD: 3,
      };
      const config: GameSessionConfig = {
        sessionId: session.id,
        duration: session.duration as 20 | 50 | 100,
        difficulty: difficultyMap[session.difficulty] as 1 | 2 | 3,
        questions,
      };

      // Créer le gestionnaire de session
      const gameSession = new GameSessionManager(config);

      // Ajouter les joueurs
      session.players.forEach((player) => {
        gameSession.addPlayer(player.id, player.nickname, player.avatar);
      });

      // Stocker la session active
      activeSessions.set(sessionId, gameSession);

      // Mettre à jour le statut en DB
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "ACTIVE" },
      });

      // Démarrer le countdown
      gameSession.startGame();

      // Notifier tous les joueurs que le jeu démarre (pour redirection)
      const initialState = gameSession.getState();
      const phaseMap: Record<string, string> = {
        answer: "answers",
        display: "question",
        buffer: "question",
      };
      io.to(sessionId).emit("game:started", {
        session: { id: sessionId, status: "ACTIVE" },
        players: [],
        phase: phaseMap[initialState.phase] || initialState.phase,
        questionNumber: initialState.currentQuestionIndex + 1,
        totalQuestions: initialState.totalQuestions,
        timer: 0,
      } as any);

      // Notifier tous les joueurs - Phase countdown
      const state = gameSession.getState();
      io.to(sessionId).emit("game:phase-changed", {
        phase: "countdown",
        timer: PHASE_DURATIONS.COUNTDOWN / 1000,
      });

      // Après 3 secondes, démarrer la première question
      setTimeout(() => {
        startNextQuestion(io, sessionId, gameSession);
      }, PHASE_DURATIONS.COUNTDOWN);
    } catch (error) {
      console.error("[Game] Erreur host:start-game:", error);
      socket.emit("error", {
        message: "Erreur lors du démarrage de la partie",
      });
    }
  });

  /**
   * Réponse d'un joueur
   */
  socket.on("player:answer", async (data) => {
    try {
      const { playerId, answerIndex, responseTime } = data;

      // Trouver la session du joueur
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: { session: true },
      });

      if (!player) {
        socket.emit("error", { message: "Joueur introuvable" });
        return;
      }

      const sessionId = player.session.id;
      const gameSession = activeSessions.get(sessionId);

      if (!gameSession) {
        socket.emit("error", { message: "Session de jeu introuvable" });
        return;
      }

      // Enregistrer la réponse avec le timestamp serveur
      const serverTimestamp = Date.now();

      const success = gameSession.submitAnswer(
        playerId,
        answerIndex,
        serverTimestamp,
      );

      if (!success) {
        socket.emit("error", { message: "Réponse non acceptée" });
        return;
      }

      // Notifier tous les joueurs qu'une réponse a été enregistrée
      io.to(sessionId).emit("game:answer-recorded", { playerId });

      // Si tous les joueurs ont répondu, passer aux résultats immédiatement
      // (géré automatiquement par GameSessionManager)
    } catch (error) {
      console.error("[Game] Erreur player:answer:", error);
      socket.emit("error", {
        message: "Erreur lors de l'enregistrement de la réponse",
      });
    }
  });

  /**
   * Passer à la question suivante (automatique via GameSessionManager)
   */
  socket.on("host:next-question", async (data) => {
    try {
      const { sessionId } = data;
      const gameSession = activeSessions.get(sessionId);

      if (!gameSession) {
        socket.emit("error", { message: "Session de jeu introuvable" });
        return;
      }

      startNextQuestion(io, sessionId, gameSession);
    } catch (error) {
      console.error("[Game] Erreur host:next-question:", error);
      socket.emit("error", {
        message: "Erreur lors du passage à la question suivante",
      });
    }
  });
}

/**
 * Démarre la question suivante
 */
async function startNextQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  sessionId: string,
  gameSession: GameSessionManager,
) {
  try {
    // Passer à la question suivante
    gameSession.nextQuestion();

    const state = gameSession.getState();

    // Si la partie est terminée
    if (state.phase === "final") {
      await endGame(io, sessionId, gameSession);
      return;
    }

    const currentQuestion = state.currentQuestion;
    if (!currentQuestion) return;

    // Phase 1: Display (1s) - Afficher la question
    const questionData = {
      id: currentQuestion.id,
      type: currentQuestion.type,
      country: currentQuestion.country,
      questionText: currentQuestion.questionText,
      answers: currentQuestion.answers,
      imageUrl: currentQuestion.imageUrl,
      difficulty: currentQuestion.difficulty,
      tags: currentQuestion.tags,
      createdAt: currentQuestion.createdAt,
    };

    io.to(sessionId).emit("game:question", {
      question: questionData,
      questionNumber: state.currentQuestionIndex + 1,
    });

    io.to(sessionId).emit("game:phase-changed", {
      phase: "question",
      timer: PHASE_DURATIONS.DISPLAY / 1000,
    });

    // Après Display (1s) + Buffer (500ms), envoyer le signal GO
    setTimeout(() => {
      io.to(sessionId).emit("game:phase-changed", {
        phase: "answers",
        timer: PHASE_DURATIONS.ANSWER / 1000,
      });

      // Après Answer (15s), afficher les résultats
      setTimeout(async () => {
        await showResults(io, sessionId, gameSession);
      }, PHASE_DURATIONS.ANSWER);
    }, PHASE_DURATIONS.DISPLAY + PHASE_DURATIONS.BUFFER);
  } catch (error) {
    console.error("[Game] Erreur startNextQuestion:", error);
  }
}

/**
 * Affiche les résultats de la question
 */
async function showResults(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  sessionId: string,
  gameSession: GameSessionManager,
) {
  try {
    const state = gameSession.getState();
    const results = gameSession.getCurrentResults();
    const correctIndex = gameSession.getLastCorrectIndex();
    const currentQuestion = state.currentQuestion;

    if (!currentQuestion) return;

    // Enrichir les résultats avec les infos des joueurs
    const enrichedResults = results.map((r) => {
      const playerStats = state.playerStats.get(r.playerId);
      return {
        playerId: r.playerId,
        nickname: playerStats?.nickname || "",
        avatar: playerStats?.avatar || "",
        answerIndex: r.answerIndex,
        isCorrect: r.isCorrect,
        points: r.points,
        responseTime: r.responseTime,
        totalScore: playerStats?.score || 0, // Score total après cette question
      };
    });

    // Préparer les données à envoyer (utiliser le correctIndex caché)
    const resultsData = {
      correctIndex: correctIndex,
      playerAnswers: enrichedResults,
    };

    console.log("[Game] Envoi game:results - correctIndex:", correctIndex);

    // Émettre les résultats
    io.to(sessionId).emit("game:results", resultsData);

    io.to(sessionId).emit("game:phase-changed", {
      phase: "results",
      timer: PHASE_DURATIONS.RESULTS / 1000,
    });

    // Sauvegarder les réponses en DB
    await saveAnswersToDatabase(sessionId, results, currentQuestion.id);

    // Mettre à jour les scores des joueurs en DB
    await updatePlayerScores(sessionId, gameSession);

    // Après Results (3s), passer à la question suivante
    setTimeout(() => {
      startNextQuestion(io, sessionId, gameSession);
    }, PHASE_DURATIONS.RESULTS);
  } catch (error) {
    console.error("[Game] Erreur showResults:", error);
  }
}

/**
 * Termine la partie et affiche le classement final
 */
async function endGame(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  sessionId: string,
  gameSession: GameSessionManager,
) {
  try {
    const finalStats = gameSession.getFinalStats();

    // Mettre à jour le statut en DB
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "FINISHED" },
    });

    // Émettre le classement final
    io.to(sessionId).emit("game:finished", {
      finalLeaderboard: finalStats.map((stat) => ({
        id: stat.playerId,
        nickname: stat.nickname,
        avatar: stat.avatar,
        isCreator: false,
        isReady: false,
        status: PlayerStatus.ACTIVE,
        score: stat.score,
        joinedAt: new Date().toISOString(),
      })),
    });

    // Nettoyer la session active
    activeSessions.delete(sessionId);
    gameSession.destroy();
  } catch (error) {
    console.error("[Game] Erreur endGame:", error);
  }
}

/**
 * Sauvegarde les réponses en base de données
 */
async function saveAnswersToDatabase(
  sessionId: string,
  results: any[],
  questionId: string,
) {
  try {
    // TODO: Implémenter la sauvegarde des réponses
  } catch (error) {
    console.error("[Game] Erreur saveAnswersToDatabase:", error);
  }
}

/**
 * Met à jour les scores des joueurs en base de données
 */
async function updatePlayerScores(
  sessionId: string,
  gameSession: GameSessionManager,
) {
  try {
    const state = gameSession.getState();

    // Mettre à jour chaque joueur
    for (const [playerId, stats] of state.playerStats.entries()) {
      await prisma.player.update({
        where: { id: playerId },
        data: {
          score: stats.score,
        },
      });
    }
  } catch (error) {
    console.error("[Game] Erreur updatePlayerScores:", error);
  }
}
