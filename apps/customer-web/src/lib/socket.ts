import { io, type Socket } from "socket.io-client";
import { getToken } from "./api";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

let socket: Socket | null = null;

/** Lazily created singleton. Auth token is read fresh on every (re)connect. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: (callback) => callback({ token: getToken() }),
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
