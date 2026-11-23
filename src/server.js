const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const prisma = require("./db");
const { authLimiter, apiLimiter } = require("./middleware/rateLimit");
const { csrfMiddleware } = require("./middleware/csrf");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(csrfMiddleware);
app.use(apiLimiter);

// static
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { setHeaders: (res) => { res.set("Cache-Control", "no-store, no-cache, must-revalidate"); } }));
const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// routes
app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/staff/auth", authLimiter, require("./routes/staffAuth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/games", require("./routes/games"));
app.use("/api/rules", require("./routes/rules"));
app.use("/api/files", require("./routes/files"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/announcements", require("./routes/announcements"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/map", require("./routes/map"));

// socket
require("./sockets/chat")(io);

// fallback SPA-ish
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

server.listen(config.port, () => {
  console.log(`CubeOS rodando em http://localhost:${config.port}`);
});

module.exports = { app, server, io };
