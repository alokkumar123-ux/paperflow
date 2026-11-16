"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  X,
  Check,
  CheckSquare,
  Square,
  ZoomIn,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  Layers,
} from "lucide-react";
import { formatSelectedPagesToRange, getSelectedPageNumbers } from "@/lib/utils";

interface PdfPageSelectorModalProps {
  isOpen: boolean;
  file: File;
  fileName: string;
  totalPages: number;
  currentRange: string;
  ratePerPage?: number;
  onClose: () => void;
  onApply: (selectedPages: number[], formattedRange: string) => void;
}

export default function PdfPageSelectorModal({
  isOpen,
  file,
  fileName,
  totalPages,
  currentRange,
  ratePerPage = 2.0,
  onClose,
  onApply,
}: PdfPageSelectorModalProps) {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Enlarged preview
  const [previewPageNum, setPreviewPageNum] = useState<number | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Quick range inputs
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");

  // Initialize selected pages from currentRange
  useEffect(() => {
    if (!isOpen) return;
    const initialPages = getSelectedPageNumbers(currentRange, totalPages);
    setSelectedPages(new Set(initialPages));
    setRangeFrom("1");
    setRangeTo(String(totalPages));
  }, [isOpen, currentRange, totalPages]);

  // Load PDF with PDF.js client-side
  useEffect(() => {
    if (!isOpen || !file) return;

    let isMounted = true;
    setLoadingPdf(true);
    setErrorMsg(null);

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Point to the local worker file served from /public
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: "https://unpkg.com/pdfjs-dist/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(doc);
          setLoadingPdf(false);
        }
      } catch (err: any) {
        console.error("PDF.js load error:", err);
        if (isMounted) {
          setErrorMsg(err.message || "Failed to render PDF preview.");
          setLoadingPdf(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, file]);

  // Render enlarged preview when previewPageNum changes
  useEffect(() => {
    if (!previewPageNum || !pdfDoc || !previewCanvasRef.current) return;

    let isCancelled = false;

    const renderPreview = async () => {
      try {
        const page = await pdfDoc.getPage(previewPageNum);
        if (isCancelled) return;

        // Render at larger scale for clarity
        const canvas = previewCanvasRef.current;
        if (!canvas) return;

        const containerWidth = Math.min(window.innerWidth - 64, 600);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: Math.max(1, scale) });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        console.warn("Error rendering preview page", e);
      }
    };

    renderPreview();

    return () => {
      isCancelled = true;
    };
  }, [previewPageNum, pdfDoc]);

  // Toggle single page
  const togglePage = (pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
  };

  // Bulk actions
  const selectAll = () => {
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    setSelectedPages(all);
  };

  const clearAll = () => {
    setSelectedPages(new Set());
  };

  const selectOdd = () => {
    const odd = new Set<number>();
    for (let i = 1; i <= totalPages; i += 2) odd.add(i);
    setSelectedPages(odd);
  };

  const selectEven = () => {
    const even = new Set<number>();
    for (let i = 2; i <= totalPages; i += 2) even.add(i);
    setSelectedPages(even);
  };

  const selectCustomRange = () => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (isNaN(from) || isNaN(to)) return;
    const start = Math.max(1, Math.min(from, to));
    const end = Math.min(totalPages, Math.max(from, to));

    setSelectedPages((prev) => {
      const next = new Set(prev);
      for (let p = start; p <= end; p++) {
        next.add(p);
      }
      return next;
    });
  };

  const handleApply = () => {
    const pagesArray = Array.from(selectedPages).sort((a, b) => a - b);
    if (pagesArray.length === 0) {
      alert("Please select at least 1 page to print.");
      return;
    }
    const formattedRange = formatSelectedPagesToRange(pagesArray);
    onApply(pagesArray, formattedRange);
    onClose();
  };

  if (!isOpen) return null;

  const count = selectedPages.size;
  const estimatedCost = (count * ratePerPage).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[var(--background)] border-3 border-[#191919] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-[8px_8px_0px_#191919] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-white border-b-2 border-[#191919] p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[#e75325] text-white flex items-center justify-center font-bold text-xs shrink-0">
                <Eye className="w-3.5 h-3.5" />
              </span>
              <h2 className="text-sm sm:text-base font-black text-[#191919] truncate">
                Visual Page Selector
              </h2>
              <span className="text-[10px] font-mono font-bold bg-neutral-100 border border-neutral-300 px-2 py-0.5 rounded text-neutral-700">
                {totalPages} {totalPages === 1 ? "page" : "pages"}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono truncate mt-0.5 max-w-md">
              {fileName} • Tap pages to select or deselect
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-[#191919] bg-white hover:bg-neutral-100 text-[#191919] transition shadow-[2px_2px_0px_#191919] shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk Action Controls */}
        <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={selectAll}
              className="px-2.5 py-1 bg-white hover:bg-neutral-100 border border-[#191919] rounded-md font-mono font-bold text-[11px] shadow-[1px_1px_0px_#191919] transition"
            >
              All ({totalPages})
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2.5 py-1 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-md font-mono text-[11px] text-neutral-600 transition"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={selectOdd}
              className="px-2 py-1 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-md font-mono text-[11px] text-neutral-600 transition"
            >
              Odd
            </button>
            <button
              type="button"
              onClick={selectEven}
              className="px-2 py-1 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-md font-mono text-[11px] text-neutral-600 transition"
            >
              Even
            </button>
          </div>

          {/* Quick Select Range: from X to Y */}
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <span className="text-neutral-500 font-bold">Range:</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="w-12 text-center bg-white border border-[#191919] rounded px-1 py-0.5 font-bold"
              placeholder="1"
            />
            <span className="text-neutral-400">to</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="w-12 text-center bg-white border border-[#191919] rounded px-1 py-0.5 font-bold"
              placeholder={String(totalPages)}
            />
            <button
              type="button"
              onClick={selectCustomRange}
              className="px-2 py-0.5 bg-[#e75325] text-white font-bold rounded border border-[#191919] hover:bg-[#d9481c] transition shadow-[1px_1px_0px_#191919]"
            >
              Add
            </button>
          </div>
        </div>

        {/* Thumbnail Grid Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loadingPdf ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-500 font-mono text-xs">
              <Loader2 className="w-8 h-8 animate-spin text-[#e75325]" />
              <p className="font-bold">Rendering PDF pages for visual selection...</p>
              <p className="text-[11px] text-neutral-400">Loading {totalPages} pages</p>
            </div>
          ) : errorMsg ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-xs font-mono text-rose-600 font-bold">{errorMsg}</p>
              <p className="text-[11px] text-neutral-500">
                You can still type the page numbers directly in the file list.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const isSelected = selectedPages.has(pageNum);
                return (
                  <PageThumbnailCard
                    key={pageNum}
                    pageNum={pageNum}
                    pdfDoc={pdfDoc}
                    isSelected={isSelected}
                    onToggle={() => togglePage(pageNum)}
                    onZoom={() => setPreviewPageNum(pageNum)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="bg-white border-t-2 border-[#191919] p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm sm:text-base text-[#191919]">
                {count} of {totalPages} pages selected
              </span>
              <span className="text-xs font-mono font-bold text-[#e75325] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                ≈ ₹{estimatedCost}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 font-mono truncate hidden sm:block">
              Selection: {formatSelectedPagesToRange(Array.from(selectedPages)) || "None"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border-2 border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-bold text-neutral-700 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={count === 0}
              className={`px-4 py-2 rounded-xl border-2 border-[#191919] text-xs font-black text-white flex items-center gap-1.5 transition ${
                count === 0
                  ? "bg-neutral-300 text-neutral-500 border-neutral-400 cursor-not-allowed"
                  : "bg-[#e75325] hover:bg-[#d9481c] shadow-[3px_3px_0px_#191919] hover:translate-x-0.5 hover:translate-y-0.5"
              }`}
            >
              <Check className="w-4 h-4" />
              Confirm ({count} {count === 1 ? "Page" : "Pages"})
            </button>
          </div>
        </div>
      </div>

      {/* Enlarged Page Preview Modal */}
      {previewPageNum && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-3 border-[#191919] rounded-2xl max-w-lg w-full flex flex-col shadow-[8px_8px_0px_#191919] overflow-hidden max-h-[95vh]">
            <div className="p-3.5 border-b-2 border-[#191919] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-[#191919]">
                  Page {previewPageNum} of {totalPages}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    selectedPages.has(previewPageNum)
                      ? "bg-emerald-50 text-emerald-800 border-emerald-400"
                      : "bg-neutral-100 text-neutral-600 border-neutral-300"
                  }`}
                >
                  {selectedPages.has(previewPageNum) ? "✓ Included" : "Not included"}
                </span>
              </div>
              <button
                onClick={() => setPreviewPageNum(null)}
                className="p-1 rounded-lg border border-[#191919] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-neutral-100">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[65vh] object-contain shadow-md rounded border border-neutral-300 bg-white"
              />
            </div>

            <div className="p-3 border-t-2 border-[#191919] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={previewPageNum <= 1}
                  onClick={() => setPreviewPageNum((p) => Math.max(1, (p || 1) - 1))}
                  className="p-1.5 rounded-lg border border-[#191919] bg-white hover:bg-neutral-100 disabled:opacity-40"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={previewPageNum >= totalPages}
                  onClick={() => setPreviewPageNum((p) => Math.min(totalPages, (p || 1) + 1))}
                  className="p-1.5 rounded-lg border border-[#191919] bg-white hover:bg-neutral-100 disabled:opacity-40"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => togglePage(previewPageNum)}
                className={`px-3 py-1.5 rounded-xl border-2 border-[#191919] text-xs font-black transition flex items-center gap-1.5 ${
                  selectedPages.has(previewPageNum)
                    ? "bg-rose-50 text-rose-800 hover:bg-rose-100"
                    : "bg-[#e75325] text-white hover:bg-[#d9481c] shadow-[2px_2px_0px_#191919]"
                }`}
              >
                {selectedPages.has(previewPageNum) ? "Remove Page" : "+ Select This Page"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Thumbnail Card with Lazy Canvas Rendering
function PageThumbnailCard({
  pageNum,
  pdfDoc,
  isSelected,
  onToggle,
  onZoom,
}: {
  pageNum: number;
  pdfDoc: any;
  isSelected: boolean;
  onToggle: () => void;
  onZoom: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || rendered || rendering) return;

    let isCancelled = false;

    const renderThumbnail = async () => {
      try {
        setRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Thumbnail scale
        const unscaledViewport = page.getViewport({ scale: 1 });
        const targetWidth = 140;
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (!isCancelled) {
            setRendered(true);
          }
        }
      } catch (err) {
        console.warn(`Error rendering thumbnail for page ${pageNum}`, err);
      } finally {
        if (!isCancelled) setRendering(false);
      }
    };

    renderThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNum, rendered, rendering]);

  return (
    <div
      onClick={onToggle}
      className={`group relative rounded-xl border-2 cursor-pointer transition-all flex flex-col overflow-hidden select-none ${
        isSelected
          ? "border-[#e75325] bg-orange-50/40 shadow-[3px_3px_0px_#e75325] ring-2 ring-[#e75325]/30 scale-[1.01]"
          : "border-neutral-300 bg-white hover:border-[#191919] hover:shadow-[2px_2px_0px_#191919]"
      }`}
    >
      {/* Top Checkbox / Indicator Bar */}
      <div className="p-1.5 flex items-center justify-between bg-white/80 border-b border-neutral-200">
        <span
          className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded ${
            isSelected ? "bg-[#e75325] text-white" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          P.{pageNum}
        </span>

        <div className="flex items-center gap-1">
          {/* Zoom Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoom();
            }}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-black transition"
            title="Inspect page"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Check Circle */}
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
              isSelected
                ? "bg-[#e75325] text-white border-[#e75325]"
                : "border-neutral-300 bg-white"
            }`}
          >
            {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : null}
          </div>
        </div>
      </div>

      {/* Canvas Thumbnail */}
      <div className="relative aspect-[3/4] p-1.5 flex items-center justify-center bg-neutral-100/60 overflow-hidden">
        {!rendered && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-mono text-neutral-400 gap-1 bg-white">
            <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />
            <span>p.{pageNum}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain rounded shadow-xs bg-white transition-opacity duration-200 ${
            rendered ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Dim overlay when unselected */}
        {!isSelected && rendered && (
          <div className="absolute inset-0 bg-white/20 hover:bg-transparent transition" />
        )}
      </div>

      {/* Bottom Status text */}
      <div
        className={`py-1 text-center font-mono text-[10px] font-bold border-t ${
          isSelected
            ? "bg-[#e75325]/10 text-[#e75325] border-[#e75325]/20"
            : "bg-neutral-50 text-neutral-400 border-neutral-100"
        }`}
      >
        {isSelected ? "Selected" : "Tap to select"}
      </div>
    </div>
  );
}
