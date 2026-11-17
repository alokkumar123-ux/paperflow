"use client";

import { use, useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Printer, ArrowLeft, Loader2, CheckCircle2, FileText, X } from "lucide-react";

interface UploadedFileRef {
  name: string;
  url?: string;
  path?: string;
  size?: number;
  pageCount?: number;
  pageRange?: string;
  totalPages?: number;
}

interface OrderData {
  id: string;
  ticketNumber: string;
  shopId: string;
  fileName: string;
  files?: UploadedFileRef[];
  fileDownloadUrl?: string | null;
  pageCount: number;
  color: "bw" | "color";
  sides: "single" | "duplex";
  copies: number;
  amount: number;
  status: string;
}

export default function AutoPrintPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.orderId;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [printTriggered, setPrintTriggered] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) return;
      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        if (snap.exists()) {
          const d = snap.data();
          const ord: OrderData = {
            id: snap.id,
            ticketNumber: d.ticketNumber || `#TX-${d.ticketNum || 1001}`,
            shopId: d.shopId || "",
            fileName: d.fileName || "document.pdf",
            files: Array.isArray(d.files) ? d.files : [],
            fileDownloadUrl: d.fileDownloadUrl || null,
            pageCount: d.pageCount || 1,
            color: d.color || "bw",
            sides: d.sides || "single",
            copies: d.copies || 1,
            amount: d.amount || 0,
            status: d.status || "queued",
          };
          setOrder(ord);

          // Mark order as printing in Firestore
          await updateDoc(doc(db, "orders", orderId), { status: "printing" }).catch(() => {});
        } else {
          setErrorMsg("Order not found");
        }
      } catch (e: any) {
        console.error(e);
        setErrorMsg("Failed to load order: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  // Determine which file to display
  const activeFileUrl =
    order?.files && order.files.length > selectedFileIdx
      ? order.files[selectedFileIdx]?.url || order.fileDownloadUrl
      : order?.fileDownloadUrl;

  const activeFileName =
    order?.files && order.files.length > selectedFileIdx
      ? order.files[selectedFileIdx]?.name || order.fileName
      : order?.fileName || "document";

  const isPdf =
    activeFileName.toLowerCase().endsWith(".pdf") ||
    activeFileUrl?.toLowerCase().includes(".pdf");

  // Trigger print
  const triggerPrint = () => {
    setPrintTriggered(true);
    if (isPdf && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch (err) {
        console.warn("Iframe print blocked, falling back to window.print", err);
      }
    }
    window.print();
  };

  // Auto trigger print when loaded
  useEffect(() => {
    if (!loading && activeFileUrl && !printTriggered) {
      const timer = setTimeout(() => {
        triggerPrint();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, activeFileUrl, selectedFileIdx]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center gap-3 font-sans">
        <Loader2 className="w-8 h-8 text-[#e75325] animate-spin" />
        <h2 className="font-bold text-sm">Preparing Document for Printer...</h2>
        <p className="text-xs text-neutral-400 font-mono">Connecting to print queue</p>
      </div>
    );
  }

  if (errorMsg || !order || !activeFileUrl) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="bg-neutral-800 border-2 border-rose-500 rounded-2xl p-6 max-w-sm w-full space-y-4">
          <h2 className="text-rose-400 font-bold">Print Error</h2>
          <p className="text-xs text-neutral-300 font-mono">{errorMsg || "No printable file found."}</p>
          <button
            onClick={() => window.close()}
            className="w-full py-2 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-xs font-bold"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  const proxiedUrl = `/api/print/proxy?url=${encodeURIComponent(activeFileUrl)}`;

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col font-sans">
      {/* Top Controller Bar - Hidden when printing */}
      <div className="no-print bg-[#191919] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md border-b-2 border-[#e75325] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-300"
            title="Close Print Tab"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-[#e75325]">
                {order.ticketNumber}
              </span>
              <span className="text-[11px] font-mono font-bold bg-neutral-800 px-2 py-0.5 rounded text-neutral-300 border border-neutral-700">
                {order.copies} {order.copies > 1 ? "Copies" : "Copy"} •{" "}
                {order.color === "color" ? "Color" : "B&W"} •{" "}
                {order.sides === "duplex" ? "Duplex" : "1-Sided"}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono truncate max-w-sm">
              {activeFileName}
            </p>
          </div>
        </div>

        {/* Multi-file switcher if order has multiple files */}
        {order.files && order.files.length > 1 && (
          <div className="flex items-center gap-1.5 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
            <span className="text-[10px] font-mono text-neutral-400 px-1">Files:</span>
            {order.files.map((f, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSelectedFileIdx(idx);
                  setPrintTriggered(false);
                }}
                className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition ${
                  selectedFileIdx === idx
                    ? "bg-[#e75325] text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                #{idx + 1}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={triggerPrint}
            className="px-4 py-2 bg-[#e75325] hover:bg-[#d9481c] text-white font-bold text-xs rounded-xl border border-white/20 shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Open Print Dialog</span>
          </button>
          <button
            onClick={() => window.close()}
            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs rounded-xl border border-neutral-700"
          >
            Done
          </button>
        </div>
      </div>

      {/* Main Document Viewer */}
      <div className="flex-1 w-full flex items-center justify-center p-2 sm:p-4">
        {isPdf ? (
          <iframe
            ref={iframeRef}
            src={proxiedUrl}
            className="w-full h-[88vh] border-0 rounded-lg shadow-lg bg-white print:fixed print:inset-0 print:w-screen print:h-screen print:rounded-none"
            title="Document PDF"
            onLoad={() => {
              // Once iframe is fully loaded, trigger print
              setTimeout(() => {
                triggerPrint();
              }, 600);
            }}
          />
        ) : (
          <div className="max-w-4xl w-full bg-white rounded-xl shadow-lg p-4 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedUrl}
              alt={activeFileName}
              className="max-h-[85vh] w-auto object-contain mx-auto print:max-h-none print:w-full"
              onLoad={() => {
                setTimeout(() => {
                  triggerPrint();
                }, 400);
              }}
            />
          </div>
        )}
      </div>

      {/* Print Specific CSS */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
