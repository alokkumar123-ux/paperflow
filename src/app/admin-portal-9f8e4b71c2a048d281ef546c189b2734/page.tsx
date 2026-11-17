"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import {
  ShieldCheck,
  Store,
  Plus,
  Search,
  ExternalLink,
  Printer,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Clock,
  Download,
  DollarSign,
  FileText,
} from "lucide-react";

interface Shop {
  id: string;
  name: string;
  ownerEmail: string;
  rateBw: number;
  rateColor: number;
  duplexDiscount: number;
  isOpen: boolean;
  address?: string;
  createdAt?: any;
}

interface Order {
  id: string;
  shopId: string;
  amount: number;
  status: string;
  createdAt?: any;
}

export default function SuperAdminSecretPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // New shop form state
  const [newShopName, setNewShopName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [newRateBw, setNewRateBw] = useState("2.00");
  const [newRateColor, setNewRateColor] = useState("10.00");
  const [newDiscount, setNewDiscount] = useState("0.10");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time listener for shops
  useEffect(() => {
    const qShops = query(collection(db, "shops"));
    const unsubShops = onSnapshot(qShops, (snapshot) => {
      const items: Shop[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          name: data.name || "Unnamed Shop",
          ownerEmail: data.ownerEmail || data.owner_email || "",
          rateBw: data.rateBw ?? data.rate_bw ?? 2.0,
          rateColor: data.rateColor ?? data.rate_color ?? 10.0,
          duplexDiscount: data.duplexDiscount ?? data.duplex_discount ?? 0.1,
          isOpen: data.isOpen ?? data.is_open ?? true,
          address: data.address || "",
          createdAt: data.createdAt,
        });
      });
      setShops(items);
    });

    const qOrders = query(collection(db, "orders"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const ords: Order[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        ords.push({
          id: d.id,
          shopId: data.shopId || "",
          amount: data.amount || 0,
          status: data.status || "queued",
          createdAt: data.createdAt,
        });
      });
      setOrders(ords);
    });

    return () => {
      unsubShops();
      unsubOrders();
    };
  }, []);

  const handleToggleStatus = async (shop: Shop) => {
    try {
      await updateDoc(doc(db, "shops", shop.id), {
        isOpen: !shop.isOpen,
        is_open: !shop.isOpen,
      });
    } catch (err) {
      console.error("Error toggling shop status:", err);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopName.trim() || !newOwnerEmail.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/create-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newShopName.trim(),
          ownerEmail: newOwnerEmail.trim(),
          ownerPassword: newOwnerPassword.trim(),
          rateBw: parseFloat(newRateBw) || 2.0,
          rateColor: parseFloat(newRateColor) || 10.0,
          duplexDiscount: parseFloat(newDiscount) || 0.1,
        }),
      });

      if (!res.ok) {
        // Fallback to direct client-side Firestore write
        await addDoc(collection(db, "shops"), {
          name: newShopName.trim(),
          ownerEmail: newOwnerEmail.trim(),
          owner_email: newOwnerEmail.trim(),
          ownerPassword: newOwnerPassword.trim(),
          rateBw: parseFloat(newRateBw) || 2.0,
          rate_bw: parseFloat(newRateBw) || 2.0,
          rateColor: parseFloat(newRateColor) || 10.0,
          rate_color: parseFloat(newRateColor) || 10.0,
          duplexDiscount: parseFloat(newDiscount) || 0.1,
          duplex_discount: parseFloat(newDiscount) || 0.1,
          isOpen: true,
          is_open: true,
          createdAt: serverTimestamp(),
        });
      }

      setNewShopName("");
      setNewOwnerEmail("");
      setNewOwnerPassword("");
      setShowAddModal(false);
    } catch (err) {
      console.error("Failed to create shop:", err);
      // Fallback
      try {
        await addDoc(collection(db, "shops"), {
          name: newShopName.trim(),
          ownerEmail: newOwnerEmail.trim(),
          owner_email: newOwnerEmail.trim(),
          ownerPassword: newOwnerPassword.trim(),
          rateBw: parseFloat(newRateBw) || 2.0,
          rateColor: parseFloat(newRateColor) || 10.0,
          duplexDiscount: parseFloat(newDiscount) || 0.1,
          isOpen: true,
          createdAt: serverTimestamp(),
        });
        setNewShopName("");
        setNewOwnerEmail("");
        setNewOwnerPassword("");
        setShowAddModal(false);
      } catch (fallbackErr) {
        alert("Failed to create shop. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadQrCode = (shopId: string, shopName: string) => {
    const canvas = document.getElementById(`qr-${shopId}`) as HTMLCanvasElement;
    if (!canvas) return;
    // Scale up to 512x512 for high-res print quality
    const exportSize = 512;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, exportSize, exportSize);
    const url = exportCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `PaperFlow-QR-${shopName.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  const filteredShops = shops.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalRevenue = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const activeOrders = orders.filter((o) => o.status === "queued" || o.status === "printing");

  return (
    <div className="min-h-screen paper-grid bg-[var(--background)] text-[#191919] flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b-2 border-[#191919] bg-[var(--background)] sticky top-0 z-20">
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
              <h1 className="text-base font-bold tracking-tight text-[#191919] flex items-center gap-2">
                PaperFlow
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#191919] text-white">
                  Super Admin
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 bg-[#e75325] text-white px-3.5 py-1.5 rounded-lg text-xs font-bold border-2 border-[#191919] shadow-[3px_3px_0px_#191919] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#191919] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add New Shop
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* KPI Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[4px_4px_0px_#191919]">
            <div className="flex items-center justify-between text-neutral-500 font-mono text-xs">
              <span>REGISTERED SHOPS</span>
              <Store className="w-4 h-4 text-[#e75325]" />
            </div>
            <div className="text-3xl font-black font-mono mt-2 text-[#191919]">{shops.length}</div>
            <div className="text-[11px] text-neutral-400 mt-1">
              {shops.filter((s) => s.isOpen).length} currently active & open
            </div>
          </div>

          <div className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[4px_4px_0px_#191919]">
            <div className="flex items-center justify-between text-neutral-500 font-mono text-xs">
              <span>ACTIVE QUEUE JOBS</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-3xl font-black font-mono mt-2 text-[#191919]">{activeOrders.length}</div>
            <div className="text-[11px] text-neutral-400 mt-1">Queued or printing across all shops</div>
          </div>

          <div className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[4px_4px_0px_#191919]">
            <div className="flex items-center justify-between text-neutral-500 font-mono text-xs">
              <span>TOTAL ORDERS</span>
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-black font-mono mt-2 text-[#191919]">{orders.length}</div>
            <div className="text-[11px] text-neutral-400 mt-1">Processed platform-wide</div>
          </div>

          <div className="bg-white border-2 border-[#191919] rounded-xl p-5 shadow-[4px_4px_0px_#191919]">
            <div className="flex items-center justify-between text-neutral-500 font-mono text-xs">
              <span>TOTAL REVENUE</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-3xl font-black font-mono mt-2 text-[#e75325]">
              ₹{totalRevenue.toFixed(2)}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">Offline cash transactions</div>
          </div>
        </div>

        {/* Shops Management Table Section */}
        <div className="bg-white border-2 border-[#191919] rounded-xl shadow-[6px_6px_0px_#191919] overflow-hidden">
          {/* Table Header Controls */}
          <div className="p-5 border-b-2 border-[#191919] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-50/50">
            <div>
              <h2 className="text-lg font-black text-[#191919] flex items-center gap-2">
                Managed Print Shops
                <span className="text-xs font-mono font-normal text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded">
                  {filteredShops.length} Total
                </span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Generate instant counter QR codes, adjust rates, and monitor live status.
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search shops or owners..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-[#191919] rounded-lg pl-9 pr-3 py-1.5 text-xs font-medium w-full sm:w-64 focus:outline-none shadow-[2px_2px_0px_#191919]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#191919] text-white font-mono uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Shop Details</th>
                  <th className="py-3 px-4">Owner Email</th>
                  <th className="py-3 px-4">Rates (B&W / Color)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">QR Code</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-sans">
                {filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-400 font-mono">
                      No shops found. Click "Add New Shop" to create your first print shop.
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((shop) => {
                    const shopUrl =
                      typeof window !== "undefined"
                        ? `${window.location.origin}/shop/${shop.id}`
                        : `/shop/${shop.id}`;
                    return (
                      <tr key={shop.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#191919] text-sm">{shop.name}</div>
                          <div className="text-[10px] text-neutral-400 font-mono">ID: {shop.id}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-neutral-600">{shop.ownerEmail}</td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className="font-bold text-neutral-900">₹{shop.rateBw.toFixed(2)}</span> /{" "}
                          <span className="font-bold text-[#e75325]">₹{shop.rateColor.toFixed(2)}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleStatus(shop)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                              shop.isOpen
                                ? "bg-emerald-50 text-emerald-800 border-emerald-400 hover:bg-emerald-100"
                                : "bg-rose-50 text-rose-800 border-rose-400 hover:bg-rose-100"
                            }`}
                          >
                            {shop.isOpen ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-emerald-600" /> OPEN
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 text-rose-600" /> CLOSED
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border-2 border-[#191919] rounded-lg shadow-[2px_2px_0px_#191919] inline-block cursor-pointer hover:shadow-[3px_3px_0px_#e75325] transition-all" onClick={() => downloadQrCode(shop.id, shop.name)} title="Click to download QR Code">
                              <QRCodeCanvas
                                id={`qr-${shop.id}`}
                                value={shopUrl}
                                size={96}
                                level="H"
                                marginSize={1}
                              />
                            </div>
                            <button
                              onClick={() => downloadQrCode(shop.id, shop.name)}
                              className="text-[11px] text-[#191919] font-bold flex items-center gap-1 hover:text-[#e75325] border border-neutral-300 rounded px-2 py-1.5 bg-neutral-50 hover:bg-white cursor-pointer"
                              title="Download Counter QR Code"
                            >
                              <Download className="w-3 h-3" />
                              PNG
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <Link
                            href={`/shop/${shop.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-700 border border-[#191919] px-2.5 py-1 rounded bg-white hover:bg-neutral-100 shadow-[1px_1px_0px_#191919]"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Customer
                          </Link>
                          <Link
                            href={`/dashboard/${shop.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#191919] px-2.5 py-1 rounded hover:bg-neutral-800 shadow-[1px_1px_0px_#191919]"
                          >
                            <Printer className="w-3 h-3" />
                            Dashboard
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Shop Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-[#191919] rounded-2xl max-w-md w-full p-6 shadow-[8px_8px_0px_#191919] space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-black text-lg text-[#191919]">Add New Print Shop</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-black font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShop} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-neutral-700 font-bold mb-1">Shop Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Campus Tech Corner"
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 text-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-bold mb-1">Owner Email</label>
                <input
                  type="email"
                  required
                  placeholder="owner@campus.edu"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 text-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-bold mb-1">Owner Password</label>
                <input
                  type="password"
                  required
                  placeholder="Create owner login password"
                  value={newOwnerPassword}
                  onChange={(e) => setNewOwnerPassword(e.target.value)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 text-neutral-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold mb-1 font-mono text-[11px]">B&amp;W Rate (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newRateBw}
                    onChange={(e) => setNewRateBw(e.target.value)}
                    className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 text-neutral-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold mb-1 font-mono text-[11px]">Color Rate (₹/pg)</label>
                  <input
                    type="number"
                    step="1"
                    value={newRateColor}
                    onChange={(e) => setNewRateColor(e.target.value)}
                    className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg px-3 py-2 text-neutral-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-lg border border-neutral-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 px-3 bg-[#e75325] hover:bg-[#d9481c] text-white font-bold rounded-lg border-2 border-[#191919] shadow-[3px_3px_0px_#191919] cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Create Shop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
