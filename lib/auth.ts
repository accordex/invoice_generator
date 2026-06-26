import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/lib/auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * NextAuth v5 configuration with credentials provider and JWT sessions.
 * Session carries userId, isSuperAdmin, and org-scope identifiers for privilege resolution.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user || !user.isActive || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isSuperAdmin: user.isSuperAdmin,
          teamId: user.teamId,
          branchId: user.branchId,
          departmentId: user.departmentId,
        };
      },
    }),
  ],
});

declare module 'next-auth' {
  interface User {
    isSuperAdmin?: boolean;
    teamId?: string | null;
    branchId?: string | null;
    departmentId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isSuperAdmin: boolean;
      teamId: string | null;
      branchId: string | null;
      departmentId: string | null;
    };
  }
}
