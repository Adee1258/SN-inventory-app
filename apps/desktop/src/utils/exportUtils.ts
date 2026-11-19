/**
 * Export Utility for Wholesale / Ghalla Mandi ERP
 * Handles CSV / Excel downloads with UTF-8 BOM so Microsoft Excel renders numbers and text perfectly.
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number | undefined | null)[][]): void {
  const sanitize = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = headers.map(sanitize).join(',');
  const dataRows = rows.map((row) => row.map(sanitize).join(','));
  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers system print dialog (which allows saving as PDF or physical print)
 */
export function printDocument(): void {
  if (window.electronAPI) {
    window.electronAPI.printInvoice();
  } else {
    window.print();
  }
}
