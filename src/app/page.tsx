"use client";

import Link from "next/link";
import { QrCode, Upload, Banknote, Printer } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen paper-grid bg-[var(--background)] text-[var(--foreground)] flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#e75325] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              P
            </div>
            <span className="font-bold text-xl tracking-tight text-[#191919]">PaperFlow</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/auth"
              className="text-sm font-semibold text-[#191919] hover:opacity-80 transition"
            >
              Shop dashboard
            </Link>
            <Link
              href="/auth"
              className="bg-[#191919] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-black transition shadow-sm"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 lg:py-16 flex flex-col justify-between">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Hero Left Content */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-block font-mono text-xs tracking-widest text-[#d9481c] uppercase font-bold">
              PRINT SHOP OS
            </div>

            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-[#191919] leading-[1.05]">
              No queue at the<br />counter. Just<br />tickets.
            </h1>

            <p className="text-lg text-neutral-600 max-w-md leading-relaxed">
              Customers scan, upload and get a ticket number. You see every job live, take cash, and print.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link
                href="/auth"
                className="px-7 py-3.5 bg-[#e75325] text-white font-bold rounded-lg border-2 border-[#191919] shadow-[4px_4px_0px_#191919] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#191919] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all text-sm"
              >
                Open your shop
              </Link>
            </div>
          </div>

          {/* Hero Right Graphic */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-lg aspect-[4/3] rounded-xl border-2 border-[#191919] bg-[#e86338] shadow-[8px_8px_0px_#191919] overflow-hidden p-6 flex items-center justify-center">
              <svg viewBox="0 0 400 300" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="400" height="300" fill="#e86338" />
                <line x1="0" y1="240" x2="400" y2="240" stroke="#191919" strokeWidth="3" />
                {/* Potted Plant */}
                <path d="M 40 240 L 45 200 L 75 200 L 80 240 Z" fill="#cf4a1e" stroke="#191919" strokeWidth="2.5" />
                <path d="M 60 200 Q 30 150 45 130 Q 60 160 60 200" fill="#1f3b25" stroke="#191919" strokeWidth="2" />
                <path d="M 60 190 Q 90 140 75 120 Q 60 150 60 190" fill="#2d5234" stroke="#191919" strokeWidth="2" />
                {/* Printer Body */}
                <rect x="130" y="100" width="190" height="135" rx="10" fill="#c94218" stroke="#191919" strokeWidth="3" />
                <rect x="150" y="115" width="150" height="40" rx="4" fill="#191919" />
                <circle cx="280" cy="135" r="8" fill="#e86338" />
                <rect x="245" y="130" width="18" height="10" rx="2" fill="#ffd166" />
                <rect x="150" y="168" width="150" height="12" rx="2" fill="#191919" opacity="0.3" />
                {/* Paper output */}
                <rect x="165" y="155" width="120" height="4" rx="1" fill="#fdfaf3" />
                <rect x="170" y="162" width="110" height="4" rx="1" fill="#fdfaf3" opacity="0.7" />
                {/* Paper stack */}
                <rect x="155" y="210" width="140" height="30" rx="3" fill="#fdfaf3" stroke="#191919" strokeWidth="2" />
                <line x1="160" y1="218" x2="290" y2="218" stroke="#191919" strokeWidth="1.5" opacity="0.3" />
                <line x1="160" y1="226" x2="280" y2="226" stroke="#191919" strokeWidth="1.5" opacity="0.3" />
                {/* Smartphone */}
                <rect x="290" y="150" width="55" height="90" rx="8" fill="#191919" stroke="#191919" strokeWidth="2" />
                <rect x="295" y="157" width="45" height="76" rx="4" fill="#fdfaf3" />
                {/* QR code */}
                <rect x="303" y="165" width="29" height="29" rx="2" fill="#191919" />
                <rect x="307" y="169" width="7" height="7" fill="#fdfaf3" />
                <rect x="321" y="169" width="7" height="7" fill="#fdfaf3" />
                <rect x="307" y="183" width="7" height="7" fill="#fdfaf3" />
                <rect x="316" y="176" width="4" height="4" fill="#fdfaf3" />
                <rect x="323" y="181" width="7" height="7" fill="#fdfaf3" />
                <rect x="305" y="202" width="25" height="3" fill="#191919" />
                <rect x="305" y="208" width="16" height="3" fill="#191919" />
                {/* Coffee Mug */}
                <rect x="340" y="215" width="28" height="25" rx="3" fill="#4d2417" stroke="#191919" strokeWidth="2" />
                <path d="M 368 220 C 375 220 375 232 368 232" stroke="#191919" strokeWidth="2" fill="none" />
              </svg>
            </div>
          </div>
        </div>

        {/* 4 Feature Steps */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: QrCode, num: "01", title: "Scan", desc: "Customer scans counter QR" },
            { icon: Upload, num: "02", title: "Upload", desc: "Pick pages, color & copies" },
            { icon: Banknote, num: "03", title: "Pay cash", desc: "Fair, upfront ticket totals" },
            { icon: Printer, num: "04", title: "Collect", desc: "Live queue, zero confusion" },
          ].map(({ icon: Icon, num, title, desc }) => (
            <div
              key={num}
              className="p-5 bg-[var(--card)] rounded-xl border border-[var(--border)] hover:border-[#191919] hover:shadow-[3px_3px_0px_#191919] transition-all flex flex-col justify-between group cursor-default"
            >
              <div className="flex items-center justify-between text-[#e75325] mb-4">
                <Icon className="w-5 h-5" />
                <span className="font-mono text-xs text-neutral-400">{num}</span>
              </div>
              <div>
                <h3 className="font-bold text-[#191919] text-base group-hover:text-[#e75325] transition-colors">
                  {title}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
