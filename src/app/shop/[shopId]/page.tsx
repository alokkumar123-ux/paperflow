"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, db, storage } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Receipt,
  Loader2,
  Trash2,
  Plus,
  Files,
  FileCode,
  Eye,
  Lock,
} from "lucide-react";
import PdfPageSelectorModal from "@/components/PdfPageSelectorModal";
import { calculatePrice, formatFileSize, parsePageRange } from "@/lib/utils";

interface ShopData {
  id: string;
  name: string;
  rateBw: number;
  rateColor: number;
  duplexDiscount: number;
  isOpen: boolean;
  isBlocked?: boolean;
}

interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  totalPages: number; // actual pages detected in file
  pageCount: number;  // effective pages to print (from range)
  pageRange: string;  // e.g. "1-24" or "4-7"
  type: string;
}

export default function ShopCustomerPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const resolvedParams = use(params);
  const shopId = resolvedParams.shopId;
  const router = useRouter();

  const [shop, setShop] = useState<ShopData | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [customerUid, setCustomerUid] = useState<string>("");

  // Multi-file state
  const [fileList, setFileList] = useState<UploadedFileItem[]>([]);
  const [activePdfModalItem, setActivePdfModalItem] = useState<UploadedFileItem | null>(null);

  // Print Specifications
  const [colorMode, setColorMode] = useState<"bw" | "color">("bw");
  const [sides, setSides] = useState<"single" | "duplex">("single");
  const [copies, setCopies] = useState<number>(1);
  const [notes, setNotes] = useState("");

  // Upload & submission progress
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // 1. Silent Anonymous Auth
  useEffect(() => {
    signInAnonymously(auth)
      .then((cred) => {
        setCustomerUid(cred.user.uid);
      })
      .catch((err) => {
        console.warn("Anonymous auth failed, will proceed as guest:", err);
      });
  }, []);

  // 2. Fetch Shop Details in Real-time
  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(
      doc(db, "shops", shopId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setShop({
            id: snap.id,
            name: data.name || "Campus Print Hub",
            rateBw: data.rateBw ?? data.rate_bw ?? 2.0,
            rateColor: data.rateColor ?? data.rate_color ?? 10.0,
            duplexDiscount: data.duplexDiscount ?? data.duplex_discount ?? 0.1,
            isOpen: data.isOpen ?? data.is_open ?? true,
            isBlocked: data.isBlocked ?? data.is_blocked ?? false,
          });
        } else {
          setShop({
            id: shopId,
            name: "Campus Print Hub",
            rateBw: 2.0,
            rateColor: 10.0,
            duplexDiscount: 0.15,
            isOpen: true,
            isBlocked: false,
          });
        }
        setLoadingShop(false);
      },
      () => {
        setShop({
          id: shopId,
          name: "Campus Print Hub",
          rateBw: 2.0,
          rateColor: 10.0,
          duplexDiscount: 0.15,
          isOpen: true,
          isBlocked: false,
        });
        setLoadingShop(false);
      }
    );

    return () => unsub();
  }, [shopId]);

  // Fast page count detection for each file
  const countFilePages = async (f: File): Promise<number> => {
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      try {
        const slice = await f.slice(0, Math.min(f.size, 1024 * 1024 * 5)).arrayBuffer();
        const text = new TextDecoder("latin1").decode(new Uint8Array(slice));
        const matches = text.match(/\/Type\s*\/Page\b/g);
        if (matches && matches.length > 0) {
          return matches.length;
        }
      } catch (e) {
        console.warn("PDF count fallback", e);
      }
      return Math.max(1, Math.min(100, Math.round(f.size / (80 * 1024))));
    }
    // Images & other docs default to 1 page each
    return 1;
  };

  // Handle adding one or multiple files
  const handleFilesAdded = async (filesToAdd: FileList | null) => {
    if (!filesToAdd || filesToAdd.length === 0) return;

    const newItems: UploadedFileItem[] = [];

    for (let i = 0; i < filesToAdd.length; i++) {
      const f = filesToAdd[i];
      const pages = await countFilePages(f);
      newItems.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        file: f,
        name: f.name,
        size: f.size,
        totalPages: pages,
        pageCount: pages,
        pageRange: `1-${pages}`,
        type: f.type,
      });
    }

    setFileList((prev) => [...prev, ...newItems]);
  };

  const removeFile = (id: string) => {
    setFileList((prev) => prev.filter((item) => item.id !== id));
  };

  const updateFilePageRange = (id: string, rangeStr: string) => {
    setFileList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const parsed = parsePageRange(rangeStr, item.totalPages);
        return { ...item, pageRange: rangeStr, pageCount: parsed.count };
      })
    );
  };

  // Aggregate totals
  const totalPages = fileList.reduce((acc, item) => acc + item.pageCount, 0) || 1;
  const totalBytes = fileList.reduce((acc, item) => acc + item.size, 0);

  const currentRateBw = shop?.rateBw ?? 2.0;
  const currentRateColor = shop?.rateColor ?? 10.0;
  const currentDiscount = shop?.duplexDiscount ?? 0.15;

  const priceDetails = calculatePrice(
    currentRateBw,
    currentRateColor,
    currentDiscount,
    colorMode,
    sides,
    fileList.length > 0 ? totalPages : 0,
    copies
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    if (shop.isBlocked) {
      alert("This print shop is currently suspended by the administrator.");
      return;
    }
    if (fileList.length === 0) {
      alert("Please upload at least one document or image to proceed.");
      return;
    }

    setIsSubmitting(true);
    setUploadStatus(`Preparing to upload ${fileList.length} files (${formatFileSize(totalBytes)})...`);
    setUploadProgress(5);
    setUploadedBytes(0);

    try {
      const uploadedResults: Array<{
        name: string;
        url: string;
        path: string;
        size: number;
        pageCount: number;
        pageRange: string;
        totalPages: number;
      }> = [];
      const timestamp = Date.now().toString();

      // Upload each file with aggregate progress tracking
      for (let i = 0; i < fileList.length; i++) {
        const item = fileList[i];
        const storagePath = `orders/${shop.id}/${timestamp}_${i}_${item.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const storageRef = ref(storage, storagePath);
        const prevCompletedBytes = fileList.slice(0, i).reduce((sum, f) => sum + f.size, 0);

        setUploadStatus(`Uploading (${i + 1}/${fileList.length}): ${item.name}`);

        const uploadTask = uploadBytesResumable(storageRef, item.file);

        await new Promise<void>((resolve) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const currentTransferred = prevCompletedBytes + snapshot.bytesTransferred;
              setUploadedBytes(currentTransferred);
              const overallPercent = totalBytes > 0
                ? Math.min(88, Math.round((currentTransferred / totalBytes) * 88))
                : 50;
              setUploadProgress(Math.max(5, overallPercent));
            },
            (err) => {
              console.warn("Storage upload warn:", err);
              resolve();
            },
            () => resolve()
          );
        });

        let downloadUrl = "";
        try {
          downloadUrl = await getDownloadURL(storageRef);
        } catch (e) {
          console.warn("URL retrieval fallback:", e);
        }

        uploadedResults.push({
          name: item.name,
          url: downloadUrl,
          path: storagePath,
          size: item.size,
          pageCount: item.pageCount,
          pageRange: item.pageRange,
          totalPages: item.totalPages,
        });
      }

      setUploadedBytes(totalBytes);
      setUploadProgress(92);
      setUploadStatus("Files saved to cloud! Generating print ticket...");

      // Call API route
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: shop.id,
          customerUid: customerUid || "anonymous",
          files: uploadedResults,
          fileName: uploadedResults[0]?.name || "Document",
          filePath: uploadedResults[0]?.path || "",
          fileSize: totalBytes,
          fileDownloadUrl: uploadedResults[0]?.url || "",
          pageCount: totalPages,
          color: colorMode,
          sides: sides,
          copies: copies,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create order");
      }

      setUploadProgress(100);
      setUploadStatus("Ticket generated! Redirecting...");
      router.push(`/ticket/${data.orderId}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to submit print job. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen paper-grid bg-[var(--background)] text-[#191919] flex flex-col font-sans">
      {/* Mobile-Friendly Sleek Top Header */}
      <header className="border-b-2 border-[#191919] bg-[var(--background)] sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {/* Left: Back Arrow + Shop Name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-[#191919] bg-white text-[#191919] hover:bg-neutral-100 transition shadow-[1px_1px_0px_#191919] shrink-0"
              title="Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md bg-[#e75325] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                P
              </div>
              <h1 className="text-sm font-black text-[#191919] truncate leading-tight">
                {shop?.name || "Campus Print Hub"}
              </h1>
            </div>
          </div>

          {/* Right: Shop Open/Closed Status Badge */}
          <div className="shrink-0">
            {shop?.isBlocked ? (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-rose-600 text-white border-rose-700 shadow-[1px_1px_0px_#191919] flex items-center gap-1">
                <Lock className="w-3 h-3" /> Suspended
              </span>
            ) : (
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${shop?.isOpen
                  ? "bg-emerald-50 text-emerald-800 border-emerald-500 shadow-[1px_1px_0px_#191919]"
                  : "bg-rose-50 text-rose-800 border-rose-500 shadow-[1px_1px_0px_#191919]"
                  }`}
              >
                {shop?.isOpen ? "● Open" : "○ Closed"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content: Single clean mobile column (grid on desktop) */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 space-y-5">
        {shop?.isBlocked ? (
          <div className="bg-white rounded-3xl border-3 border-[#191919] p-8 sm:p-12 text-center space-y-5 shadow-[8px_8px_0px_#191919] animate-in fade-in">
            <div className="w-20 h-20 rounded-2xl bg-rose-100 border-2 border-rose-500 flex items-center justify-center mx-auto text-rose-600 shadow-[4px_4px_0px_#e11d48]">
              <Lock className="w-10 h-10 animate-pulse" />
            </div>
            <div className="space-y-2">
              <span className="font-mono text-xs font-black uppercase tracking-wider px-3 py-1 bg-rose-600 text-white rounded-full">
                Counter Inactive
              </span>
              <h2 className="text-2xl font-black text-[#191919]">Print Counter Suspended</h2>
              <p className="text-xs sm:text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
                This print shop has been temporarily suspended by the campus administrator. Document uploads and new print tickets cannot be submitted at this time.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 border-2 border-[#191919] text-xs font-bold shadow-[2px_2px_0px_#191919] transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Homepage
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
          {/* STEP 1: Upload Documents (Multi-file Support) */}
          <section className="bg-white rounded-2xl border-2 border-[#191919] p-4 sm:p-5 shadow-[4px_4px_0px_#191919] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center font-mono">
                  1
                </span>
                <h2 className="font-black text-sm sm:text-base text-[#191919]">
                  Upload Documents & Images
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded border border-neutral-300">
                PDF / IMAGES
              </span>
            </div>

            {/* Dropzone */}
            <label className="border-2 border-dashed border-neutral-300 hover:border-[#e75325] rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer bg-neutral-50/60 hover:bg-neutral-50 transition-all text-center">
              <div className="w-11 h-11 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-blue-600 shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#191919] block">
                  Tap to upload files (multiple allowed)
                </span>
                <span className="text-[11px] text-neutral-400 font-mono">
                  Select PDFs, Images (JPG, PNG), or Word docs
                </span>
              </div>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => handleFilesAdded(e.target.files)}
              />
            </label>

            {/* Uploaded Files List */}
            {fileList.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-600 px-1">
                  <span>FILES READY ({fileList.length})</span>
                  <span>
                    TOTAL {totalPages} PAGES • <span className="text-[#e75325]">{formatFileSize(totalBytes)}</span>
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {fileList.map((item, idx) => {
                    const isImg = item.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(item.name);
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-neutral-50 border-2 border-[#191919] rounded-xl space-y-2.5 shadow-[2px_2px_0px_#191919]"
                      >
                        {/* Top: Icon + Name + Size + Delete */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-white border border-neutral-300 flex items-center justify-center shrink-0">
                              {isImg ? (
                                <ImageIcon className="w-4 h-4 text-purple-600" />
                              ) : (
                                <FileText className="w-4 h-4 text-blue-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#191919] truncate">
                                {item.name}
                              </p>
                              <p className="text-[10px] text-neutral-500 font-mono">
                                {formatFileSize(item.size)}
                                {item.totalPages > 1 ? ` • ${item.totalPages} pages total` : ""}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            className="p-1.5 text-neutral-400 hover:text-rose-600 transition shrink-0"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Bottom: Visual Page Selection Bar */}
                        {item.totalPages > 1 && (
                          <div className="bg-white border border-neutral-300 rounded-lg p-2.5 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-mono text-xs">
                                <span className="text-neutral-500 font-bold">Selected:</span>
                                <span className="text-[#e75325] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded font-black text-xs">
                                  pp. {item.pageRange} ({item.pageCount} {item.pageCount === 1 ? "page" : "pages"})
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setActivePdfModalItem(item)}
                                className="px-3 py-1.5 bg-[#191919] hover:bg-neutral-800 text-white rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 shadow-[2px_2px_0px_#e75325] transition hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5 text-[#e75325]" />
                                View & Select Pages
                              </button>
                            </div>

                            {/* Secondary fast-typing input with All button */}
                            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-neutral-100 font-mono">
                              <div className="flex items-center gap-1.5 text-neutral-500">
                                <span>Or type range:</span>
                                <input
                                  type="text"
                                  value={item.pageRange}
                                  onChange={(e) => updateFilePageRange(item.id, e.target.value)}
                                  placeholder={`1-${item.totalPages}`}
                                  className="w-24 text-center font-bold border border-neutral-300 rounded px-1.5 py-0.5 bg-neutral-50 focus:bg-white focus:outline-none focus:border-[#191919]"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => updateFilePageRange(item.id, `1-${item.totalPages}`)}
                                className="text-[10px] text-neutral-500 hover:text-black font-bold underline"
                              >
                                Select All ({item.totalPages})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add More Files Button */}
                <label className="w-full py-2 bg-white hover:bg-neutral-50 border-2 border-dashed border-[#191919] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-[#191919] cursor-pointer transition shadow-xs">
                  <Plus className="w-4 h-4 text-[#e75325]" />
                  Add More Files
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => handleFilesAdded(e.target.files)}
                  />
                </label>
              </div>
            )}

            {/* WhatsApp-Style Live Cloud Upload Progress Card */}
            {isSubmitting && (
              <div className="p-3.5 bg-neutral-900 text-white rounded-xl border-2 border-[#191919] shadow-[3px_3px_0px_#e75325] space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="font-bold truncate text-white">{uploadStatus}</span>
                  </div>
                  <span className="font-bold text-emerald-400 font-mono shrink-0">
                    {uploadProgress}%
                  </span>
                </div>

                {/* Progress bar track */}
                <div className="w-full bg-neutral-800 rounded-full h-3 overflow-hidden border border-neutral-700 p-0.5">
                  <div
                    className="bg-gradient-to-r from-[#e75325] to-emerald-500 h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                {/* WhatsApp-style live byte counter */}
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-0.5">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span>☁️ Saving to cloud...</span>
                  </span>
                  <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded border border-white/20">
                    {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: Mobile-Friendly Print Specifications */}
          <section className="bg-white rounded-2xl border-2 border-[#191919] p-4 sm:p-5 shadow-[4px_4px_0px_#191919] space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center font-mono">
                2
              </span>
              <h2 className="font-black text-sm sm:text-base text-[#191919]">Print Specifications</h2>
            </div>

            {/* Color Mode: Clean Full-width Cards */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-500 block">
                COLOR MODE
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setColorMode("bw")}
                  className={`p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer ${colorMode === "bw"
                    ? "border-[#191919] bg-neutral-100 shadow-[3px_3px_0px_#191919]"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs text-[#191919]">Black & White</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 ${colorMode === "bw"
                        ? "border-[#e75325] bg-[#e75325]"
                        : "border-neutral-300 bg-white"
                        }`}
                    />
                  </div>
                  <div className="mt-2 font-mono text-xs font-bold text-neutral-700">
                    ₹{currentRateBw.toFixed(2)}<span className="text-[10px] text-neutral-500 font-normal">/pg</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setColorMode("color")}
                  className={`p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer ${colorMode === "color"
                    ? "border-[#191919] bg-purple-50 shadow-[3px_3px_0px_#191919]"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs text-[#191919]">Full Color</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 ${colorMode === "color"
                        ? "border-[#e75325] bg-[#e75325]"
                        : "border-neutral-300 bg-white"
                        }`}
                    />
                  </div>
                  <div className="mt-2 font-mono text-xs font-bold text-purple-700">
                    ₹{currentRateColor.toFixed(2)}<span className="text-[10px] text-neutral-500 font-normal">/pg</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Printing Sides: Clean Full-width Cards */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-500 block">
                PRINTING SIDES
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSides("single")}
                  className={`p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer ${sides === "single"
                    ? "border-[#191919] bg-neutral-100 shadow-[3px_3px_0px_#191919]"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs text-[#191919]">Single Sided</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 ${sides === "single"
                        ? "border-[#e75325] bg-[#e75325]"
                        : "border-neutral-300 bg-white"
                        }`}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-2">1 page per sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSides("duplex")}
                  className={`p-3 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer ${sides === "duplex"
                    ? "border-[#191919] bg-neutral-100 shadow-[3px_3px_0px_#191919]"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs text-[#191919]">Double Sided</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 ${sides === "duplex"
                        ? "border-[#e75325] bg-[#e75325]"
                        : "border-neutral-300 bg-white"
                        }`}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-2">Front &amp; back (2 pages/sheet)</span>
                </button>
              </div>
            </div>

            {/* Copies Stepper */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-500 block">
                NUMBER OF COPIES
              </label>
              <div className="flex items-center border-2 border-[#191919] rounded-xl overflow-hidden bg-white max-w-[200px] shadow-[2px_2px_0px_#191919]">
                <button
                  type="button"
                  onClick={() => setCopies(Math.max(1, copies - 1))}
                  className="w-12 h-11 flex items-center justify-center font-bold text-lg hover:bg-neutral-100 transition text-[#191919] cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center font-mono font-black text-base text-[#191919]">
                  {copies}
                </span>
                <button
                  type="button"
                  onClick={() => setCopies(copies + 1)}
                  className="w-12 h-11 flex items-center justify-center font-bold text-lg hover:bg-neutral-100 transition text-[#191919] cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Special Instructions (Optional notes - NO customer name/phone) */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-500 block">
                OPERATOR INSTRUCTIONS (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Staple corner, page 2 to 5 only..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-xl px-3 py-2.5 text-xs text-neutral-900 focus:outline-none"
              />
            </div>
          </section>

          {/* STEP 3: Order Summary & Instant Ticket Generation */}
          <section className="bg-white rounded-2xl border-2 border-[#191919] shadow-[5px_5px_0px_#191919] overflow-hidden">
            <div className="bg-[#e75325] text-white p-3.5 border-b-2 border-[#191919] flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider font-mono">
                <Receipt className="w-4 h-4" />
                Price Breakdown
              </div>
              <span className="font-mono text-[10px] bg-white/20 px-2 py-0.5 rounded border border-white/30 font-bold">
                PAY AT COUNTER
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-3 text-xs font-sans">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Total Files:</span>
                <span className="font-bold text-[#191919]">
                  {fileList.length > 0 ? `${fileList.length} files` : "None selected"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Total Upload Size:</span>
                <span className="font-mono font-bold text-[#191919]">
                  {fileList.length > 0 ? formatFileSize(totalBytes) : "0 B"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Total Pages:</span>
                <span className="font-mono font-bold text-[#191919]">
                  {fileList.length > 0 ? `${totalPages} pages` : "0 pages"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500 font-mono">Print Specs:</span>
                <span className="font-bold text-[#191919]">
                  {colorMode === "color" ? "Color" : "B&W"} • {sides === "duplex" ? "Duplex" : "Single"} • {copies}x
                </span>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t-2 border-dashed border-[#191919] flex justify-between items-baseline">
                <div>
                  <div className="text-[11px] font-mono font-bold text-neutral-500 uppercase">
                    Total Due
                  </div>
                  <div className="text-[10px] text-neutral-400">Cash upon collection</div>
                </div>
                <div className="text-3xl font-black text-[#e75325] font-mono tracking-tight">
                  ₹{priceDetails.total.toFixed(2)}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting || fileList.length === 0}
                  className={`w-full py-3.5 px-4 rounded-xl font-black text-sm text-white border-2 border-[#191919] transition-all flex items-center justify-center gap-2 cursor-pointer ${fileList.length === 0
                    ? "bg-neutral-300 text-neutral-500 border-neutral-400 cursor-not-allowed shadow-none"
                    : isSubmitting
                      ? "bg-[#e75325]/70 cursor-wait shadow-none"
                      : "bg-[#e75325] hover:bg-[#d9481c] shadow-[4px_4px_0px_#191919] hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
                    }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span className="font-mono text-xs">
                        Saving {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)} ({uploadProgress}%)
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Submit
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-neutral-400 text-center font-mono pt-1">
                Zero personal data required • Identified by Ticket Number
              </p>
            </div>
          </section>
        </form>
        )}
      </main>

      {/* Visual PDF Page Selector Modal */}
      {activePdfModalItem && (
        <PdfPageSelectorModal
          isOpen={!!activePdfModalItem}
          file={activePdfModalItem.file}
          fileName={activePdfModalItem.name}
          totalPages={activePdfModalItem.totalPages}
          currentRange={activePdfModalItem.pageRange}
          ratePerPage={colorMode === "color" ? currentRateColor : currentRateBw}
          onClose={() => setActivePdfModalItem(null)}
          onApply={(pages, formattedRange) => {
            updateFilePageRange(activePdfModalItem.id, formattedRange);
            setActivePdfModalItem(null);
          }}
        />
      )}
    </div>
  );
}