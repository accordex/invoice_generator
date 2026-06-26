import { prisma } from '@/lib/prisma';

/**
 * Returns the Indian fiscal year string (April–March), e.g. "2025-26".
 */
export function currentFiscalYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

/**
 * Atomically allocates the next invoice number for the current fiscal year.
 */
export async function allocateInvoiceNumber(): Promise<string> {
  const fiscalYear = currentFiscalYear();

  const series = await prisma.$transaction(async (tx) => {
    const existing = await tx.invoiceSeries.findUnique({ where: { fiscalYear } });
    if (existing) {
      return tx.invoiceSeries.update({
        where: { fiscalYear },
        data: { lastNumber: { increment: 1 } },
      });
    }
    return tx.invoiceSeries.create({
      data: { fiscalYear, lastNumber: 1 },
    });
  });

  const year = fiscalYear.split('-')[0];
  return `INV-${year}-${String(series.lastNumber).padStart(4, '0')}`;
}
