// Socket.IO: authenticates with the session cookie and pushes change notifications to browsers.
//
// Rooms:
//   authenticated   every signed-in socket
//   chat:<empId>    the employee themselves, plus the owner after "chat:join"
import { Server as SocketServer } from "socket.io";
import { readSessionToken, verifySession } from "./lib/session.js";
import { canAccessEmployee } from "./middleware/auth.js";
import { getEmployee } from "./lib/data.js";

let io;

export function initRealtime(httpServer) {
  io = new SocketServer(httpServer);

  io.use((socket, next) => {
    try {
      const token = readSessionToken(socket.handshake.headers.cookie);
      if (!token) return next(new Error("Authentication required"));
      socket.data.user = verifySession(token);
      return next();
    } catch {
      return next(new Error("Invalid session"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join("authenticated");

    // Disconnect when the JWT expires.
    const remainingSessionMs = Math.max(0, user.exp * 1000 - Date.now());
    const sessionTimer = setTimeout(() => socket.disconnect(true), remainingSessionMs);
    sessionTimer.unref();
    socket.on("disconnect", () => clearTimeout(sessionTimer));

    if (user.role === "employee") socket.join(`chat:${user.sub}`);
    socket.on("chat:join", async (employeeId) => {
      if (typeof employeeId !== "string" || !canAccessEmployee(user, employeeId)) return;
      if (!(await getEmployee(employeeId))) return;
      socket.join(`chat:${employeeId}`);
    });
  });
}

// Broadcasts carry no data: clients refetch over HTTP so each user's permissions apply.
export const publishTasksChanged = () => io.emit("tasks:changed");
export const publishEmployeesChanged = () => io.emit("employees:changed");

export const publishChatMessage = (employeeId, message) => io.to(`chat:${employeeId}`).emit("chat:message", message);
export const publishChatClosed = (employeeId) => io.to(`chat:${employeeId}`).emit("chat:closed");
