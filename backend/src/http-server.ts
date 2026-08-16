import { createServer, type Server as HttpServer } from "node:http";
import type { Server as SocketServer } from "socket.io";
import { app } from "./app.js";
import { setupSockets } from "./sockets/index.js";

export interface AppServer {
  server: HttpServer;
  io: SocketServer;
}

export function createAppServer(): AppServer {
  const server = createServer(app);
  const io = setupSockets(server);
  return { server, io };
}
