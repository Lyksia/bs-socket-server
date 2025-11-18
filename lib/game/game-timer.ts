/**
 * GameTimer - Gestion du timing et des phases de jeu
 *
 * Assure l'équité en utilisant les timestamps serveur comme source de vérité.
 * Compense la latence réseau avec un buffer de 500ms.
 */

export class GameTimer {
  private serverTimeOffset: number = 0;
  private questionStartTime: number = 0;
  private goSignalTime: number = 0;

  /**
   * Synchronise l'horloge client avec le serveur
   * @param serverTime Timestamp serveur en millisecondes
   */
  syncWithServer(serverTime: number): void {
    const clientTime = Date.now();
    this.serverTimeOffset = serverTime - clientTime;
  }

  /**
   * Retourne le temps serveur actuel ajusté
   */
  getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Enregistre le début de l'affichage de la question
   */
  startQuestion(): number {
    this.questionStartTime = this.getServerTime();
    return this.questionStartTime;
  }

  /**
   * Enregistre le signal GO après le buffer de 500ms
   */
  sendGoSignal(): number {
    this.goSignalTime = this.getServerTime();
    return this.goSignalTime;
  }

  /**
   * Calcule le temps de réponse d'un joueur
   * @param answerTimestamp Timestamp de la réponse (serveur)
   * @returns Temps de réponse en secondes
   */
  calculateResponseTime(answerTimestamp: number): number {
    if (this.goSignalTime === 0) {
      throw new Error("GO signal not sent yet");
    }
    const responseTimeMs = answerTimestamp - this.goSignalTime;
    return responseTimeMs / 1000;
  }

  /**
   * Vérifie si une réponse est dans les temps (15s max)
   */
  isAnswerValid(answerTimestamp: number): boolean {
    const responseTime = this.calculateResponseTime(answerTimestamp);
    return responseTime >= 0 && responseTime <= 15;
  }

  /**
   * Reset pour la prochaine question
   */
  reset(): void {
    this.questionStartTime = 0;
    this.goSignalTime = 0;
  }
}

/**
 * Configuration des durées de chaque phase (en millisecondes)
 */
export const PHASE_DURATIONS = {
  DISPLAY: 1000, // Phase 1: Affichage de la question
  BUFFER: 500, // Buffer de latence avant le GO
  ANSWER: 10000, // Phase 2: Temps de réponse
  RESULTS: 6000, // Phase 3: Affichage des résultats (augmenté de 3s à 6s)
  COUNTDOWN: 3000, // Countdown 3-2-1 avant démarrage
} as const;

/**
 * États possibles d'une phase de jeu
 */
export type GamePhaseState =
  | "waiting" // En attente de joueurs
  | "ready_check" // Vérification des ready-ups
  | "countdown" // Compte à rebours 3-2-1
  | "display" // Affichage de la question (1s)
  | "buffer" // Buffer de latence (500ms)
  | "answer" // Réponses en cours (15s)
  | "results" // Affichage des résultats (3s)
  | "leaderboard" // Classement intermédiaire
  | "final" // Classement final
  | "finished"; // Partie terminée

/**
 * Gestionnaire de phases de jeu
 */
export class GamePhaseManager {
  private currentPhase: GamePhaseState = "waiting";
  private phaseStartTime: number = 0;
  private timer: GameTimer;

  constructor(timer: GameTimer) {
    this.timer = timer;
  }

  /**
   * Change la phase actuelle
   */
  setPhase(phase: GamePhaseState): void {
    this.currentPhase = phase;
    this.phaseStartTime = this.timer.getServerTime();
  }

  /**
   * Retourne la phase actuelle
   */
  getCurrentPhase(): GamePhaseState {
    return this.currentPhase;
  }

  /**
   * Retourne le temps écoulé dans la phase actuelle (en ms)
   */
  getPhaseElapsedTime(): number {
    return this.timer.getServerTime() - this.phaseStartTime;
  }

  /**
   * Retourne le temps restant dans la phase actuelle (en ms)
   */
  getPhaseTimeRemaining(phaseDuration: number): number {
    const elapsed = this.getPhaseElapsedTime();
    return Math.max(0, phaseDuration - elapsed);
  }

  /**
   * Vérifie si la phase actuelle est terminée
   */
  isPhaseComplete(phaseDuration: number): boolean {
    return this.getPhaseElapsedTime() >= phaseDuration;
  }
}
