import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";
import { registerSessionHandlers } from "./handlers/session-handler";
import { registerGameHandlers } from "./handlers/game-handler";

export let io: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
> | null = null;

/**
 * Initialise le serveur Socket.io
 * À appeler une seule fois au démarrage du serveur
 */
export function initSocketServer(
  httpServer: HTTPServer,
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  if (io) {
    return io;
  }

  // Configuration CORS pour supporter Vercel + dev local
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean) as string[];

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      pingTimeout: 60000,
      pingInterval: 25000,
    },
  );

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connecté: ${socket.id}`);

    // Enregistrer les handlers
    if (io) {
      registerSessionHandlers(io, socket);
      registerGameHandlers(io, socket);
    }

    // Événement de déconnexion
    socket.on("disconnect", (reason) => {
      console.log(
        `[Socket.io] Client déconnecté: ${socket.id}, raison: ${reason}`,
      );
    });

    // Gestion des erreurs
    socket.on("error", (error) => {
      console.error(`[Socket.io] Erreur socket ${socket.id}:`, error);
    });
  });

  console.log("[Socket.io] Serveur initialisé");
  return io;
}

/**
 * Récupère l'instance du serveur Socket.io
 */
export function getSocketServer(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
> {
  if (!io) {
    throw new Error(
      "Socket.io server not initialized. Call initSocketServer first.",
    );
  }
  return io;
}
