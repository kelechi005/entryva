import * as Joi from 'joi';

// Validated once at boot via ConfigModule.forRoot({ validationSchema })
// in app.module.ts. The point is to fail loudly and immediately with a
// clear message ("AUTH_SECRET is required") instead of the process
// starting "successfully" and then failing confusingly later — e.g.
// passport-jwt silently verifying against `undefined`, or a 500 the
// first time a resident invite tries to sign an email.
//
// Kept intentionally permissive on anything that has a safe fallback
// already coded at the call site (LOG_LEVEL, PORT, the TTLs) — this
// schema only enforces what actually can't be safely defaulted.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  // Signs both access and refresh JWTs (see auth.service.ts — refresh
  // tokens are distinguished by a `typ: 'refresh'` claim and revoked via
  // a stored hash, not a second secret). 32+ chars so a placeholder like
  // "changeme" can't slip into production.
  AUTH_SECRET: Joi.string().min(32).required(),
  AUTH_ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  AUTH_REFRESH_TOKEN_TTL: Joi.string().default('7d'),

  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_ORIGIN: Joi.string().uri().optional(),
  // "true"/"false", or a specific hop count for a known proxy chain —
  // see main.ts. Left as a string so both are valid without two schemas.
  TRUST_PROXY: Joi.string().optional(),

  // Required for the offline-sync manifest (CLAUDE.md §25) to sign at
  // all — see backend/.env.example for how to generate this keypair.
  OFFLINE_SIGNING_PRIVATE_KEY_B64: Joi.string().required(),
  OFFLINE_SIGNING_PUBLIC_KEY_B64: Joi.string().required(),

  // Optional integrations: blank is a valid, supported "not configured
  // yet" state at the call site (falls back to logging instead of
  // sending, see ResendEmailProvider), so these stay optional here.
  RESEND_API_KEY: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  TURN_SERVER_HOST: Joi.string().allow('').optional(),
  TURN_SECRET: Joi.string().allow('').optional(),
  TURN_CREDENTIAL_TTL_SECONDS: Joi.number().optional(),
  PUSH_NOTIFICATION_KEY: Joi.string().allow('').optional(),
  OBJECT_STORAGE_ENDPOINT: Joi.string().allow('').optional(),
  OBJECT_STORAGE_BUCKET: Joi.string().allow('').optional(),
  OBJECT_STORAGE_ACCESS_KEY: Joi.string().allow('').optional(),
  OBJECT_STORAGE_SECRET_KEY: Joi.string().allow('').optional(),
}).unknown(true); // don't choke on unrelated vars the host injects (PATH, HOSTNAME, etc.)
