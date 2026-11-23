const express = require("express");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");
const { z } = require("zod");
const { cleanText } = require("../utils/sanitize");

const router = express.Router();

// Ranking (server data)
router.get("/ranking", async (req, res) => {
  const rows = await prisma.serverRanking.findMany({ orderBy: { score: "desc" }, take: 20 });
  res.json(rows);
});

// Quiz
router.get("/quiz", requireUser, async (req, res) => {
  const qs = await prisma.quizQuestion.findMany({ select: { id: true, question: true, options: true } });
  res.json(qs.map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options) })));
});

router.post("/quiz/answer", requireUser, async (req, res) => {
  const { questionId, answerIndex } = req.body || {};
  const q = await prisma.quizQuestion.findUnique({ where: { id: questionId } });
  if (!q) return res.status(404).json({ error: "não encontrado" });
  const correct = q.answer === parseInt(answerIndex, 10);
  res.json({ correct, answer: q.answer });
});

// Sorteio
router.get("/raffle", requireUser, async (req, res) => {
  // latest announcement-like raffle stored in announcements? Use a simple in-memory-ish: store as announcement with title starting "Sorteio"
  const r = await prisma.announcement.findFirst({ where: { title: { startsWith: "Sorteio" } }, orderBy: { createdAt: "desc" } });
  res.json(r || null);
});

// Minerador
router.get("/minerador", requireUser, async (req, res) => {
  const gp = await prisma.gameProgress.findUnique({ where: { userId_game: { userId: req.user.id, game: "minerador" } } });
  const data = gp ? JSON.parse(gp.data) : { clicks: 0, level: 1, coins: 0 };
  res.json(data);
});

router.post("/minerador/click", requireUser, async (req, res) => {
  const gp = await prisma.gameProgress.findUnique({ where: { userId_game: { userId: req.user.id, game: "minerador" } } });
  const data = gp ? JSON.parse(gp.data) : { clicks: 0, level: 1, coins: 0 };
  data.clicks += 1;
  data.coins += 1;
  // level up every 100 clicks
  const newLevel = Math.floor(data.clicks / 100) + 1;
  if (newLevel > data.level) data.level = newLevel;
  await prisma.gameProgress.upsert({
    where: { userId_game: { userId: req.user.id, game: "minerador" } },
    update: { data: JSON.stringify(data) },
    create: { userId: req.user.id, game: "minerador", data: JSON.stringify(data) },
  });
  res.json(data);
});

module.exports = router;
