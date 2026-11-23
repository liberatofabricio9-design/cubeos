const express = require("express");
const { z } = require("zod");
const prisma = require("../db");
const { requireUser, requireStaff, requireRole } = require("../middleware/auth");
const { cleanText } = require("../utils/sanitize");

const router = express.Router();

function channelName(a, b) {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

router.get("/channels", requireUser, async (req, res) => {
  const users = await prisma.user.findMany({ where: { banned: false }, select: { minecraftNick: true, status: true } });
  res.json({ channels: ["geral", "construcoes", "trocas"], users });
});

router.get("/history", requireUser, async (req, res) => {
  const channel = (req.query.channel || "geral").toString();
  // allow geral or dm between requester and target
  let ch = channel;
  if (channel.startsWith("dm:")) {
    const parts = channel.split(":");
    if (parts.length === 3) {
      const other = parts[2];
      ch = channelName(req.user.minecraftNick, other);
    }
  }
  const msgs = await prisma.message.findMany({
    where: { channel: ch, deleted: false },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { author: { select: { minecraftNick: true } } },
  });
  res.json(msgs.map(m => ({ id: m.id, channel: m.channel, author: m.author.minecraftNick, content: m.content, createdAt: m.createdAt })));
});

// staff delete message
router.delete("/:id", requireStaff, async (req, res) => {
  await prisma.message.update({ where: { id: req.params.id }, data: { deleted: true } });
  res.json({ ok: true });
});

router.post("/", requireUser, async (req, res) => {
  // fallback REST send
  try {
    const { channel, content, to } = req.body || {};
    const text = cleanText(content, 1000);
    if (!text) return res.status(400).json({ error: "mensagem vazia" });
    let ch = channel || "geral";
    if (to) ch = channelName(req.user.minecraftNick, to);
    const m = await prisma.message.create({ data: { channel: ch, authorId: req.user.id, content: text } });
    res.json({ ok: true, id: m.id });
  } catch (e) {
    res.status(500).json({ error: "erro interno" });
  }
});

module.exports = router;
