import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'privacy · twentyfour' };

export default function Privacy() {
  return (
    <main className="doc">
      <a href="/" className="logo">
        <span className="suit" aria-hidden>♦</span>twentyfour
      </a>
      <h1>Privacy</h1>
      <p>
        You can play without an account. Nothing about casual play is stored on our servers.
      </p>
      <p>
        If you sign in with Google to rank your times, we store only: an anonymous id that Google
        gives us for your account, the username you choose, and your run times. We don&apos;t store
        your email address or anything else from your Google account, and we never sell or share data.
      </p>
      <p>
        Your username and best times are shown publicly on the leaderboard. To delete your data,
        email the address on the Google sign-in screen and we&apos;ll remove it.
      </p>
      <p className="muted">Last updated November 2026.</p>
    </main>
  );
}
