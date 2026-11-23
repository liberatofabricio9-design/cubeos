const express = require("express");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireUser, async (req, res) => {
  const rules = await prisma.rule.findMany({ orderBy: { order: "asc" } });
  res.json(rules);
});

module.exports = router;
