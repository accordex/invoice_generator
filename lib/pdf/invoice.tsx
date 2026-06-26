import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { formatINR } from '@/lib/calc';

export interface InvoicePdfData {
  company: {
    name: string;
    email: string;
    phone: string;
    gstin?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    referenceNo?: string | null;
    paymentTerms: string;
    billingAddress: string;
    shippingAddress?: string | null;
    status: string;
    subtotal: number;
    totalDiscount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    shippingCharges: number;
    roundOff: number;
    grandTotal: number;
    amountInWords: string;
    notes?: string | null;
    terms?: string | null;
    customer: { name: string; email: string; phone: string; gstin?: string | null };
    lineItems: Array<{
      itemName: string;
      description?: string | null;
      hsnSac?: string | null;
      quantity: number;
      unit: string;
      rate: number;
      discountPct: number;
      taxPct: number;
      lineTotal: number;
    }>;
  };
}

const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  col: { width: '48%' },
  label: { color: '#666', marginBottom: 2 },
  table: { marginTop: 12, marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 6,
    fontWeight: 'bold',
  },
  tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  colItem: { width: '28%' },
  colQty: { width: '10%', textAlign: 'right' },
  colRate: { width: '14%', textAlign: 'right' },
  colTax: { width: '10%', textAlign: 'right' },
  colTotal: { width: '16%', textAlign: 'right' },
  totals: { marginTop: 8, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', marginBottom: 4 },
  grandTotal: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  footer: { marginTop: 24, fontSize: 9, color: '#666' },
});

/**
 * React-PDF document template for A4 invoice export.
 */
export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const { company, invoice } = data;
  const isIntraState = invoice.cgst > 0 || invoice.sgst > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>TAX INVOICE</Text>
          <Text>{company.name}</Text>
          <Text>
            {company.addressLine1}
            {company.addressLine2 ? `, ${company.addressLine2}` : ''}
          </Text>
          <Text>
            {company.city}, {company.state} - {company.pincode}
          </Text>
          {company.gstin ? <Text>GSTIN: {company.gstin}</Text> : null}
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Bill To</Text>
            <Text>{invoice.customer.name}</Text>
            <Text>{invoice.billingAddress}</Text>
            {invoice.customer.gstin ? <Text>GSTIN: {invoice.customer.gstin}</Text> : null}
          </View>
          <View style={styles.col}>
            <Text>Invoice #: {invoice.invoiceNumber}</Text>
            <Text>Date: {invoice.invoiceDate}</Text>
            <Text>Due: {invoice.dueDate}</Text>
            <Text>Terms: {invoice.paymentTerms}</Text>
            <Text>Status: {invoice.status}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colItem}>Item</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colTax}>Tax%</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {invoice.lineItems.map((line, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colItem}>
                {line.itemName}
                {line.hsnSac ? ` (HSN: ${line.hsnSac})` : ''}
              </Text>
              <Text style={styles.colQty}>
                {line.quantity} {line.unit}
              </Text>
              <Text style={styles.colRate}>{formatINR(line.rate)}</Text>
              <Text style={styles.colTax}>{line.taxPct}%</Text>
              <Text style={styles.colTotal}>{formatINR(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatINR(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>{formatINR(invoice.totalDiscount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Taxable</Text>
            <Text>{formatINR(invoice.taxableAmount)}</Text>
          </View>
          {isIntraState ? (
            <>
              <View style={styles.totalRow}>
                <Text>CGST</Text>
                <Text>{formatINR(invoice.cgst)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>SGST</Text>
                <Text>{formatINR(invoice.sgst)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.totalRow}>
              <Text>IGST</Text>
              <Text>{formatINR(invoice.igst)}</Text>
            </View>
          )}
          {invoice.shippingCharges > 0 ? (
            <View style={styles.totalRow}>
              <Text>Shipping</Text>
              <Text>{formatINR(invoice.shippingCharges)}</Text>
            </View>
          ) : null}
          {invoice.roundOff !== 0 ? (
            <View style={styles.totalRow}>
              <Text>Round Off</Text>
              <Text>{formatINR(invoice.roundOff)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Grand Total</Text>
            <Text>{formatINR(invoice.grandTotal)}</Text>
          </View>
          <Text style={{ marginTop: 6, fontSize: 9 }}>{invoice.amountInWords}</Text>
        </View>

        {invoice.notes ? (
          <View style={styles.footer}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}
        {invoice.terms ? (
          <View style={styles.footer}>
            <Text style={styles.label}>Terms & Conditions</Text>
            <Text>{invoice.terms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
