// Entry point: builds the Express app, attaches Socket.IO, mounts the routes and starts listening.
//
//   config.js            constants (port, owner ID, session settings)
//   firebase.js          Firebase Realtime Database connection
//   realtime.js          Socket.IO setup + publish helpers
//   middleware/auth.js   requireSession, requireOwner, access checks
//   lib/                 session (JWT cookie), rateLimit, validation, twilio, mailer, data (shared DB reads)
//   routes/              auth, employees, tasks, chats
import http from "node:http";
import express from "express";
import { PORT } from "./config.js";
import { initRealtime } from "./realtime.js";
import authRoutes from "./routes/auth.js";
import employeeRoutes from "./routes/employees.js";
import taskRoutes from "./routes/tasks.js";
import chatRoutes from "./routes/chats.js";

const app = express();
const httpServer = http.createServer(app);
initRealtime(httpServer);
//middleware
app.use(express.json({ limit: "20kb" }));

app.get("/", (_req, res) => res.json({ message: "Backend connected" }));
app.use(authRoutes);
app.use(employeeRoutes);
app.use(taskRoutes);
app.use(chatRoutes);

httpServer.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
