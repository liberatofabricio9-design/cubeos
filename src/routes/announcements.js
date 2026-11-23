const express = require("express");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireUser, async (req, res) => {
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  res.json(items);
});

module.exports = router;
