const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");
const { cleanText } = require("../utils/sanitize");

const router = express.Router();

router.get("/me", requireUser, async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    nick: u.minecraftNick,
    bio: u.bio,
    status: u.status,
    settings: JSON.parse(u.settings || "{}"),
    windowLayout: JSON.parse(u.windowLayout || "{}"),
    createdAt: u.createdAt,
  });
});

router.put("/me", requireUser, async (req, res) => {
  try {
    const schema = z.object({
      bio: z.string().max(500).optional(),
      settings: z.record(z.any()).optional(),
      windowLayout: z.record(z.any()).optional(),
    });
    const data = schema.parse(req.body || {});
    const update = {};
    if (data.bio !== undefined) update.bio = cleanText(data.bio, 500);
    if (data.settings !== undefined) update.settings = JSON.stringify(data.settings);
    if (data.windowLayout !== undefined) update.windowLayout = JSON.stringify(data.windowLayout);
    const u = await prisma.user.update({ where: { id: req.user.id }, data: update });
    res.json({ ok: true, user: { id: u.id, nick: u.minecraftNick, bio: u.bio } });
  } catch (e) {
    if (e.name === "ZodError") return res.status(400).json({ error: e.errors[0].message });
    res.status(500).json({ error: "erro interno" });
  }
});

router.post("/change-password", requireUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || newPassword.length < 6) return res.status(400).json({ error: "senha inválida" });
    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) return res.status(401).json({ error: "senha atual incorreta" });
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: hash } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "erro interno" });
  }
});

router.get("/ranking", async (req, res) => {
  const rows = await prisma.serverRanking.findMany({ orderBy: { score: "desc" }, take: 20 });
  res.json(rows);
});

router.get("/:nick/profile", async (req, res) => {
  const nick = req.params.nick;
  const u = await prisma.user.findUnique({ where: { minecraftNick: nick } });
  if (!u) return res.status(404).json({ error: "não encontrado" });
  if (u.banned) return res.status(404).json({ error: "não encontrado" });
  res.json({ nick: u.minecraftNick, bio: u.bio, createdAt: u.createdAt, status: u.status });
});

router.get("/skin/:nick", async (req, res) => {
  const nick = req.params.nick.replace(/[^a-zA-Z0-9_]/g, "");
  // redirect to mc-heads render
  res.redirect(`https://mc-heads.net/avatar/${nick}/64`);
});

module.exports = router;
