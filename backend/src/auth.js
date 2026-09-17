const crypto = require('node:crypto');
const { AppError } = require('./errors');

const TOKEN_VERSION = 1;
const DEFAULT_TOKEN_TTL_MINUTES = 8 * 60;
const DEMO_APPROVER = {
  id: 'demo-approver-001',
  name: 'Demo Approver',
  email: 'demo.approver@medripple.demo',
  role: 'APPROVER',
  active: true,
  createdAt: '2026-09-11T00:00:00.000Z',
  // Password: MedrippleDemo!2026. This account is only for simulated data.
  passwordHash: 'scrypt$bWVkcmlwcGxlLWRlbW8tMjAyNg$tiwYmJXvsZUqJ4T9pnhprY4Ky8wHIZ4hATpeymIHCdukfMIkblAFGoZtE1gZTgPBnURTS4Apl6fHNe3NVI_XjQ'
};

function asBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function requireText(value, field, maximum = 160) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'INVALID_REQUEST', `${field} is required.`);
  }
  const cleaned = value.trim();
  if (cleaned.length > maximum) {
    throw new AppError(400, 'INVALID_REQUEST', `${field} must be ${maximum} characters or fewer.`);
  }
  return cleaned;
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AppError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Password must be 10 to 200 characters and include a letter and a number.');
  }
  return value;
}

function parseRegistration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be an object.');
  }
  return {
    name: requireText(body.name, 'name', 120),
    email: validateEmail(body.email),
    password: validatePassword(body.password),
    // Public registration never grants approval authority. That is assigned by
    // the organisation in the persistent database after identity verification.
    role: 'OPERATOR'
  };
}

function parseCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be an object.');
  }
  if (typeof body.password !== 'string' || !body.password || body.password.length > 200) {
    throw new AppError(400, 'INVALID_REQUEST', 'password is required.');
  }
  return { email: validateEmail(body.email), password: body.password };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${asBase64Url(salt)}$${derived.toString('base64url')}`;
}

function verifyPassword(password, encodedHash) {
  if (typeof encodedHash !== 'string') return false;
  const [algorithm, encodedSalt, encodedDerived] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedDerived) return false;
  try {
    const salt = fromBase64Url(encodedSalt);
    const expected = Buffer.from(encodedDerived, 'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt
  };
}

function signingKey(config) {
  if (!config.authJwtSecret || config.authJwtSecret.length < 32) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured. Set a secure AUTH_JWT_SECRET.');
  }
  return config.authJwtSecret;
}

function signSession(user, config) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (config.authTokenTtlMinutes || DEFAULT_TOKEN_TTL_MINUTES) * 60;
  const header = asBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = asBase64Url(JSON.stringify({
    v: TOKEN_VERSION,
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    iat: now,
    exp: expiresAt
  }));
  const signature = crypto.createHmac('sha256', signingKey(config)).update(`${header}.${payload}`).digest('base64url');
  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

function verifySession(token, config) {
  if (typeof token !== 'string') throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  const [header, payload, suppliedSignature] = token.split('.');
  if (!header || !payload || !suppliedSignature) throw new AppError(401, 'INVALID_SESSION', 'Your session is invalid. Sign in again.');
  const expectedSignature = crypto.createHmac('sha256', signingKey(config)).update(`${header}.${payload}`).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new AppError(401, 'INVALID_SESSION', 'Your session is invalid. Sign in again.');
  }
  try {
    const parsedHeader = JSON.parse(fromBase64Url(header));
    const session = JSON.parse(fromBase64Url(payload));
    if (parsedHeader.alg !== 'HS256' || session.v !== TOKEN_VERSION || !session.sub || !session.email || !session.role || session.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid session payload');
    }
    return { id: session.sub, name: session.name, email: session.email, role: session.role, active: true };
  } catch {
    throw new AppError(401, 'INVALID_SESSION', 'Your session is invalid or expired. Sign in again.');
  }
}

function createAuthService(config, authStore) {
  async function createSession(user) {
    const session = signSession(user, config);
    return { user: publicUser(user), ...session };
  }

  return {
    async register(body) {
      const registration = parseRegistration(body);
      const existing = await authStore.findByEmail(registration.email);
      if (existing) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email address.');
      const user = await authStore.create({
        ...registration,
        id: crypto.randomUUID(),
        passwordHash: hashPassword(registration.password),
        active: true,
        createdAt: new Date().toISOString()
      });
      return createSession(user);
    },
    async login(body) {
      const credentials = parseCredentials(body);
      const user = await authStore.findByEmail(credentials.email);
      if (!user || !user.active || !verifyPassword(credentials.password, user.passwordHash)) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      await authStore.recordLogin?.(user.id);
      return createSession(user);
    },
    async authenticate(request) {
      const header = request.get('authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      const session = verifySession(match?.[1], config);
      const user = await authStore.findByEmail(session.email);
      if (!user || user.id !== session.id || user.active === false) {
        throw new AppError(401, 'INVALID_SESSION', 'Your account is unavailable. Sign in again.');
      }
      request.user = user;
      return user;
    }
  };
}

function requireAuthentication(authService) {
  return async (request, response, next) => {
    try {
      await authService.authenticate(request);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user?.role)) {
      return next(new AppError(403, 'INSUFFICIENT_ROLE', 'Your account is not authorised to approve or reject plans.'));
    }
    return next();
  };
}

module.exports = {
  DEMO_APPROVER,
  createAuthService,
  hashPassword,
  publicUser,
  requireAuthentication,
  requireRole,
  resettable: { verifyPassword },
  verifyPassword
};
