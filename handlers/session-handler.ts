import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import type { ClientToServerEvents, ServerToClientEvents } from "../types";

/**
 * Gestionnaire d'événements Socket.io pour les sessions
 */
export function registerSessionHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  /**
   * Hôte rejoint la room de sa session
   */
  socket.on("host:join-room", async (data) => {
    try {
      const { sessionId } = data;

      // Rejoindre la room Socket.io
      socket.join(sessionId);

      console.log(`[Session] Hôte a rejoint la room ${sessionId}`);
    } catch (error) {
      console.error("[Session] Erreur host:join-room:", error);
    }
  });

  /**
   * Hôte quitte la room de sa session
   */
  socket.on("host:leave-room", async (data) => {
    try {
      const { sessionId } = data;

      // Quitter la room Socket.io
      socket.leave(sessionId);

      console.log(`[Session] Hôte a quitté la room ${sessionId}`);
    } catch (error) {
      console.error("[Session] Erreur host:leave-room:", error);
    }
  });

  /**
   * Joueur rejoint la room de sa session
   */
  socket.on("player:join-room", async (data) => {
    try {
      const { sessionId, playerId } = data;

      // Rejoindre la room Socket.io
      socket.join(sessionId);

      console.log(
        `[Session] Joueur ${playerId} a rejoint la room ${sessionId}`,
      );

      // NE PAS émettre player:joined ici - le joueur est déjà dans la DB
      // L'événement player:joined doit être émis uniquement lors de la création du joueur via l'API
    } catch (error) {
      console.error("[Session] Erreur player:join-room:", error);
    }
  });

  /**
   * Joueur quitte la room de sa session
   */
  socket.on("player:leave-room", async (data) => {
    try {
      const { sessionId } = data;

      // Quitter la room Socket.io
      socket.leave(sessionId);

      console.log(`[Session] Joueur a quitté la room ${sessionId}`);
    } catch (error) {
      console.error("[Session] Erreur player:leave-room:", error);
    }
  });

  /**
   * Rejoindre une room de session
   */
  socket.on("player:join", async (data) => {
    try {
      const { sessionCode, nickname, avatar } = data;

      // Vérifier que la session existe
      const session = await prisma.session.findUnique({
        where: { code: sessionCode },
        include: { players: true },
      });

      if (!session) {
        socket.emit("error", { message: "Session introuvable" });
        return;
      }

      // Vérifier le nombre maximum de joueurs (10)
      const MAX_PLAYERS = 10;
      const activePlayers = session.players.filter(
        (p) => p.status === "ACTIVE",
      );
      if (activePlayers.length >= MAX_PLAYERS) {
        socket.emit("error", { message: "Session complète (10 joueurs max)" });
        return;
      }

      // Rejoindre la room Socket.io
      socket.join(session.id);

      // Notifier tous les joueurs de la room
      io.to(session.id).emit("player:joined", {
        id: socket.id,
        nickname,
        avatar,
        isCreator: false,
        isReady: false,
        status: "ACTIVE",
        score: 0,
        joinedAt: new Date().toISOString(),
      });

      console.log(`[Session] ${nickname} a rejoint la session ${sessionCode}`);
    } catch (error) {
      console.error("[Session] Erreur player:join:", error);
      socket.emit("error", { message: "Erreur lors de la connexion" });
    }
  });

  /**
   * Marquer un joueur comme prêt/pas prêt
   */
  socket.on("player:ready", async (data) => {
    try {
      const { playerId, isReady } = data;

      console.log(`[Session] player:ready reçu:`, { playerId, isReady });

      // Mettre à jour le joueur dans la DB
      const player = await prisma.player.update({
        where: { id: playerId },
        data: { isReady },
        include: { session: true },
      });

      // Notifier tous les joueurs de la room
      io.to(player.session.id).emit("player:ready-changed", {
        playerId: player.id,
        isReady: isReady ?? player.isReady,
      });

      console.log(
        `[Session] ${player.nickname} est ${isReady ? "prêt" : "pas prêt"}`,
      );
    } catch (error) {
      console.error("[Session] Erreur player:ready:", error);
      socket.emit("error", { message: "Erreur lors du changement d'état" });
    }
  });

  /**
   * Kicker un joueur (hôte uniquement)
   */
  socket.on("host:kick-player", async (data) => {
    try {
      const { sessionId, playerId } = data;

      const player = await prisma.player.update({
        where: { id: playerId },
        data: { status: "EXCLUDED" },
        include: { session: true },
      });

      // Notifier tous les joueurs
      io.to(sessionId).emit("player:left", { playerId: player.id });

      console.log(`[Session] ${player.nickname} a été exclu`);
    } catch (error) {
      console.error("[Session] Erreur host:kick-player:", error);
      socket.emit("error", { message: "Erreur lors de l'exclusion du joueur" });
    }
  });

  /**
   * Déconnexion
   */
  socket.on("disconnect", async () => {
    console.log(`[Session] Client déconnecté: ${socket.id}`);
  });
}
