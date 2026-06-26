import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/privilege/withPrivilege';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { approvalRequestSchema } from '@/lib/validation/schemas';

export const GET = withAuth(async (req, ctx) => {
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const requests = await prisma.approvalRequest.findMany({
    where: {
      requesterId: ctx.userId,
      ...(status ? { status } : {}),
    },
    orderBy: { requestedAt: 'desc' },
    take: 100,
  });
  return NextResponse.json(requests);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();
  const parsed = approvalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.approvalRequest.create({
    data: {
      requesterId: ctx.userId,
      targetLevel: parsed.data.targetLevel,
      targetId: parsed.data.targetId,
      recordType: parsed.data.recordType,
      recordId: parsed.data.recordId,
      payload: (parsed.data.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      status: 'PENDING',
    },
  });

  return NextResponse.json(created, { status: 201 });
});
