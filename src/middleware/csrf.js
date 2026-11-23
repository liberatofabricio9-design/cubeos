const crypto = require("crypto");

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function csrfMiddleware(req, res, next) {
  // issue token if missing
  if (!req.cookies?.csrf_token) {
    const t = generateToken();
    const secure = req.secure || req.get("x-forwarded-proto") === "https" || require("../config").cookieSecure;
    res.cookie("csrf_token", t, {
      httpOnly: false,
      sameSite: "strict",
      secure,
      path: "/",
    });
  }
  // validate on unsafe methods
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.get("x-csrf-token");
    if (!cookieToken || cookieToken !== headerToken) {
      return res.status(403).json({ error: "CSRF inválido" });
    }
  }
  next();
}

module.exports = { csrfMiddleware };
