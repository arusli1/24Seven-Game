'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Stat } from '@/lib/stats';

export interface Account {
  /** Leaderboard is configured on the server. */
  enabled: boolean;
  signedIn: boolean;
  username: string | null;
  pbs: Partial<Record<Stat, number | null>>;
}

const OFF: Account = { enabled: false, signedIn: false, username: null, pbs: {} };

/** The signed-in player, loaded once from /api/me. */
export function useAccount() {
  const [account, setAccount] = useState<Account>(OFF);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      const data = await r.json();
      setAccount({ ...OFF, ...data, pbs: data.pbs ?? {} });
    } catch {
      setAccount(OFF);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { account, setAccount, refresh };
}

export async function post<T>(url: string, body?: unknown, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? `error ${r.status}`);
    return data as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('server too slow');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
