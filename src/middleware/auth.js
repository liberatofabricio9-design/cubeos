const jwt = require("jsonwebtoken");
const config = require("../config");
const prisma = require("../db");

function signToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

async function requireUser(req, res, next) {
  const token = req.cookies?.cubeos_user;
  if (!token) return res.status(401).json({ error: "não autenticado" });
  const payload = verifyToken(token);
  if (!payload || payload.type !== "user") return res.status(401).json({ error: "sessão inválida" });
  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || user.banned) return res.status(403).json({ error: "acesso negado" });
  req.user = user;
  next();
}

async function requireStaff(req, res, next) {
  const token = req.cookies?.cubeos_staff;
  if (!token) return res.status(401).json({ error: "não autenticado" });
  const payload = verifyToken(token);
  if (!payload || payload.type !== "staff") return res.status(401).json({ error: "sessão inválida" });
  const staff = await prisma.staff.findUnique({ where: { id: payload.id } });
  if (!staff) return res.status(403).json({ error: "acesso negado" });
  req.staff = staff;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: "permissão insuficiente" });
    }
    next();
  };
}

module.exports = { signToken, verifyToken, requireUser, requireStaff, requireRole };
