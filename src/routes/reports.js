const express = require("express");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");
const { cleanText } = require("../utils/sanitize");

const router = express.Router();

router.post("/", requireUser, async (req, res) => {
  try {
    const { reportedNick, reason } = req.body || {};
    const reported = await prisma.user.findUnique({ where: { minecraftNick: reportedNick } });
    if (!reported) return res.status(404).json({ error: "jogador não encontrado" });
    if (reported.id === req.user.id) return res.status(400).json({ error: "não pode denunciar a si mesmo" });
    const r = await prisma.report.create({ data: { reporterId: req.user.id, reportedId: reported.id, reason: cleanText(reason, 500) } });
    res.json({ ok: true, id: r.id });
  } catch (e) {
    res.status(500).json({ error: "erro interno" });
  }
});

module.exports = router;
