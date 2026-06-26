import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePdfDocument, type InvoicePdfData } from '@/lib/pdf/invoice';

/**
 * Renders invoice PDF data to a binary buffer for download.
 *
 * @param data - Structured company + invoice payload for the template.
 * @returns PDF file bytes.
 */
export async function renderInvoicePdfBuffer(data: InvoicePdfData): Promise<Uint8Array> {
  const element = React.createElement(InvoicePdfDocument, { data });
  const buffer = await renderToBuffer(
    element as Parameters<typeof renderToBuffer>[0],
  );
  return new Uint8Array(buffer);
}
