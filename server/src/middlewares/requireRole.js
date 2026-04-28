function requireRole(allowedRoles) {
  return (req, _res, next) => {
    if (!req.user || !req.user.role) {
      return next(Object.assign(new Error("Missing user context"), { statusCode: 401 }));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(Object.assign(new Error("Forbidden"), { statusCode: 403 }));
    }

    return next();
  };
}

module.exports = requireRole;
