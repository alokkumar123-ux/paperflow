export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function calculatePrice(
  rateBw: number,
  rateColor: number,
  duplexDiscount: number,
  colorMode: "bw" | "color",
  sides: "single" | "duplex",
  pageCount: number,
  copies: number
): { subtotal: number; discountTotal: number; total: number } {
  const rate = colorMode === "color" ? rateColor : rateBw;
  const baseTotal = rate * pageCount * copies;
  return { subtotal: baseTotal, discountTotal: 0, total: baseTotal };
}

export function parsePageRange(
  rangeStr: string,
  totalPages: number
): { count: number; text: string } {
  if (!rangeStr || !rangeStr.trim()) {
    return { count: Math.max(1, totalPages), text: totalPages > 1 ? `1-${totalPages}` : "1" };
  }
  const trimmed = rangeStr.trim().toLowerCase();
  if (trimmed === "all") {
    return { count: Math.max(1, totalPages), text: `1-${totalPages}` };
  }

  const parts = trimmed.split(/[,;\s]+/).filter(Boolean);
  const selectedPages = new Set<number>();

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let p = Math.max(1, min); p <= Math.min(totalPages, max); p++) {
        selectedPages.add(p);
      }
    } else {
      const single = parseInt(part, 10);
      if (!isNaN(single) && single >= 1 && single <= totalPages) {
        selectedPages.add(single);
      }
    }
  }

  const count = selectedPages.size > 0 ? selectedPages.size : Math.max(1, totalPages);
  return {
    count,
    text: rangeStr.trim(),
  };
}

export function getSelectedPageNumbers(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr || !rangeStr.trim() || rangeStr.trim().toLowerCase() === "all") {
    return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
  }

  const parts = rangeStr.trim().split(/[,;\s]+/).filter(Boolean);
  const selectedPages = new Set<number>();

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let p = Math.max(1, min); p <= Math.min(totalPages, max); p++) {
        selectedPages.add(p);
      }
    } else {
      const single = parseInt(part, 10);
      if (!isNaN(single) && single >= 1 && single <= totalPages) {
        selectedPages.add(single);
      }
    }
  }

  if (selectedPages.size === 0) {
    return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
  }

  return Array.from(selectedPages).sort((a, b) => a - b);
}

export function formatSelectedPagesToRange(selectedPages: number[]): string {
  if (selectedPages.length === 0) return "";
  const sorted = [...new Set(selectedPages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}
