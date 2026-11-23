const jwt = require("jsonwebtoken");
const config = require("../config");
const prisma = require("../db");
const { cleanText } = require("../utils/sanitize");

function channelName(a, b) {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

module.exports = (io) => {
  const online = new Map(); // userId -> socketId

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || "";
      const match = cookieHeader.match(/cubeos_user=([^;]+)/);
      if (!match) return next(new Error("no auth"));
      const token = decodeURIComponent(match[1]);
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.type !== "user") return next(new Error("bad type"));
      const user = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!user || user.banned) return next(new Error("banned"));
      socket.user = user;
      next();
    } catch (e) {
      next(new Error("auth failed"));
    }
  });

  io.on("connection", async (socket) => {
    const u = socket.user;
    await prisma.user.update({ where: { id: u.id }, data: { status: "online" } }).catch(() => {});
    online.set(u.id, socket.id);
    io.emit("presence", { nick: u.minecraftNick, status: "online" });

    socket.on("join", (channel) => {
      socket.join(channel || "geral");
    });

    socket.on("message", async (data) => {
      try {
        const { channel, content, to } = data || {};
        const text = cleanText(content, 1000);
        if (!text) return;
        let ch = channel || "geral";
        if (to) ch = channelName(u.minecraftNick, to);
        const m = await prisma.message.create({ data: { channel: ch, authorId: u.id, content: text } });
        const payload = { id: m.id, channel: ch, author: u.minecraftNick, content: text, createdAt: m.createdAt };
        io.to(ch).emit("message", payload);
        // notify recipient if dm
        if (to) {
          const recipient = await prisma.user.findUnique({ where: { minecraftNick: to } });
          if (recipient && online.has(recipient.id)) {
            io.to(online.get(recipient.id)).emit("message", payload);
          }
        }
      } catch (e) {
        console.error(e);
      }
    });

    socket.on("typing", (channel) => {
      socket.to(channel || "geral").emit("typing", { nick: u.minecraftNick, channel });
    });

    socket.on("disconnect", async () => {
      online.delete(u.id);
      await prisma.user.update({ where: { id: u.id }, data: { status: "offline" } }).catch(() => {});
      io.emit("presence", { nick: u.minecraftNick, status: "offline" });
    });
  });
};
