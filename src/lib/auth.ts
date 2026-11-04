import { getServerSession, type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/** Google sign-in; the session lives in a signed cookie (no database needed). */
export const authEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET,
);

export const authOptions: NextAuthOptions = {
  providers: authEnabled
    ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
    : [],
  session: { strategy: 'jwt' },
  callbacks: {
    // Expose the Google account id; it is the player's stable id.
    session: ({ session, token }) => ({ ...session, sub: token.sub }),
  },
};

/** The signed-in player's id, or null. */
export async function currentSub(): Promise<string | null> {
  if (!authEnabled) return null;
  const session = (await getServerSession(authOptions)) as { sub?: string } | null;
  return session?.sub ?? null;
}
