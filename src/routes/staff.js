const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../db");
const { requireStaff, requireRole } = require("../middleware/auth");
const { cleanText, cleanNick } = require("../utils/sanitize");
const { z } = require("zod");

const router = express.Router();

async function audit(staffId, action, target = "", details = "") {
  await prisma.auditLog.create({ data: { staffId, action, target, details: cleanText(details, 500) } });
}

// stats
router.get("/stats", requireStaff, async (req, res) => {
  const [users, online, pending, openReports] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "online" } }),
    prisma.accessRequest.count({ where: { status: "pending" } }),
    prisma.report.count({ where: { status: "open" } }),
  ]);
  res.json({ users, online, pending, openReports });
});

// players
router.get("/players", requireStaff, async (req, res) => {
  const q = (req.query.search || "").toString().trim();
  const where = q ? { minecraftNick: { contains: q } } : {};
  const players = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  res.json(players.map(p => ({
    id: p.id, nick: p.minecraftNick, status: p.status, banned: p.banned, banReason: p.banReason, bio: p.bio, createdAt: p.createdAt,
  })));
});

router.post("/players/:id/warn", requireStaff, async (req, res) => {
  const { reason } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "não encontrado" });
  await prisma.warning.create({ data: { userId: user.id, byStaffId: req.staff.id, reason: cleanText(reason || "aviso", 500) } });
  await audit(req.staff.id, "warn", user.minecraftNick, reason);
  res.json({ ok: true });
});

router.post("/players/:id/ban", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const { reason } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "não encontrado" });
  await prisma.user.update({ where: { id: user.id }, data: { banned: true, banReason: cleanText(reason || "banido", 500), status: "offline" } });
  await prisma.ban.upsert({ where: { userId: user.id }, update: { reason: cleanText(reason || "banido", 500), byStaffId: req.staff.id }, create: { userId: user.id, reason: cleanText(reason || "banido", 500), byStaffId: req.staff.id } });
  await audit(req.staff.id, "ban", user.minecraftNick, reason);
  res.json({ ok: true });
});

router.post("/players/:id/unban", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "não encontrado" });
  await prisma.user.update({ where: { id: user.id }, data: { banned: false, banReason: "" } });
  await prisma.ban.deleteMany({ where: { userId: user.id } });
  await audit(req.staff.id, "unban", user.minecraftNick, "");
  res.json({ ok: true });
});

// access requests
router.get("/access-requests", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const list = await prisma.accessRequest.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list);
});

router.post("/access-requests/:id/approve", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const ar = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
  if (!ar || ar.status !== "pending") return res.status(404).json({ error: "não encontrado" });
  // create user
  const existing = await prisma.user.findUnique({ where: { minecraftNick: ar.nick } });
  if (existing) return res.status(409).json({ error: "nick já existe" });
  const user = await prisma.user.create({ data: { minecraftNick: ar.nick, passwordHash: ar.passwordHash } });
  await prisma.accessRequest.update({ where: { id: ar.id }, data: { status: "approved", userId: user.id, reviewedBy: req.staff.id } });
  await audit(req.staff.id, "approve-access", ar.nick, "");
  res.json({ ok: true });
});

router.post("/access-requests/:id/reject", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const ar = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
  if (!ar || ar.status !== "pending") return res.status(404).json({ error: "não encontrado" });
  await prisma.accessRequest.update({ where: { id: ar.id }, data: { status: "rejected", reviewedBy: req.staff.id } });
  await audit(req.staff.id, "reject-access", ar.nick, "");
  res.json({ ok: true });
});

// reports
router.get("/reports", requireStaff, async (req, res) => {
  const list = await prisma.report.findMany({ include: { reporter: { select: { minecraftNick: true } }, reported: { select: { minecraftNick: true } } }, orderBy: { createdAt: "desc" } });
  res.json(list.map(r => ({ id: r.id, reporter: r.reporter.minecraftNick, reported: r.reported.minecraftNick, reason: r.reason, status: r.status, createdAt: r.createdAt })));
});

router.post("/reports/:id/resolve", requireStaff, async (req, res) => {
  const r = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!r) return res.status(404).json({ error: "não encontrado" });
  await prisma.report.update({ where: { id: r.id }, data: { status: "resolved", resolvedBy: req.staff.id } });
  await audit(req.staff.id, "resolve-report", r.id, "");
  res.json({ ok: true });
});

// rules CRUD
router.get("/rules", requireStaff, async (req, res) => {
  const rules = await prisma.rule.findMany({ orderBy: { order: "asc" } });
  res.json(rules);
});
router.post("/rules", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const { title, body, order } = req.body || {};
  const r = await prisma.rule.create({ data: { title: cleanText(title, 100), body: cleanText(body, 2000), order: parseInt(order || 0, 10) } });
  await audit(req.staff.id, "create-rule", r.id, title);
  res.json(r);
});
router.put("/rules/:id", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const { title, body, order } = req.body || {};
  const r = await prisma.rule.update({ where: { id: req.params.id }, data: { title: cleanText(title, 100), body: cleanText(body, 2000), order: parseInt(order || 0, 10) } });
  await audit(req.staff.id, "update-rule", r.id, title);
  res.json(r);
});
router.delete("/rules/:id", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  await prisma.rule.delete({ where: { id: req.params.id } });
  await audit(req.staff.id, "delete-rule", req.params.id, "");
  res.json({ ok: true });
});

// quiz CRUD
router.get("/quiz", requireStaff, async (req, res) => {
  const qs = await prisma.quizQuestion.findMany();
  res.json(qs.map(q => ({ ...q, options: JSON.parse(q.options) })));
});
router.post("/quiz", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const { question, options, answer } = req.body || {};
  const q = await prisma.quizQuestion.create({ data: { question: cleanText(question, 500), options: JSON.stringify(options), answer: parseInt(answer, 10), createdBy: req.staff.id } });
  await audit(req.staff.id, "create-quiz", q.id, question);
  res.json(q);
});
router.delete("/quiz/:id", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  await prisma.quizQuestion.delete({ where: { id: req.params.id } });
  await audit(req.staff.id, "delete-quiz", req.params.id, "");
  res.json({ ok: true });
});

// announcements CRUD
router.get("/announcements", requireStaff, async (req, res) => {
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
  res.json(items);
});
router.post("/announcements", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const { title, body } = req.body || {};
  const a = await prisma.announcement.create({ data: { title: cleanText(title, 100), body: cleanText(body, 2000), createdBy: req.staff.id } });
  await audit(req.staff.id, "create-announcement", a.id, title);
  res.json(a);
});
router.delete("/announcements/:id", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  await audit(req.staff.id, "delete-announcement", req.params.id, "");
  res.json({ ok: true });
});

// audit logs
router.get("/audit-logs", requireStaff, requireRole("admin", "owner"), async (req, res) => {
  const logs = await prisma.auditLog.findMany({ include: { staff: { select: { username: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(logs.map(l => ({ id: l.id, staff: l.staff?.username, role: l.staff?.role, action: l.action, target: l.target, details: l.details, createdAt: l.createdAt })));
});

// invite codes (owner)
router.post("/invite-codes", requireStaff, requireRole("owner"), async (req, res) => {
  const crypto = require("crypto");
  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const c = await prisma.inviteCode.create({ data: { code } });
  await audit(req.staff.id, "create-invite", c.id, code);
  res.json(c);
});

module.exports = router;
