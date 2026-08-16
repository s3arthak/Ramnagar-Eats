import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { Restaurant } from "../models/Restaurant.js";
import { orderDto } from "../utils/order-dto.js";

const secret = () => process.env.JWT_SECRET ?? "local-development-secret-change-me";

let ioInstance: SocketServer | null = null;

export function getIo(): SocketServer {
  if (!ioInstance) throw new Error("Socket.IO has not been initialized");
  return ioInstance;
}

export interface SocketPayload {
  user: { id: string; role: string };
}

/**
 * Attach Socket.IO to the HTTP server. The socket connection is authenticated
 * with the same JWT used by the REST API; clients join their personal room and
 * (for restaurant owners) their restaurant's room.
 */
export function setupSockets(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: ["http://localhost:3000", "http://localhost:3001"] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("UNAUTHORIZED"));
    try {
      const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
      if (!payload.sub || !["CUSTOMER", "RESTAURANT", "ADMIN"].includes(payload.role)) return next(new Error("UNAUTHORIZED"));
      (socket.data as SocketPayload).user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  ioInstance = io;

  io.on("connection", async (socket) => {
    const { user } = socket.data as SocketPayload;
    socket.join(`user:${user.id}`);
    if (user.role === "RESTAURANT") {
      const restaurant = await Restaurant.findOne({ ownerId: user.id }).select("_id").lean();
      if (restaurant) socket.join(`restaurant:${restaurant._id.toString()}`);
    }
    socket.on("disconnect", () => undefined);
  });

  return io;
}

/** Notify the restaurant about a new order and the customer about updates. */
export function emitOrder(io: SocketServer, order: any, event: "order:new" | "order:updated") {
  const payload = { order: orderDto(order) };
  if (event === "order:new") {
    io.to(`restaurant:${order.restaurantId.toString()}`).emit("order:new", payload);
  }
  io.to(`user:${order.customerId.toString()}`).emit("order:updated", payload);
  if (event === "order:updated") {
    io.to(`restaurant:${order.restaurantId.toString()}`).emit("order:updated", payload);
  }
}
