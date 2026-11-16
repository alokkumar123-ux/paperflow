"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import {
  FileText,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Files,
  Image as ImageIcon,
} from "lucide-react";

interface UploadedFileRef {
  name: string;
  url?: string;
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
  fileSize?: number;
  pageCount: number;
  color: string;
  sides: string;
  copies: number;
  amount: number;
  notes?: string;
  paymentStatus: string;
  status: "queued" | "printing" | "ready" | "completed";
  createdAt?: any;
}

interface Shop {
  name: string;
}

export default function TicketOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    // Real-time listener for order status
    const unsub = onSnapshot(doc(db, "orders", orderId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const ord: Order = {
          id: snap.id,
          ticketNumber: data.ticketNumber || `#TX-${data.ticketNum || 1001}`,
          shopId: data.shopId || "",
          fileName: data.fileName || "Document",
          files: Array.isArray(data.files) ? data.files : [],
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
        };
        setOrder(ord);

        if (ord.shopId) {
          try {
            const shopSnap = await getDoc(doc(db, "shops", ord.shopId));
            if (shopSnap.exists()) {
              setShop(shopSnap.data() as Shop);
            }
          } catch (e) {
            console.warn(e);
          }
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen paper-grid bg-[var(--background)] flex items-center justify-center p-4">
        <div className="flex items-center gap-2 font-mono text-xs text-neutral-600 bg-white border border-[#191919] p-4 rounded-xl shadow-[4px_4px_0px_#191919]">
          <Loader2 className="w-4 h-4 animate-spin text-[#e75325]" />
          Connecting to counter...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen paper-grid bg-[var(--background)] flex items-center justify-center p-4">
        <div className="bg-white border-2 border-[#191919] rounded-xl p-8 max-w-sm w-full text-center shadow-[6px_6px_0px_#191919] space-y-4 font-sans">
          <AlertCircle className="w-10 h-10 text-[#e75325] mx-auto" />
          <h2 className="text-xl font-black">Ticket Not Found</h2>
          <p className="text-xs text-neutral-500 font-mono">
            Could not locate ticket #{orderId}. Please verify your QR code or submit a new print job.
          </p>
          <Link
            href="/"
            className="inline-block bg-[#191919] text-white px-4 py-2 rounded-lg text-xs font-bold"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const steps = [
    { key: "queued", label: "Queued" },
    { key: "printing", label: "Printing" },
    { key: "ready", label: "Ready" },
    { key: "completed", label: "Collected" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const ticketVerifyUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen paper-grid bg-[var(--background)] text-[#191919] flex flex-col font-sans py-6 px-4">
      <div className="max-w-lg mx-auto w-full space-y-4">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href={`/shop/${order.shopId}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-700 bg-white border border-[#191919] px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#191919] hover:bg-neutral-100 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Print More
          </Link>

          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
            Live Queue Sync
          </div>
        </div>

        {/* Printable Ticket Card */}
        <div className="bg-white border-2 border-[#191919] rounded-2xl shadow-[6px_6px_0px_#191919] overflow-hidden">
          {/* Header Ticket Stub */}
          <div className="bg-[#e75325] text-white p-5 border-b-2 border-[#191919] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono tracking-wider uppercase font-bold text-white/80">
                PRINT TICKET NUMBER
              </div>
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                {order.ticketNumber}
              </div>
              <div className="text-xs text-white/90 font-medium mt-0.5">
                {shop?.name || "Campus Print Hub"}
              </div>
            </div>

            <div className="text-right bg-white/10 backdrop-blur p-2.5 sm:p-3 rounded-xl border border-white/20">
              <div className="text-[10px] font-mono uppercase text-white/80">Cash Total</div>
              <div className="text-2xl font-black font-mono">₹{order.amount.toFixed(2)}</div>
              <div className="text-[10px] text-white/90 mt-0.5 font-mono">
                {order.paymentStatus === "paid_offline" ? "✓ Paid in Cash" : "Pay at counter"}
              </div>
            </div>
          </div>

          {/* Status Stepper */}
          <div className="p-4 sm:p-5 bg-amber-50/50 border-b-2 border-dashed border-[#191919]">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center justify-between">
              <span>Counter Status</span>
              <span className="text-neutral-400 font-normal">Real-time update</span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {steps.map((step, idx) => {
                const isPassed = currentStepIndex >= idx;
                const isCurrent = currentStepIndex === idx;

                return (
                  <div key={step.key} className="space-y-1">
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 mx-auto rounded-full border-2 border-[#191919] flex items-center justify-center font-bold text-xs transition ${
                        isCurrent
                          ? "bg-[#e75325] text-white shadow-[2px_2px_0px_#191919] scale-105"
                          : isPassed
                          ? "bg-emerald-500 text-white"
                          : "bg-white text-neutral-400"
                      }`}
                    >
                      {isPassed && !isCurrent ? "✓" : idx + 1}
                    </div>
                    <div
                      className={`text-[10px] sm:text-[11px] font-bold ${
                        isCurrent ? "text-[#e75325]" : isPassed ? "text-[#191919]" : "text-neutral-400"
                      }`}
                    >
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ticket Details */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="space-y-2 text-xs">
              {/* Document / Files summary */}
              <div className="py-1 border-b border-neutral-100">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-neutral-500 font-mono">Uploaded Documents:</span>
                  <span className="font-bold text-[#191919] text-right truncate max-w-[200px]">
                    {order.fileName}
                  </span>
                </div>
                {order.files && order.files.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {order.files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] text-neutral-600 bg-neutral-50 p-1.5 rounded border border-neutral-200">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <FileText className="w-3 h-3 text-[#e75325] shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 font-mono">
                          {f.pageRange && f.totalPages && f.totalPages > 1 ? (
                            <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] font-bold">
                              pp. {f.pageRange} ({f.pageCount || 1}p)
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-[10px]">{f.pageCount || 1}p</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Pages & Copies</span>
                <span className="font-bold text-[#191919]">
                  {order.pageCount} pages × {order.copies} {order.copies > 1 ? "copies" : "copy"}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Color & Sides</span>
                <span className="font-bold text-[#191919]">
                  {order.color.toUpperCase()} • {order.sides === "duplex" ? "Duplex" : "Single-Sided"}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Payment</span>
                <span
                  className={`font-mono font-bold ${
                    order.paymentStatus === "paid_offline" ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {order.paymentStatus === "paid_offline" ? "PAID (CASH)" : "UNPAID (PAY AT COUNTER)"}
                </span>
              </div>

              {order.notes && (
                <div className="flex justify-between py-1 border-b border-neutral-100">
                  <span className="text-neutral-500 font-mono">Notes</span>
                  <span className="font-bold text-amber-800">{order.notes}</span>
                </div>
              )}
            </div>

            {/* QR Code Counter Verification */}
            <div className="pt-2 flex items-center justify-between bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <div>
                <div className="text-xs font-bold text-[#191919]">Show Ticket at Counter</div>
                <div className="text-[11px] text-neutral-500">
                  Operator will call: <strong>{order.ticketNumber}</strong>
                </div>
              </div>
              <div className="w-14 h-14 bg-white p-1 rounded-lg border-2 border-[#191919] shadow-[2px_2px_0px_#191919] flex items-center justify-center shrink-0">
                {ticketVerifyUrl && (
                  <QRCodeCanvas value={ticketVerifyUrl} size={48} level="M" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
