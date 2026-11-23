const express = require("express");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireUser, async (req, res) => {
  res.json(JSON.parse(req.user.settings || "{}"));
});

router.put("/", requireUser, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { settings: JSON.stringify(req.body || {}) } });
  res.json({ ok: true });
});

module.exports = router;
