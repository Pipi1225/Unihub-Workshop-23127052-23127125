const jwt = require("jsonwebtoken");

function authenticateJwt(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!token) {
    return next(
      Object.assign(new Error("Missing access token"), { statusCode: 401 }),
    );
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    return next();
  } catch (error) {
    return next(
      Object.assign(new Error("Invalid or expired access token"), {
        statusCode: 401,
      }),
    );
  }
}

module.exports = authenticateJwt;
