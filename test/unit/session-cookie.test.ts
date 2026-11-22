import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  readCookie,
  SESSION_COOKIE,
  SessionStore,
  sessionCookie,
} from '../../src/service/sessions.js';
import { openDb } from '../../src/store/db.js';

describe('persistent localhost session cookie exchange', () => {
  it('exchanges single-use launch token for 14-day sliding session cookie', () => {
    const db = openDb(':memory:');
    try {
      let currentTime = 1_700_000_000_000;
      const now = () => currentTime;
      const store = new SessionStore(db, now);

      // 1. Mint launch token (1-minute TTL)
      const { token, expiresAt } = store.mintLaunchToken();
      expect(token).toBeDefined();
      expect(new Date(expiresAt).getTime()).toBe(currentTime + 60_000);

      // 2. Exchange single-use token for persistent session
      const redeemed = store.redeemLaunchToken(token);
      expect(redeemed).not.toBeNull();
      expect(redeemed?.id).toBeDefined();
      expect(redeemed?.session.csrf).toBeDefined();

      const sessionId = redeemed!.id;

      // Single-use guarantee: second redemption fails
      expect(store.redeemLaunchToken(token)).toBeNull();

      // 3. Cookie format: HttpOnly, SameSite=Strict, 14-day Max-Age (1,209,600s)
      const cookie = sessionCookie(sessionId);
      expect(cookie).toContain(`${SESSION_COOKIE}=${sessionId}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Max-Age=1209600');
      expect(cookie).toContain('Path=/');

      expect(readCookie(`foo=bar; ${cookie}`, SESSION_COOKIE)).toBe(sessionId);

      // 4. Verify SQLite stored expiration is 14 days out
      const initialRow = db
        .prepare('SELECT expires_at FROM dashboard_sessions WHERE csrf_token = ?')
        .get(redeemed!.session.csrf) as { expires_at: string };
      const expectedInitialExp = new Date(currentTime + 14 * 24 * 60 * 60 * 1000).toISOString();
      expect(initialRow.expires_at).toBe(expectedInitialExp);

      // 5. Advance time by 3 days and lookup session -> verify sliding TTL extends by another 14 days
      currentTime += 3 * 24 * 60 * 60 * 1000;
      const lookedUp = store.lookup(sessionId);
      expect(lookedUp).not.toBeNull();
      expect(lookedUp?.csrf).toBe(redeemed!.session.csrf);

      const refreshedRow = db
        .prepare('SELECT expires_at FROM dashboard_sessions WHERE csrf_token = ?')
        .get(redeemed!.session.csrf) as { expires_at: string };
      const expectedSlidingExp = new Date(currentTime + 14 * 24 * 60 * 60 * 1000).toISOString();
      expect(refreshedRow.expires_at).toBe(expectedSlidingExp);

      // 6. Cleared cookie test
      const cleared = clearedSessionCookie();
      expect(cleared).toContain(`${SESSION_COOKIE}=;`);
      expect(cleared).toContain('Max-Age=0');
    } finally {
      db.close();
    }
  });
});
