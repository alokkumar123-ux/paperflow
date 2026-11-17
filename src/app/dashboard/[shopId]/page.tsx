"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  getDocs,
} from "firebase/firestore";
import {
  Store,
  Printer,
  Clock,
  CheckCircle2,
  FileText,
  User,
  ArrowLeft,
  RefreshCw,
  Sliders,
  ExternalLink,
  Save,
  Download,
  Banknote,
  Sparkles,
  AlertTriangle,
  X,
  Loader2,
  WifiOff,
  Lock,
} from "lucide-react";

interface UploadedFileRef {
  name: string;
  url?: string;
  path?: string;
  size?: number;
  pageCount?: number;
  pageRange?: string;
  totalPages?: number;
}

interface Order {
  id: string;
  ticketNumber: string;
  shopId: string;
  fileName: string;
  files?: UploadedFileRef[];
  filePath?: string | null;
  fileDownloadUrl?: string | null;
  fileSize?: number;
  pageCount: number;
  color: "bw" | "color";
  sides: "single" | "duplex";
  copies: number;
  amount: number;
  notes?: string;
  paymentStatus: "unpaid" | "paid_offline";
  status: "queued" | "printing" | "ready" | "completed";
  createdAt?: any;
}

interface Shop {
  id: string;
  name: string;
  isOpen: boolean;
  isBlocked?: boolean;
  rateBw: number;
  rateColor: number;
  duplexDiscount: number;
}

export default function DashboardShopPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const resolvedParams = use(params);
  const shopId = resolvedParams.shopId;

  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isEditingRates, setIsEditingRates] = useState(false);

  // Rate editor state
  const [rateBw, setRateBw] = useState(2.0);
  const [rateColor, setRateColor] = useState(10.0);
  const [duplexDiscount, setDuplexDiscount] = useState(0.15);

  // Printer status & modal state
  const [checkingPrinterForOrderId, setCheckingPrinterForOrderId] = useState<string | null>(null);
  const [printerModal, setPrinterModal] = useState<{
    isOpen: boolean;
    order: Order | null;
    message: string;
    offlinePrinters: any[];
    virtualPrinters: any[];
    defaultPrinter: string | null;
  } | null>(null);
  const [printSuccessToast, setPrintSuccessToast] = useState<string | null>(null);

  // 1. Fetch & Listen to Shop
  useEffect(() => {
    if (!shopId) return;

    if (shopId === "default") {
      // Find first shop or create listener
      const q = query(collection(db, "shops"));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data = first.data();
          setCurrentShop({
            id: first.id,
            name: data.name || "Main Print Shop",
            isOpen: data.isOpen ?? data.is_open ?? true,
            isBlocked: data.isBlocked ?? data.is_blocked ?? false,
            rateBw: data.rateBw ?? data.rate_bw ?? 2.0,
            rateColor: data.rateColor ?? data.rate_color ?? 10.0,
            duplexDiscount: data.duplexDiscount ?? data.duplex_discount ?? 0.15,
          });
          setRateBw(data.rateBw ?? data.rate_bw ?? 2.0);
          setRateColor(data.rateColor ?? data.rate_color ?? 10.0);
          setDuplexDiscount(data.duplexDiscount ?? data.duplex_discount ?? 0.15);
        } else {
          setCurrentShop({
            id: "default",
            name: "Campus Print Hub",
            isOpen: true,
            isBlocked: false,
            rateBw: 2.0,
            rateColor: 10.0,
            duplexDiscount: 0.15,
          });
        }
      });
      return () => unsub();
    } else {
      const unsub = onSnapshot(doc(db, "shops", shopId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCurrentShop({
            id: snap.id,
            name: data.name || "Print Shop",
            isOpen: data.isOpen ?? data.is_open ?? true,
            isBlocked: data.isBlocked ?? data.is_blocked ?? false,
            rateBw: data.rateBw ?? data.rate_bw ?? 2.0,
            rateColor: data.rateColor ?? data.rate_color ?? 10.0,
            duplexDiscount: data.duplexDiscount ?? data.duplex_discount ?? 0.15,
          });
          setRateBw(data.rateBw ?? data.rate_bw ?? 2.0);
          setRateColor(data.rateColor ?? data.rate_color ?? 10.0);
          setDuplexDiscount(data.duplexDiscount ?? data.duplex_discount ?? 0.15);
        } else {
          setCurrentShop({
            id: shopId,
            name: "Campus Print Hub",
            isOpen: true,
            isBlocked: false,
            rateBw: 2.0,
            rateColor: 10.0,
            duplexDiscount: 0.15,
          });
        }
      });
      return () => unsub();
    }
  }, [shopId]);

  // 2. Real-time Firestore Queue Listener
  useEffect(() => {
    const targetShopId = currentShop?.id || shopId;
    if (!targetShopId) return;

    let q;
    if (targetShopId === "default") {
      q = query(collection(db, "orders"));
    } else {
      q = query(collection(db, "orders"), where("shopId", "==", targetShopId));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const ords: Order[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        ords.push({
          id: d.id,
          ticketNumber: data.ticketNumber || `#TX-${data.ticketNum || 1001}`,
          shopId: data.shopId || "",
          fileName: data.fileName || "document.pdf",
          files: Array.isArray(data.files) ? data.files : [],
          filePath: data.filePath,
          fileDownloadUrl: data.fileDownloadUrl,
          fileSize: data.fileSize,
          pageCount: data.pageCount || 1,
          color: data.color || "bw",
          sides: data.sides || "single",
          copies: data.copies || 1,
          amount: data.amount || 0,
          notes: data.notes,
          paymentStatus: data.paymentStatus || "unpaid",
          status: data.status || "queued",
          createdAt: data.createdAt,
        });
      });

      // Sort client-side by status or date
      ords.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(ords);
    });

    return () => unsub();
  }, [currentShop?.id, shopId]);

  const handleToggleOpen = async () => {
    if (!currentShop) return;
    try {
      await updateDoc(doc(db, "shops", currentShop.id), {
        isOpen: !currentShop.isOpen,
        is_open: !currentShop.isOpen,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop) return;
    try {
      await updateDoc(doc(db, "shops", currentShop.id), {
        rateBw,
        rate_bw: rateBw,
        rateColor,
        rate_color: rateColor,
        duplexDiscount,
        duplex_discount: duplexDiscount,
      });
      setIsEditingRates(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update rates");
    }
  };

  // Status transitions
  const handleStatusChange = async (orderId: string, newStatus: Order["status"]) => {
    try {
      if (newStatus === "completed") {
        // Trigger server cleanup to delete file from Firebase Storage
        await fetch("/api/orders/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
      } else {
        await updateDoc(doc(db, "orders", orderId), {
          status: newStatus,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmCash = async (orderId: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        paymentStatus: "paid_offline",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartPrinting = async (order: Order) => {
    setCheckingPrinterForOrderId(order.id);
    try {
      // 1. Check system printer status
      const res = await fetch("/api/print/status");
      const data = await res.json();

      if (!data.hasConnectedPrinter) {
        // Physical printer not connected!
        setPrinterModal({
          isOpen: true,
          order,
          message: data.message || "No physical printer connected to this computer",
          offlinePrinters: data.offlinePrinters || [],
          virtualPrinters: data.virtualPrinters || [],
          defaultPrinter: data.defaultPrinter,
        });
        setCheckingPrinterForOrderId(null);
        return;
      }

      // 2. Physical printer is connected! Dispatch print spool automatically
      const fileToPrint = order.fileDownloadUrl || order.files?.[0]?.url;
      if (fileToPrint) {
        await fetch("/api/print/spool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            fileName: order.fileName,
            fileUrl: fileToPrint,
          }),
        });
      }

      // Update status to printing
      await handleStatusChange(order.id, "printing");
      setPrintSuccessToast(
        `Print job dispatched to ${data.connectedPrinters[0]?.name || "default printer"}!`
      );
      setTimeout(() => setPrintSuccessToast(null), 5000);
    } catch (err: any) {
      console.error("Print error:", err);
      setPrinterModal({
        isOpen: true,
        order,
        message: "Failed to connect to local printer spooler.",
        offlinePrinters: [],
        virtualPrinters: [],
        defaultPrinter: null,
      });
    } finally {
      setCheckingPrinterForOrderId(null);
    }
  };

  const printViaBrowser = (order: Order) => {
    const fileUrl = order.fileDownloadUrl || order.files?.[0]?.url;
    if (!fileUrl) {
      alert("No file available to print.");
      return;
    }

    // Advance status to printing
    handleStatusChange(order.id, "printing");
    setPrinterModal(null);

    // Trigger browser print dialog directly without manual downloading
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = fileUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.open(fileUrl, "_blank");
      }
    };
    document.body.appendChild(iframe);
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === "all") return true;
    return o.status === statusFilter;
  });

  const queuedCount = orders.filter((o) => o.status === "queued").length;
  const printingCount = orders.filter((o) => o.status === "printing").length;
  const readyCount = orders.filter((o) => o.status === "ready").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;

  return (
    <div className={`min-h-screen paper-grid bg-[var(--background)] text-[#191919] flex flex-col font-sans relative ${currentShop?.isBlocked ? "overflow-hidden" : ""}`}>
      {/* Blocked / Suspended Overlay */}
      {currentShop?.isBlocked && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border-4 border-[#191919] rounded-3xl max-w-lg w-full p-8 shadow-[12px_12px_0px_#191919] text-center space-y-6 animate-in zoom-in-95">
            <div className="mx-auto w-24 h-24 rounded-3xl bg-rose-100 border-3 border-rose-500 flex items-center justify-center shadow-[6px_6px_0px_#e11d48]">
              <Lock className="w-12 h-12 text-rose-600 animate-pulse" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white font-mono text-[11px] font-black uppercase tracking-wider shadow-xs">
                <span>●</span> Dashboard Locked
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-[#191919] tracking-tight">
                Shop Access Blocked
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed max-w-sm mx-auto">
                The operations for <strong className="text-[#191919]">{currentShop?.name}</strong> have been suspended by the platform administrator. Access to the queue and printing is locked.
              </p>
            </div>

            <div className="p-4 bg-neutral-50 border-2 border-neutral-200 rounded-2xl text-xs font-mono space-y-1.5 text-left">
              <div className="flex justify-between items-center text-neutral-500">
                <span>Shop:</span>
                <span className="font-bold text-[#191919]">{currentShop?.name}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-500">
                <span>Shop ID:</span>
                <span className="font-bold text-neutral-700">{currentShop?.id}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-500">
                <span>Status:</span>
                <span className="font-bold text-rose-600 uppercase">Suspended by Admin</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/"
                className="w-full sm:w-auto px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-[#191919] font-bold text-xs rounded-xl border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition text-center"
              >
                Return to Home
              </Link>
              <a
                href="mailto:support@paperflow.com"
                className="w-full sm:w-auto px-5 py-2.5 bg-[#e75325] hover:bg-[#d9481c] text-white font-bold text-xs rounded-xl border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition flex items-center justify-center gap-1.5 text-center"
              >
                Contact Administrator
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Blurred Wrapper when blocked */}
      <div className={`flex flex-col flex-1 ${currentShop?.isBlocked ? "filter blur-sm pointer-events-none select-none transition-all duration-300" : ""}`}>
      {/* Top Header */}
      <header className="bg-[var(--background)] border-b-2 border-[#191919] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[#191919] font-semibold text-xs flex items-center gap-1.5 border border-[#191919] px-2.5 py-1 rounded bg-white hover:bg-neutral-100 transition shadow-[2px_2px_0px_#191919]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </Link>
            <div className="h-4 w-px bg-neutral-300" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#e75325] text-white flex items-center justify-center font-bold text-sm">
                P
              </div>
              <div>
                <h1 className="text-base font-bold text-[#191919] flex items-center gap-2">
                  {currentShop?.name || "Shop Dashboard"}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      currentShop?.isOpen
                        ? "bg-emerald-50 text-emerald-800 border-emerald-400"
                        : "bg-rose-50 text-rose-800 border-rose-400"
                    }`}
                  >
                    {currentShop?.isOpen ? "● OPEN" : "○ CLOSED"}
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleOpen}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#191919] transition shadow-[2px_2px_0px_#191919] ${
                currentShop?.isOpen
                  ? "bg-rose-50 text-rose-800 hover:bg-rose-100"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              {currentShop?.isOpen ? "Close Shop" : "Open Shop"}
            </button>
            <button
              onClick={() => setIsEditingRates(!isEditingRates)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#191919] bg-white hover:bg-neutral-100 transition shadow-[2px_2px_0px_#191919] flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              Rates
            </button>
            {currentShop && (
              <Link
                href={`/shop/${currentShop.id}`}
                target="_blank"
                className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#191919] bg-[#e75325] text-white hover:bg-[#d9481c] transition shadow-[2px_2px_0px_#191919] flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Customer QR View
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
        {/* Rate Editor Panel (Collapsible) */}
        {isEditingRates && (
          <div className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[5px_5px_0px_#191919] space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <h3 className="font-black text-sm text-[#191919]">Shop Rate Configuration</h3>
              <button
                onClick={() => setIsEditingRates(false)}
                className="text-neutral-400 hover:text-black font-bold text-xs"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSaveRates} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end text-xs">
              <div>
                <label className="block text-neutral-600 font-bold mb-1 font-mono">B&amp;W Rate (₹/page)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rateBw}
                  onChange={(e) => setRateBw(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-neutral-600 font-bold mb-1 font-mono">Color Rate (₹/page)</label>
                <input
                  type="number"
                  step="1"
                  value={rateColor}
                  onChange={(e) => setRateColor(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 font-mono font-bold"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#e75325] text-white font-bold rounded-lg border-2 border-[#191919] shadow-[2px_2px_0px_#191919] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Rates
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Counter Summary / Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#191919] pb-3">
          {[
            { key: "all", label: "All Orders", count: orders.length },
            { key: "queued", label: "Queued", count: queuedCount, color: "text-amber-700 bg-amber-50" },
            { key: "printing", label: "Printing", count: printingCount, color: "text-blue-700 bg-blue-50" },
            { key: "ready", label: "Ready", count: readyCount, color: "text-emerald-700 bg-emerald-50" },
            { key: "completed", label: "Completed", count: completedCount, color: "text-neutral-500 bg-neutral-100" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border-2 transition flex items-center gap-2 ${
                statusFilter === tab.key
                  ? "bg-[#191919] text-white border-[#191919] shadow-[2px_2px_0px_#e75325]"
                  : "bg-white text-neutral-700 border-neutral-300 hover:border-black"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full border border-black/10 ${
                  tab.color || "bg-white text-black"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Live Queue Job Grid */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white border-2 border-[#191919] rounded-xl p-12 text-center shadow-[4px_4px_0px_#191919] space-y-2">
            <Printer className="w-10 h-10 text-neutral-300 mx-auto" />
            <h3 className="font-black text-sm text-neutral-800">No print jobs in this view</h3>
            <p className="text-xs text-neutral-500 font-mono">
              Jobs will appear live instantly when customers scan your counter QR code.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[5px_5px_0px_#191919] flex flex-col justify-between space-y-4 hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                <div className="space-y-3">
                  {/* Top card bar: Ticket Number & Status Badge */}
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
                    <span className="font-black font-mono text-base text-[#e75325]">
                      {order.ticketNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                          order.status === "queued"
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : order.status === "printing"
                            ? "bg-blue-100 text-blue-900 border-blue-300 animate-pulse"
                            : order.status === "ready"
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : "bg-neutral-100 text-neutral-600 border-neutral-300"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Order Specs & Files */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-1.5 text-neutral-800">
                      <FileText className="w-3.5 h-3.5 text-[#e75325] mt-0.5 shrink-0" />
                      <span className="font-mono text-[11px] font-bold break-all">{order.fileName}</span>
                    </div>

                    {/* Multiple files list with download links and page range badges */}
                    {order.files && order.files.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {order.files.map((fileItem, fIdx) => (
                          <div
                            key={fIdx}
                            className="bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold truncate max-w-[190px]">{fileItem.name}</span>
                              {fileItem.url ? (
                                <a
                                  href={fileItem.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#e75325] hover:underline font-bold font-mono ml-2 shrink-0 flex items-center gap-0.5 bg-white border border-[#191919] px-2 py-0.5 rounded shadow-[1px_1px_0px_#191919]"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </a>
                              ) : null}
                            </div>
                            {fileItem.pageRange && fileItem.totalPages && fileItem.totalPages > 1 ? (
                              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.5 rounded">
                                  Print pp. {fileItem.pageRange}
                                </span>
                                <span className="text-neutral-500">
                                  ({fileItem.pageCount || 1} of {fileItem.totalPages} pages)
                                </span>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="bg-neutral-100 border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                        {order.pageCount} Pages
                      </span>
                      <span className="bg-neutral-100 border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                        {order.copies} {order.copies > 1 ? "Copies" : "Copy"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                          order.color === "color"
                            ? "bg-purple-50 text-purple-800 border-purple-300"
                            : "bg-neutral-100 text-neutral-700 border-neutral-300"
                        }`}
                      >
                        {order.color === "color" ? "Color" : "B&W"}
                      </span>
                      <span className="bg-neutral-100 border border-neutral-300 text-neutral-700 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                        {order.sides === "duplex" ? "Duplex" : "1-Sided"}
                      </span>
                    </div>

                    {order.notes && (
                      <div className="mt-2 p-2 bg-amber-50 text-amber-900 rounded border border-amber-200 text-[11px]">
                        <strong>Note:</strong> {order.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Card Controls: Payment status, download link, status action */}
                <div className="pt-3 border-t border-neutral-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-mono font-bold">
                        Cash Total
                      </div>
                      <div className="text-xl font-black text-[#191919] font-mono">
                        ₹{order.amount.toFixed(2)}
                      </div>
                    </div>

                    {/* Offline Cash Status Badge / Action */}
                    <div>
                      {order.paymentStatus === "paid_offline" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-1 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Cash Received
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConfirmCash(order.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-400 px-2.5 py-1 rounded transition shadow-sm"
                        >
                          <Banknote className="w-3.5 h-3.5 text-amber-700" /> Confirm Cash
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions Row: Direct CDN Download + Status Button */}
                  <div className="flex items-center gap-2 pt-1">
                    {order.fileDownloadUrl ? (
                      <a
                        href={order.fileDownloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 border-2 border-[#191919] bg-neutral-100 hover:bg-white text-neutral-800 rounded-lg shadow-[2px_2px_0px_#191919] transition"
                        title="Download Document"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-neutral-400 font-mono italic">
                        {order.status === "completed" ? "Cleaned up" : "Storage upload"}
                      </span>
                    )}

                    <div className="flex-1 flex justify-end">
                      {order.status === "queued" && (
                        <button
                          onClick={() => handleStartPrinting(order)}
                          disabled={checkingPrinterForOrderId === order.id}
                          className="w-full bg-[#191919] hover:bg-neutral-800 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition flex items-center justify-center gap-1.5 hover:translate-x-0.5 hover:translate-y-0.5"
                        >
                          {checkingPrinterForOrderId === order.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e75325]" /> Checking Printer...
                            </>
                          ) : (
                            <>
                              <Printer className="w-3.5 h-3.5 text-[#e75325]" /> Start Printing
                            </>
                          )}
                        </button>
                      )}

                      {order.status === "printing" && (
                        <button
                          onClick={() => handleStatusChange(order.id, "ready")}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready
                        </button>
                      )}

                      {order.status === "ready" && (
                        <button
                          onClick={() => handleStatusChange(order.id, "completed")}
                          className="w-full bg-[#e75325] hover:bg-[#d9481c] text-white px-3 py-2 rounded-lg text-xs font-bold border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition flex items-center justify-center gap-1.5"
                        >
                          Deliver & Cleanup
                        </button>
                      )}

                      {order.status === "completed" && (
                        <span className="text-xs text-neutral-500 font-bold flex items-center gap-1 py-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Delivered
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/ticket/${order.id}`}
                      target="_blank"
                      className="p-2 border border-[#191919] bg-white text-neutral-700 hover:bg-neutral-100 rounded-lg shadow-[1px_1px_0px_#191919]"
                      title="View Customer Ticket"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {printSuccessToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#191919] text-white border-2 border-emerald-500 rounded-xl px-4 py-3 shadow-[4px_4px_0px_#191919] flex items-center gap-2.5 text-xs font-mono animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{printSuccessToast}</span>
        </div>
      )}

      {/* Printer Not Connected Modal */}
      {printerModal && printerModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--background)] border-3 border-[#191919] rounded-2xl w-full max-w-md shadow-[8px_8px_0px_#191919] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-rose-50 border-b-2 border-[#191919] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#191919]">Printer is Not Connected</h3>
                  <p className="text-[10px] text-neutral-500 font-mono">
                    {printerModal.order?.ticketNumber} • {printerModal.order?.fileName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPrinterModal(null)}
                className="p-1.5 rounded-lg border border-[#191919] bg-white hover:bg-neutral-100 transition shadow-[1px_1px_0px_#191919]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 text-xs font-sans">
              <div className="bg-white border-2 border-[#191919] rounded-xl p-3.5 space-y-2 shadow-[2px_2px_0px_#191919]">
                <div className="flex items-start gap-2">
                  <WifiOff className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="text-neutral-800">
                    <p className="font-bold text-xs">{printerModal.message}</p>
                    <p className="text-[11px] text-neutral-500 font-mono mt-1">
                      No physical printer (e.g. HP, Canon, Epson, Brother via USB or Wi-Fi) is currently online and ready to print.
                    </p>
                  </div>
                </div>

                {printerModal.defaultPrinter && (
                  <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-neutral-400">Current Default:</span>
                    <span className="font-bold text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded">
                      {printerModal.defaultPrinter}
                    </span>
                  </div>
                )}
              </div>

              {/* Troubleshooting Checklist */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1.5 text-[11px] font-mono text-neutral-600">
                <span className="font-bold text-neutral-800 block text-xs">Troubleshooting Steps:</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-[10px]">1</span>
                  <span>Plug in your printer&apos;s USB cable or connect Wi-Fi</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-[10px]">2</span>
                  <span>Turn ON your physical printer power switch</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-[10px]">3</span>
                  <span>Ensure paper tray has sheets loaded</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Check Again Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (printerModal.order) {
                      handleStartPrinting(printerModal.order);
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-[#e75325] hover:bg-[#d9481c] text-white font-black text-xs rounded-xl border-2 border-[#191919] shadow-[3px_3px_0px_#191919] transition flex items-center justify-center gap-2 hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Check Connection &amp; Print Again
                </button>

                {/* Print via Browser Dialog Anyway */}
                <button
                  type="button"
                  onClick={() => {
                    if (printerModal.order) {
                      printViaBrowser(printerModal.order);
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-white hover:bg-neutral-100 text-[#191919] font-bold text-xs rounded-xl border-2 border-[#191919] shadow-[2px_2px_0px_#191919] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  Print via Browser Dialog (No Download Needed)
                </button>

                <button
                  type="button"
                  onClick={() => setPrinterModal(null)}
                  className="w-full py-2 text-center text-xs font-mono text-neutral-500 hover:text-black cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
