import React from 'react';
import { Printer, Download, X, Building2, Calendar, Phone, MapPin } from 'lucide-react';
import { exportToCsv, printDocument } from '../../utils/exportUtils.js';

export interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'sale' | 'purchase';
  invoice: {
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    paymentMethod: string;
    grossAmount?: string;
    discountAmount?: string;
    netInvoiceAmount?: string;
    netLandedAmount?: string;
    paidAmount?: string;
    remainingBalance?: string;
    notes?: string;
    customer?: { name: string; phone?: string; address?: string; code?: string };
    supplier?: { name: string; phone?: string; address?: string; code?: string };
    items?: Array<{
      id: number;
      enteredQuantity: string;
      enteredUnitName?: string;
      ratePerEnteredUnit?: string;
      grossAmount?: string;
      discountAmount?: string;
      netAmount?: string;
      landedCost?: string;
      ownershipType?: string;
      item?: { name: string; code: string };
    }>;
  } | null;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, type, invoice }) => {
  if (!isOpen || !invoice) return null;

  const isSale = type === 'sale';
  const party = isSale ? invoice.customer : invoice.supplier;
  const netTotal = isSale ? invoice.netInvoiceAmount : invoice.netLandedAmount;

  const handleDownloadCsv = () => {
    const headers = ['S.No', 'Commodity Item', 'Ownership', 'Quantity', 'Unit', 'Rate (Rs.)', 'Discount (Rs.)', 'Total (Rs.)'];
    const rows = (invoice.items || []).map((it, idx) => [
      idx + 1,
      it.item?.name || 'Item',
      it.ownershipType || 'OWN',
      it.enteredQuantity,
      it.enteredUnitName || 'KG',
      it.ratePerEnteredUnit || '0.00',
      it.discountAmount || '0.00',
      it.netAmount || it.landedCost || '0.00',
    ]);

    rows.push([]);
    rows.push(['', '', '', '', '', '', 'Net Payable:', netTotal || '0.00']);
    rows.push(['', '', '', '', '', '', 'Paid Amount:', invoice.paidAmount || '0.00']);
    rows.push(['', '', '', '', '', '', 'Balance Due:', invoice.remainingBalance || '0.00']);

    exportToCsv(`${invoice.invoiceNumber}_Bill`, headers, rows);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Top Control Bar (Hidden on print) */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-2 py-0.5 rounded">
              {invoice.invoiceNumber}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {isSale ? 'Customer Sales Invoice' : 'Supplier Purchase Bill'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-800 text-xs font-medium border border-slate-700 transition"
              title="Download as Excel CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Excel/CSV</span>
            </button>

            <button
              onClick={printDocument}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="p-8 bg-white text-slate-900 text-xs font-sans print:p-0 print:m-0">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">SN INVENTORY & COMMODITY ERP</h1>
              <p className="text-xs text-slate-600 font-medium">Wholesale Ghalla Mandi • Red Chilli, Turmeric, Coriander & Spices</p>
              <p className="text-[11px] text-gray-400">Main Mandi Bazaar, Shop # 14 • Phone: +92 300 1234567</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                {isSale ? 'Sale Bill / Invoice' : 'Purchase Bill'}
              </span>
              <p className="mt-1 font-mono font-bold text-sm text-slate-900">{invoice.invoiceNumber}</p>
              <p className="text-gray-400 text-[11px]">Date: {new Date(invoice.invoiceDate).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Party & Terms Info */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-5">
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                {isSale ? 'Billed To (Customer):' : 'Billed From (Supplier):'}
              </span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">{party?.name || 'Walk-in / Cash Party'}</h3>
              {party?.phone && <p className="text-slate-600 text-[11px]">Phone: {party.phone}</p>}
              {party?.address && <p className="text-slate-600 text-[11px]">Address: {party.address}</p>}
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Payment Details:</span>
              <p className="text-xs font-bold text-slate-800 mt-0.5">Method: {invoice.paymentMethod}</p>
              {invoice.notes && <p className="text-[11px] text-gray-400 italic mt-1">Note: {invoice.notes}</p>}
            </div>
          </div>

          {/* Line Items Table */}
          <table className="w-full text-left border-collapse mb-5">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-700 font-bold text-[11px]">
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-2">Commodity Item</th>
                <th className="py-2 px-2 text-center">Unit</th>
                <th className="py-2 px-2 text-right">Quantity</th>
                <th className="py-2 px-2 text-right">Rate (Rs.)</th>
                <th className="py-2 px-2 text-right">Discount</th>
                <th className="py-2 px-2 text-right">Total (Rs.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(invoice.items || []).map((it, idx) => (
                <tr key={it.id || idx}>
                  <td className="py-2 px-2 text-center font-mono text-gray-400">{idx + 1}</td>
                  <td className="py-2 px-2 font-bold text-slate-900">
                    {it.item?.name || 'Commodity Item'}
                    {it.ownershipType === 'CONSIGNMENT' && (
                      <span className="ml-1 text-[9px] font-semibold text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                        Commission
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center text-slate-600">{it.enteredUnitName || 'KG'}</td>
                  <td className="py-2 px-2 text-right font-mono font-medium">{it.enteredQuantity}</td>
                  <td className="py-2 px-2 text-right font-mono font-medium">{it.ratePerEnteredUnit || '0.00'}</td>
                  <td className="py-2 px-2 text-right font-mono text-gray-400">{it.discountAmount || '0.00'}</td>
                  <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                    {it.netAmount || it.landedCost || '0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-1.5 border-t-2 border-slate-900 pt-2 text-xs">
              {invoice.grossAmount && (
                <div className="flex justify-between text-slate-600">
                  <span>Gross Total:</span>
                  <span className="font-mono">Rs. {invoice.grossAmount}</span>
                </div>
              )}
              {invoice.discountAmount && parseFloat(invoice.discountAmount) > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount:</span>
                  <span className="font-mono">-Rs. {invoice.discountAmount}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-300 pt-1">
                <span>Net Payable:</span>
                <span className="font-mono">Rs. {netTotal || '0.00'}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid Amount:</span>
                <span className="font-mono text-emerald-700 font-bold">Rs. {invoice.paidAmount || '0.00'}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                <span>Remaining Balance:</span>
                <span className="font-mono text-rose-700 font-bold">Rs. {invoice.remainingBalance || '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-gray-400 text-[11px]">
            <div>
              <div className="border-b border-slate-400 w-44 mx-auto mb-1"></div>
              <span>Authorized Signature</span>
            </div>
            <div>
              <div className="border-b border-slate-400 w-44 mx-auto mb-1"></div>
              <span>Customer / Receiver Signature</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
