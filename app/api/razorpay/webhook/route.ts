import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { dispatchRazorpayEvent } from '@/lib/razorpay/webhook';

/**
 * PUBLIC webhook endpoint — SECURITY: verified via Razorpay HMAC signature.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature !== expected) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as { event: string; created_at?: number };
  const eventId = req.headers.get('x-razorpay-event-id') ?? `${event.event}_${event.created_at}`;

  const existing = await prisma.razorpayWebhookEvent.findUnique({
    where: { razorpayEventId: eventId },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await prisma.razorpayWebhookEvent.upsert({
    where: { razorpayEventId: eventId },
    update: {},
    create: {
      razorpayEventId: eventId,
      eventType: event.event,
      payload: event,
      signature,
    },
  });

  try {
    await dispatchRazorpayEvent(event);
    await prisma.razorpayWebhookEvent.update({
      where: { razorpayEventId: eventId },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    console.error('razorpay webhook processing failed', {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
