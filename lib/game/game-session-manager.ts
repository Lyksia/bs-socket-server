/**
 * GameSessionManager - Orchestrateur principal de la logique de jeu
 *
 * Gère :
 * - Les phases de jeu (countdown, display, buffer, answer, results)
 * - Les réponses des joueurs
 * - Le calcul des scores
 * - Les transitions entre questions
 */

import type { Question } from "@prisma/client";
import {
  GameTimer,
  GamePhaseManager,
  PHASE_DURATIONS,
  type GamePhaseState,
} from "./game-timer";
import {
  ScoreCalculator,
  type PlayerAnswer,
  type ScoringResult,
  type PlayerStats,
} from "./score-calculator";

export interface GameSessionConfig {
  sessionId: string;
  duration: 20 | 50 | 100;
  difficulty: 1 | 2 | 3;
  questions: Question[];
}

export interface GameSessionState {
  sessionId: string;
  phase: GamePhaseState;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: Question | null;
  answers: Map<string, PlayerAnswer>;
  playerStats: Map<string, PlayerStats>;
  questionStartTime: number;
  goSignalTime: number;
  lastResults: ScoringResult[]; // Cache des résultats de la dernière question
  lastCorrectIndex: number; // Cache du correctIndex de la dernière question
}

export class GameSessionManager {
  private config: GameSessionConfig;
  private state: GameSessionState;
  private timer: GameTimer;
  private phaseManager: GamePhaseManager;
  private scoreCalculator: ScoreCalculator;
  private phaseTimeout: NodeJS.Timeout | null = null;

  constructor(config: GameSessionConfig) {
    this.config = config;
    this.timer = new GameTimer();
    this.phaseManager = new GamePhaseManager(this.timer);
    this.scoreCalculator = new ScoreCalculator();

    this.state = {
      sessionId: config.sessionId,
      phase: "waiting",
      currentQuestionIndex: -1,
      totalQuestions: config.questions.length,
      currentQuestion: null,
      answers: new Map(),
      playerStats: new Map(),
      questionStartTime: 0,
      goSignalTime: 0,
      lastResults: [],
      lastCorrectIndex: 0,
    };
  }

  /**
   * Initialise les statistiques pour un joueur
   */
  addPlayer(playerId: string, nickname: string, avatar: string): void {
    const stats = this.scoreCalculator.initializePlayerStats(
      playerId,
      nickname,
      avatar,
    );
    this.state.playerStats.set(playerId, stats);
  }

  /**
   * Démarre la partie avec le countdown
   */
  startGame(): void {
    this.phaseManager.setPhase("countdown");
    this.state.phase = "countdown";
  }

  /**
   * Démarre la première question après le countdown
   */
  startFirstQuestion(): void {
    this.nextQuestion();
  }

  /**
   * Passe à la question suivante
   */
  nextQuestion(): void {
    // Reset du timer et des réponses
    this.timer.reset();
    this.state.answers.clear();
    this.state.currentQuestionIndex++;

    // Vérifier si c'est la fin
    if (this.state.currentQuestionIndex >= this.config.questions.length) {
      this.endGame();
      return;
    }

    // Charger la question
    this.state.currentQuestion =
      this.config.questions[this.state.currentQuestionIndex];

    // Phase 1 : Affichage de la question (1s)
    this.startDisplayPhase();
  }

  /**
   * Phase 1 : Affichage de la question
   */
  private startDisplayPhase(): void {
    this.phaseManager.setPhase("display");
    this.state.phase = "display";
    this.state.questionStartTime = this.timer.startQuestion();

    // Transition automatique vers buffer après 1s
    this.schedulePhaseTransition(PHASE_DURATIONS.DISPLAY, () => {
      this.startBufferPhase();
    });
  }

  /**
   * Phase Buffer : Compensation de latence (500ms)
   */
  private startBufferPhase(): void {
    this.phaseManager.setPhase("buffer");
    this.state.phase = "buffer";

    // Transition automatique vers answer après 500ms
    this.schedulePhaseTransition(PHASE_DURATIONS.BUFFER, () => {
      this.startAnswerPhase();
    });
  }

  /**
   * Phase 2 : Réponses des joueurs (15s)
   */
  private startAnswerPhase(): void {
    this.phaseManager.setPhase("answer");
    this.state.phase = "answer";
    this.state.goSignalTime = this.timer.sendGoSignal();

    // Transition automatique vers results après 15s
    this.schedulePhaseTransition(PHASE_DURATIONS.ANSWER, () => {
      this.startResultsPhase();
    });
  }

  /**
   * Enregistre une réponse de joueur
   */
  submitAnswer(
    playerId: string,
    answerIndex: number,
    timestamp: number,
  ): boolean {
    // Vérifier que c'est la bonne phase
    if (this.state.phase !== "answer") {
      return false;
    }

    // Vérifier que le joueur n'a pas déjà répondu
    if (this.state.answers.has(playerId)) {
      return false;
    }

    // Vérifier que la réponse est dans les temps
    if (!this.timer.isAnswerValid(timestamp)) {
      return false;
    }

    // Calculer le temps de réponse
    const responseTime = this.timer.calculateResponseTime(timestamp);

    // Enregistrer la réponse
    const answer: PlayerAnswer = {
      playerId,
      answerIndex,
      responseTime,
      timestamp,
    };

    this.state.answers.set(playerId, answer);

    // Si tous les joueurs ont répondu, passer aux résultats
    if (this.state.answers.size === this.state.playerStats.size) {
      this.clearPhaseTimeout();
      this.startResultsPhase();
    }

    return true;
  }

  /**
   * Phase 3 : Affichage des résultats (3s)
   */
  private startResultsPhase(): void {
    this.phaseManager.setPhase("results");
    this.state.phase = "results";

    // Calculer les scores et les mettre en cache
    const results = this.calculateQuestionResults();
    this.state.lastResults = results;

    // Cacher aussi le correctIndex avant que la question change
    if (this.state.currentQuestion) {
      this.state.lastCorrectIndex = this.state.currentQuestion.correctIndex;
    }

    // Mettre à jour les stats des joueurs
    this.updatePlayerStats(results);

    // Note: La transition vers la question suivante est gérée par le game-handler
    // via Socket.io pour synchroniser tous les clients
  }

  /**
   * Calcule les résultats de la question actuelle
   */
  private calculateQuestionResults(): ScoringResult[] {
    if (!this.state.currentQuestion) {
      return [];
    }

    const answers = Array.from(this.state.answers.values());
    const correctIndex = this.state.currentQuestion.correctIndex;

    return this.scoreCalculator.calculateScores(answers, correctIndex);
  }

  /**
   * Met à jour les statistiques des joueurs
   */
  private updatePlayerStats(results: ScoringResult[]): void {
    results.forEach((result) => {
      const stats = this.state.playerStats.get(result.playerId);
      if (stats) {
        const updatedStats = this.scoreCalculator.updatePlayerStats(
          stats,
          result,
        );
        this.state.playerStats.set(result.playerId, updatedStats);
      }
    });
  }

  /**
   * Termine la partie
   */
  private endGame(): void {
    this.phaseManager.setPhase("final");
    this.state.phase = "final";
    this.clearPhaseTimeout();
  }

  /**
   * Planifie une transition de phase
   */
  private schedulePhaseTransition(
    duration: number,
    callback: () => void,
  ): void {
    this.clearPhaseTimeout();
    this.phaseTimeout = setTimeout(callback, duration);
  }

  /**
   * Annule le timeout de transition
   */
  private clearPhaseTimeout(): void {
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }
  }

  /**
   * Retourne l'état actuel de la session
   */
  getState(): GameSessionState {
    return { ...this.state };
  }

  /**
   * Retourne les résultats de la question actuelle (depuis le cache)
   */
  getCurrentResults(): ScoringResult[] {
    return this.state.lastResults;
  }

  /**
   * Retourne le correctIndex de la dernière question (depuis le cache)
   */
  getLastCorrectIndex(): number {
    return this.state.lastCorrectIndex;
  }

  /**
   * Retourne le classement actuel
   */
  getCurrentLeaderboard(): Array<{
    playerId: string;
    score: number;
    rank: number;
  }> {
    const scores = new Map<string, number>();
    this.state.playerStats.forEach((stats, playerId) => {
      scores.set(playerId, stats.score);
    });
    return this.scoreCalculator.calculateLeaderboard(scores);
  }

  /**
   * Retourne les statistiques finales
   */
  getFinalStats(): PlayerStats[] {
    return this.scoreCalculator.calculateFinalStats(this.state.playerStats);
  }

  /**
   * Nettoie les ressources
   */
  destroy(): void {
    this.clearPhaseTimeout();
  }
}
