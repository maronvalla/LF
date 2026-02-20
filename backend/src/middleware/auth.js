const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;
  const token = bearer || req.cookies?.token;
  if (!token) {
    return res.status(401).json({ ok: false, message: "No autenticado" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Token invalido o expirado" });
  }
}

module.exports = { authRequired };
