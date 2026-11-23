const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../db");
const { signToken } = require("../middleware/auth");
const { cleanNick, cleanText } = require("../utils/sanitize");
const config = require("../config");

const router = express.Router();

const registerSchema = z.object({
  nick: z.string().min(3).max(16),
  password: z.string().min(6).max(72),
  reason: z.string().max(500).optional().default(""),
  inviteCode: z.string().optional(),
});

router.post("/register-request", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const nick = cleanNick(data.nick);
    if (!nick) return res.status(400).json({ error: "nick inválido" });
    const exists = await prisma.user.findUnique({ where: { minecraftNick: nick } });
    if (exists) return res.status(409).json({ error: "nick já cadastrado" });
    const pending = await prisma.accessRequest.findFirst({ where: { nick, status: "pending" } });
    if (pending) return res.status(409).json({ error: "solicitação já pendente" });

    const passwordHash = await bcrypt.hash(data.password, 10);

    // invite code auto-approve
    if (data.inviteCode) {
      const code = await prisma.inviteCode.findUnique({ where: { code: data.inviteCode } });
      if (!code) return res.status(400).json({ error: "código de convite inválido" });
      if (code.usedBy) return res.status(400).json({ error: "código já utilizado" });
      if (code.expiresAt && code.expiresAt < new Date()) return res.status(400).json({ error: "código expirado" });

      const user = await prisma.user.create({
        data: { minecraftNick: nick, passwordHash },
      });
      await prisma.inviteCode.update({ where: { id: code.id }, data: { usedBy: user.id } });
      const token = signToken({ id: user.id, type: "user" });
      const secure = req.secure || req.get("x-forwarded-proto") === "https" || config.cookieSecure;
      res.cookie("cubeos_user", token, { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: 7 * 24 * 3600 * 1000 });
      return res.json({ ok: true, autoApproved: true, user: { id: user.id, nick: user.minecraftNick } });
    }

    await prisma.accessRequest.create({
      data: { nick, passwordHash, reason: cleanText(data.reason) },
    });
    res.json({ ok: true, autoApproved: false, message: "solicitação enviada para análise da staff" });
  } catch (e) {
    if (e.name === "ZodError") return res.status(400).json({ error: e.errors[0].message });
    console.error(e);
    res.status(500).json({ error: "erro interno" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { nick, password } = req.body || {};
    const n = cleanNick(nick);
    if (!n || !password) return res.status(400).json({ error: "credenciais inválidas" });
    const user = await prisma.user.findUnique({ where: { minecraftNick: n } });
    if (!user || user.banned) return res.status(401).json({ error: "credenciais inválidas" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "credenciais inválidas" });
    await prisma.user.update({ where: { id: user.id }, data: { status: "online", lastLogin: undefined } }).catch(() => {});
    await prisma.user.update({ where: { id: user.id }, data: { status: "online" } });
    const token = signToken({ id: user.id, type: "user" });
    const secure = req.secure || req.get("x-forwarded-proto") === "https" || config.cookieSecure;
    res.cookie("cubeos_user", token, { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ ok: true, user: { id: user.id, nick: user.minecraftNick } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro interno" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("cubeos_user", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.cubeos_user;
  if (!token) return res.status(401).json({ error: "não autenticado" });
  const jwt = require("jsonwebtoken");
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { return res.status(401).json({ error: "sessão inválida" }); }
  if (payload.type !== "user") return res.status(401).json({ error: "sessão inválida" });
  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) return res.status(401).json({ error: "não encontrado" });
  res.json({ id: user.id, nick: user.minecraftNick, bio: user.bio, status: user.status, settings: JSON.parse(user.settings || "{}"), windowLayout: JSON.parse(user.windowLayout || "{}"), banned: user.banned });
});

module.exports = router;
