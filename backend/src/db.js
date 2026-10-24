import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// O Postgres do Hub é compartilhado (max_connections baixo): limita o pool deste app.
function dbUrl() {
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    const max = Number(process.env.DB_POOL_SIZE) || 3;
    const current = Number(u.searchParams.get('connection_limit')) || Infinity;
    u.searchParams.set('connection_limit', String(Math.min(current, max)));
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Encaminha erros de handlers async para o tratador do Express. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Segredos cifrados ----------
const SECRET = process.env.JWT_SECRET || '';
export const KEY_MATERIAL = SECRET || `tmp-${crypto.randomBytes(16).toString('hex')}`;
if (!SECRET) console.warn('JWT_SECRET não definido: usando segredo temporário (sessões e segredos caem ao reiniciar).');
const AES_KEY = crypto.createHash('sha256').update(`monitor-settings:${KEY_MATERIAL}`).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(payload) {
  try {
    const [v, iv, tag, data] = String(payload).split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', AES_KEY, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ---------- Configurações ----------
export async function getSetting(key, fallback = null) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function deleteSetting(key) {
  await prisma.setting.deleteMany({ where: { key } });
}

export async function getSecret(key) {
  const v = await getSetting(key);
  return v ? decrypt(v) : null;
}

export async function setSecret(key, value) {
  await setSetting(key, encrypt(value));
}

export async function getJson(key, fallback) {
  const v = await getSetting(key);
  if (!v) return fallback;
  try {
    return { ...fallback, ...JSON.parse(v) };
  } catch {
    return fallback;
  }
}

export const str = (v, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
