import { createServer } from "http";
import { initSocketServer } from "./init";

const port = parseInt(process.env.PORT || "3001", 10);

let io: any = null;

// Créer un simple serveur HTTP pour Socket.io uniquement
const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
    );
    return;
  }

  // Endpoint pour émettre des événements depuis l'API Next.js
  if (req.url === "/emit" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { event, room, data } = JSON.parse(body);

        if (!io) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Socket.io not initialized" }));
          return;
        }

        // Vérifier combien de clients sont dans la room
        const socketsInRoom = io.sockets.adapter.rooms.get(room);
        const clientCount = socketsInRoom ? socketsInRoom.size : 0;

        // Émettre l'événement vers la room
        io.to(room).emit(event, data);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, clientCount }));
      } catch (error) {
        console.error("[EMIT] Erreur:", error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  // Toutes les autres requêtes retournent 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found - This is a WebSocket-only server");
});

// Initialiser Socket.io
io = initSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`> Backend Socket.io server ready on http://localhost:${port}`);
  console.log(`> WebSocket endpoint: ws://localhost:${port}/socket.io/`);
});
