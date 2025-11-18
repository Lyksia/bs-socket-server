/**
 * ScoreCalculator - Calcul des points et classements
 *
 * Règles de scoring :
 * - 1ère place : 10 points
 * - 2ème place : 8 points
 * - 3ème place : 5 points
 * - 4ème+ place : 1 point
 * - Mauvaise réponse ou timeout : 0 point
 */

export interface PlayerAnswer {
  playerId: string;
  answerIndex: number;
  responseTime: number;
  timestamp: number;
}

export interface ScoringResult {
  playerId: string;
  answerIndex: number;
  isCorrect: boolean;
  points: number;
  rank: number;
  responseTime: number;
}

export interface PlayerStats {
  playerId: string;
  nickname: string;
  avatar: string;
  score: number;
  correctAnswers: number;
  firstPlaceCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  bestStreak: number;
  currentStreak: number;
}

/**
 * Points attribués selon le rang
 */
export const RANK_POINTS: Record<number, number> = {
  1: 10,
  2: 8,
  3: 5,
};

export const DEFAULT_POINTS = 1; // 4ème place et plus

/**
 * Calcule les points pour une question
 */
export class ScoreCalculator {
  /**
   * Calcule le scoring pour une question
   * @param answers Toutes les réponses des joueurs
   * @param correctIndex Index de la bonne réponse
   * @returns Résultats de scoring pour chaque joueur
   */
  calculateScores(
    answers: PlayerAnswer[],
    correctIndex: number,
  ): ScoringResult[] {
    answers.forEach((answer) => {
      console.log(
        `[ScoreCalculator] Player Answer: [${answer.answerIndex}] | Correct Answer: [${correctIndex}]`,
      );
    });

    // Filtrer les réponses correctes
    const correctAnswers = answers.filter(
      (answer) => answer.answerIndex === correctIndex,
    );

    // Trier par temps de réponse (croissant)
    const sortedCorrectAnswers = correctAnswers.sort(
      (a, b) => a.responseTime - b.responseTime,
    );

    // Créer les résultats
    const results: ScoringResult[] = [];

    // Attribuer les points aux bonnes réponses
    sortedCorrectAnswers.forEach((answer, index) => {
      const rank = index + 1;
      const points = this.getPointsForRank(rank);

      results.push({
        playerId: answer.playerId,
        answerIndex: answer.answerIndex,
        isCorrect: true,
        points,
        rank,
        responseTime: answer.responseTime,
      });
    });

    // Ajouter les mauvaises réponses avec 0 point
    const incorrectAnswers = answers.filter(
      (answer) => answer.answerIndex !== correctIndex,
    );

    incorrectAnswers.forEach((answer) => {
      results.push({
        playerId: answer.playerId,
        answerIndex: answer.answerIndex,
        isCorrect: false,
        points: 0,
        rank: 0,
        responseTime: answer.responseTime,
      });
    });

    return results;
  }

  /**
   * Retourne les points pour un rang donné
   */
  private getPointsForRank(rank: number): number {
    return RANK_POINTS[rank] ?? DEFAULT_POINTS;
  }

  /**
   * Calcule le classement global des joueurs
   * @param playerScores Map des scores par joueur
   * @returns Joueurs triés par score décroissant
   */
  calculateLeaderboard(
    playerScores: Map<string, number>,
  ): Array<{ playerId: string; score: number; rank: number }> {
    // Convertir en array et trier par score décroissant
    const sorted = Array.from(playerScores.entries())
      .map(([playerId, score]) => ({ playerId, score }))
      .sort((a, b) => b.score - a.score);

    // Attribuer les rangs
    return sorted.map((player, index) => ({
      ...player,
      rank: index + 1,
    }));
  }

  /**
   * Met à jour les statistiques d'un joueur après une question
   */
  updatePlayerStats(
    stats: PlayerStats,
    scoringResult: ScoringResult,
  ): PlayerStats {
    const updatedStats = { ...stats };

    // Mettre à jour le score total
    updatedStats.score += scoringResult.points;

    // Mettre à jour les bonnes réponses
    if (scoringResult.isCorrect) {
      updatedStats.correctAnswers++;
      updatedStats.currentStreak++;

      // Mettre à jour le meilleur streak
      if (updatedStats.currentStreak > updatedStats.bestStreak) {
        updatedStats.bestStreak = updatedStats.currentStreak;
      }

      // Compter les premières places
      if (scoringResult.rank === 1) {
        updatedStats.firstPlaceCount++;
      }

      // Mettre à jour le temps de réponse total
      updatedStats.totalResponseTime += scoringResult.responseTime;

      // Calculer la moyenne
      updatedStats.averageResponseTime =
        updatedStats.totalResponseTime / updatedStats.correctAnswers;
    } else {
      // Réinitialiser le streak
      updatedStats.currentStreak = 0;
    }

    return updatedStats;
  }

  /**
   * Initialise les statistiques pour un joueur
   */
  initializePlayerStats(
    playerId: string,
    nickname: string,
    avatar: string,
  ): PlayerStats {
    return {
      playerId,
      nickname,
      avatar,
      score: 0,
      correctAnswers: 0,
      firstPlaceCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      bestStreak: 0,
      currentStreak: 0,
    };
  }

  /**
   * Calcule les statistiques finales pour tous les joueurs
   */
  calculateFinalStats(playerStats: Map<string, PlayerStats>): PlayerStats[] {
    return Array.from(playerStats.values()).sort((a, b) => b.score - a.score);
  }
}
