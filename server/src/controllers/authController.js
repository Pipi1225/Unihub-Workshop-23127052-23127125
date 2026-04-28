const authService = require("../services/authService");

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
  };
}

async function googleLogin(req, res) {
  const { credential } = req.body || {};
  const result = await authService.loginWithGoogle(credential);

  res.cookie("refresh_token", result.refreshToken.token, {
    ...getCookieOptions(),
    expires: result.refreshToken.expiresAt,
  });

  res.status(200).json({
    ok: true,
    access_token: result.accessToken,
    user: result.user,
  });
}

async function refreshToken(req, res) {
  const refreshTokenValue = req.cookies?.refresh_token;
  const result = await authService.refreshAccessToken(refreshTokenValue);

  res.status(200).json({
    ok: true,
    access_token: result.accessToken,
  });
}

async function logout(req, res) {
  const refreshTokenValue = req.cookies?.refresh_token;
  await authService.revokeRefreshToken(refreshTokenValue);

  res.clearCookie("refresh_token", getCookieOptions());

  res.status(200).json({
    ok: true,
    message: "Logged out",
  });
}

module.exports = {
  googleLogin,
  refreshToken,
  logout,
};
