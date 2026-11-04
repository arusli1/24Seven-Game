'use client';

import { useState } from 'react';
import { post } from './use-account';

/** Pick (or change) the name shown on the leaderboard. */
export function UsernameDialog({
  current,
  onDone,
  onClose,
  onSignOut,
}: {
  current: string | null;
  onDone: (name: string) => void;
  /** Absent when a name is required (first sign-in). */
  onClose?: () => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { username } = await post<{ username: string }>('/api/username', { name });
      onDone(username);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onPointerDown={onClose}>
      <form
        className="dialog name-dialog"
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 16))}
          placeholder="username"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="done"
        />
        {error && <span className="error">{error}</span>}
        <div className="dialog-actions">
          <button type="button" className="link" onClick={onSignOut}>sign out</button>
          <button className="link is-active" disabled={saving || name.length < 2}>
            {saving ? '…' : 'save'}
          </button>
        </div>
      </form>
    </div>
  );
}
