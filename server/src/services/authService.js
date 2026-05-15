const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function parseAllowedDomains(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function parseAllowedEmails(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isEmailInList(email, allowedEmails) {
  if (!allowedEmails.length) {
    return false;
  }

  return allowedEmails.includes(String(email).toLowerCase());
}

function isEmailAllowed(email, allowedDomains) {
  if (!allowedDomains.length) {
    return true;
  }

  const domain = String(email).split("@")[1]?.toLowerCase();
  return Boolean(domain && allowedDomains.includes(domain));
}

async function verifyGoogleCredential(credential) {
  if (!credential) {
    throw Object.assign(new Error("Missing Google credential"), {
      statusCode: 400,
    });
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw Object.assign(new Error("Invalid Google token"), { statusCode: 401 });
  }

  const allowedAdminEmails = parseAllowedEmails(
    process.env.ALLOWED_ADMIN_EMAILS,
  );

  if (!isEmailInList(payload.email, allowedAdminEmails)) {
    const allowedDomains = parseAllowedDomains(
      process.env.ALLOWED_EMAIL_DOMAINS,
    );
    if (!isEmailAllowed(payload.email, allowedDomains)) {
      throw Object.assign(new Error("Email domain is not allowed"), {
        statusCode: 403,
      });
    }
  }

  return payload;
}

function createAccessToken(user) {
  const expiresIn = process.env.JWT_ACCESS_TTL || "15m";

  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn },
  );
}

function isBcryptHash(value) {
  return /^\$2[aby]\$/.test(String(value || ""));
}

function safeEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) {
    return false;
  }

  const normalizedHash = String(passwordHash).trim();
  if (!normalizedHash) {
    return false;
  }

  if (isBcryptHash(normalizedHash)) {
    return bcrypt.compare(plainPassword, normalizedHash);
  }

  if (normalizedHash.startsWith("plain:")) {
    return safeEqual(plainPassword, normalizedHash.slice("plain:".length));
  }

  return safeEqual(plainPassword, normalizedHash);
}

async function issueRefreshToken(userId) {
  const rawToken = crypto.randomUUID();
  const ttlDays = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token: rawToken,
      expires_at: expiresAt,
    },
  });

  return { token: rawToken, expiresAt };
}

async function findActiveUserByEmail(email) {
  const user = await prisma.users.findUnique({
    where: { email },
  });

  if (!user) {
    throw Object.assign(new Error("Account is not synced in the system"), {
      statusCode: 403,
    });
  }

  if (user.is_active === false) {
    throw Object.assign(new Error("Account is inactive"), { statusCode: 403 });
  }

  return user;
}

async function loginWithGoogle(credential) {
  const payload = await verifyGoogleCredential(credential);
  const user = await findActiveUserByEmail(payload.email);
  const accessToken = createAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
}

async function loginWithPassword(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    throw Object.assign(new Error("Missing email or password"), {
      statusCode: 400,
    });
  }

  const user = await findActiveUserByEmail(normalizedEmail);
  if (user.role !== "CHECKIN_STAFF") {
    throw Object.assign(new Error("Forbidden: role is not CHECKIN_STAFF"), {
      statusCode: 403,
    });
  }

  if (!user.password_hash) {
    throw Object.assign(new Error("Password not set for this account"), {
      statusCode: 403,
    });
  }

  const isValid = await verifyPassword(normalizedPassword, user.password_hash);
  if (!isValid) {
    throw Object.assign(new Error("Invalid email or password"), {
      statusCode: 401,
    });
  }

  const accessToken = createAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw Object.assign(new Error("Missing refresh token"), {
      statusCode: 401,
    });
  }

  const tokenRecord = await prisma.refresh_tokens.findUnique({
    where: { token: refreshToken },
    include: { users: true },
  });

  if (!tokenRecord) {
    throw Object.assign(new Error("Invalid refresh token"), {
      statusCode: 401,
    });
  }

  if (tokenRecord.expires_at <= new Date()) {
    throw Object.assign(new Error("Refresh token expired"), {
      statusCode: 401,
    });
  }

  const accessToken = createAccessToken({
    id: tokenRecord.user_id,
    role: tokenRecord.users.role,
  });

  return {
    accessToken,
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) {
    return;
  }

  await prisma.refresh_tokens.deleteMany({
    where: { token: refreshToken },
  });
}

module.exports = {
  loginWithGoogle,
  loginWithPassword,
  refreshAccessToken,
  revokeRefreshToken,
};
