import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

export type VerifiedUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  picture: string;
};

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

type FirebaseClaims = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
  auth_time?: unknown;
  firebase?: { sign_in_provider?: unknown };
};

export class AuthError extends Error {
  constructor(message = 'Invalid or expired login. Please sign in again.') {
    super(message);
  }
}

async function getFirebaseCertificate(kid: string): Promise<string> {
  // Cache only Google's public certificates, never individual users or their tokens.
  const cache = await caches.open('campusgigs-firebase-certs');
  let response = await cache.match(FIREBASE_CERTS_URL);
  if (!response) {
    const fresh = await fetch(FIREBASE_CERTS_URL);
    if (!fresh.ok) throw new Error('Firebase signing keys unavailable');
    const maxAgeHeader = fresh.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1];
    const ttlSeconds = Math.min(Math.max(Number(maxAgeHeader || 300), 30), 3600);
    const headers = new Headers(fresh.headers);
    headers.set('cache-control', `public, max-age=${ttlSeconds}`);
    response = new Response(fresh.body, { headers });
    await cache.put(FIREBASE_CERTS_URL, response.clone());
  }
  const certs: unknown = await response.json();
  if (!certs || typeof certs !== 'object' || Array.isArray(certs)) throw new Error('Invalid certificate response');
  const value = (certs as Record<string, unknown>)[kid];
  if (typeof value !== 'string') throw new AuthError('Token signing key is not recognised');
  return value;
}

export async function verifyFirebaseToken(request: Request, projectId: string): Promise<VerifiedUser> {
  if (!projectId || projectId.startsWith('SET_')) throw new Error('Firebase project not configured');
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.length > 8192) throw new AuthError();
  const rawToken = authHeader.slice(7).trim();
  if (rawToken.split('.').length !== 3) throw new AuthError();

  try {
    const header = decodeProtectedHeader(rawToken);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new AuthError();
    const certificate = await getFirebaseCertificate(header.kid);
    const key = await importX509(certificate, 'RS256');
    const { payload } = await jwtVerify(rawToken, key, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
      clockTolerance: 10,
    });
    const claims = payload as FirebaseClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1 ||
      claims.sub.length > 128 ||
      typeof claims.auth_time !== 'number' ||
      claims.auth_time > now + 10 ||
      (typeof payload.iat === 'number' && payload.iat > now + 10) ||
      claims.firebase?.sign_in_provider === 'anonymous'
    ) throw new AuthError();

    return {
      uid: claims.sub,
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
      emailVerified: claims.email_verified === true,
      displayName: typeof claims.name === 'string' ? claims.name.slice(0, 80) : '',
      picture: typeof claims.picture === 'string' ? claims.picture.slice(0, 1024) : '',
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError();
  }
}
