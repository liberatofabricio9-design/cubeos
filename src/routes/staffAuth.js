const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../db");
const { signToken } = require("../middleware/auth");
const config = require("../config");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password, teamCode } = req.body || {};
    if (!username || !password || !teamCode) return res.status(400).json({ error: "credenciais inválidas" });
    if (teamCode !== config.staffTeamCode) return res.status(401).json({ error: "código da equipe inválido" });
    const staff = await prisma.staff.findUnique({ where: { username } });
    if (!staff) return res.status(401).json({ error: "credenciais inválidas" });
    const ok = await bcrypt.compare(password, staff.passwordHash);
    if (!ok) return res.status(401).json({ error: "credenciais inválidas" });
    const token = signToken({ id: staff.id, type: "staff" });
    res.cookie("cubeos_staff", token, { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/", maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ ok: true, staff: { id: staff.id, username: staff.username, role: staff.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erro interno" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("cubeos_staff", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.cubeos_staff;
  if (!token) return res.status(401).json({ error: "não autenticado" });
  const jwt = require("jsonwebtoken");
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { return res.status(401).json({ error: "sessão inválida" }); }
  if (payload.type !== "staff") return res.status(401).json({ error: "sessão inválida" });
  const staff = await prisma.staff.findUnique({ where: { id: payload.id } });
  if (!staff) return res.status(401).json({ error: "não encontrado" });
  res.json({ id: staff.id, username: staff.username, role: staff.role });
});

module.exports = router;
