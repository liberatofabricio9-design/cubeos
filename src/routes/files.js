const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prisma = require("../db");
const { requireUser } = require("../middleware/auth");
const config = require("../config");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(config.uploadDir)),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/markdown", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("tipo de arquivo não permitido"));
  },
});

router.get("/", requireUser, async (req, res) => {
  const files = await prisma.file.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
  res.json(files);
});

router.post("/upload", requireUser, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "arquivo ausente" });
    const f = await prisma.file.create({
      data: {
        userId: req.user.id,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/${req.file.filename}`,
      },
    });
    res.json({ ok: true, file: f });
  } catch (e) {
    res.status(500).json({ error: e.message || "erro interno" });
  }
});

router.delete("/:id", requireUser, async (req, res) => {
  const f = await prisma.file.findUnique({ where: { id: req.params.id } });
  if (!f || f.userId !== req.user.id) return res.status(404).json({ error: "não encontrado" });
  const full = path.resolve(config.uploadDir, path.basename(f.path));
  fs.unlink(full, () => {});
  await prisma.file.delete({ where: { id: f.id } });
  res.json({ ok: true });
});

module.exports = router;
