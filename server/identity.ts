import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

const secret = process.env.AB_SESSION_SECRET || randomBytes(32).toString('hex');
const identities = new WeakMap<Request, string>();
const cookieName = 'ab_student';
const sign = (id: string): string => createHmac('sha256', secret).update(id).digest('hex');

// An opaque, signed anonymous identity. A caller-supplied uid is never authority.
export const studentIdentity: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    try {
      const publicHost = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
      if (new URL(origin).host !== publicHost) {
        res.status(403).json({ error: 'cross_origin_request' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'invalid_origin' });
      return;
    }
  }
  const raw = (req.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
  const [candidate, signature] = raw.split('.');
  const valid = /^ab-[a-f0-9]{24}$/.test(candidate || '') && /^[a-f0-9]{64}$/.test(signature || '')
    && timingSafeEqual(Buffer.from(signature), Buffer.from(sign(candidate)));
  const uid = valid ? candidate : `ab-${randomBytes(12).toString('hex')}`;
  identities.set(req, uid);
  res.setHeader('Cache-Control', 'no-store');
  if (!valid) {
    res.cookie(cookieName, `${uid}.${sign(uid)}`, {
      httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: req.secure || req.get('x-forwarded-proto') === 'https', path: '/api',
    });
  }
  next();
};

export function studentUid(req: Request): string {
  const uid = identities.get(req);
  if (!uid) throw new Error('student identity middleware is missing');
  return uid;
}
