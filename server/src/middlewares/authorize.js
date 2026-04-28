const authenticateJwt = require("./authenticateJwt");
const requireRole = require("./requireRole");

function authorize(allowedRoles = []) {
  return [authenticateJwt, requireRole(allowedRoles)];
}

module.exports = authorize;
