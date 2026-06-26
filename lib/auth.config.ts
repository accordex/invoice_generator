import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-compatible NextAuth config shared by API routes and middleware.
 * Must not import Prisma, bcrypt, or other Node-only modules.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isSuperAdmin = user.isSuperAdmin ?? false;
        token.teamId = user.teamId ?? null;
        token.branchId = user.branchId ?? null;
        token.departmentId = user.departmentId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
        session.user.teamId = (token.teamId as string | null) ?? null;
        session.user.branchId = (token.branchId as string | null) ?? null;
        session.user.departmentId = (token.departmentId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
