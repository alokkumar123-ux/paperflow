"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ArrowLeft, Lock, Mail, Store, Loader2 } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Standard Firebase Auth for Shop Owners
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "shops", user.uid), {
          ownerEmail: user.email,
          owner_email: user.email,
          name: "My Print Shop",
          rateBw: 2.0,
          rateColor: 10.0,
          duplexDiscount: 0.15,
          isOpen: true,
          createdAt: new Date(),
        });
        router.push(`/dashboard/${user.uid}`);
      } else {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
          const user = userCredential.user;

          // Find the shop owned by this user
          const q = query(collection(db, "shops"), where("ownerEmail", "==", email.trim().toLowerCase()));
          const snap = await getDocs(q);
          const shopId = !snap.empty ? snap.docs[0].id : user.uid;

          router.push(`/dashboard/${shopId}`);
          return;
        } catch (signInErr: any) {
          // Fallback: Check if shop was registered by Super Admin with this ownerEmail and ownerPassword
          const q = query(
            collection(db, "shops"),
            where("ownerEmail", "==", email.trim().toLowerCase())
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const shopDoc = snap.docs[0];
            const data = shopDoc.data();
            if (data.ownerPassword === password.trim()) {
              // Valid credentials set by Super Admin! Auto-register in Firebase Auth
              try {
                await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
              } catch (regErr) {
                // If user exists, ignore
              }
              router.push(`/dashboard/${shopDoc.id}`);
              return;
            }
          }
          throw signInErr;
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("Invalid email or password. If you don't have an account, click 'Register' below.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please sign in instead.");
      } else {
        setError(err.message || "Authentication failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen paper-grid bg-[var(--background)] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-[#e75325] text-white flex items-center justify-center font-bold text-xl shadow-[2px_2px_0px_#191919]">
              P
            </div>
            <span className="font-black text-2xl tracking-tight text-[#191919]">PaperFlow</span>
          </Link>
          <p className="text-xs text-neutral-500 font-mono">Shop Owner Dashboard Access</p>
        </div>

        {/* Auth Box */}
        <div className="bg-white border-2 border-[#191919] rounded-2xl p-7 shadow-[6px_6px_0px_#191919] space-y-5">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-800 border border-amber-300 flex items-center justify-center">
              <Store className="w-4 h-4 text-[#e75325]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#191919]">
                {isSignUp ? "Register Your Print Shop" : "Shop Owner Sign In"}
              </h2>
              <p className="text-[11px] text-neutral-500">
                {isSignUp ? "Create your account to manage your live queue" : "Sign in to open counter and manage queue"}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-lg font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-700 font-bold mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  required
                  placeholder="owner@yourshop.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg pl-9 pr-3 py-2.5 text-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-700 font-bold mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--background)] border-2 border-[#191919] rounded-lg pl-9 pr-3 py-2.5 text-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#e75325] text-white font-bold rounded-lg border-2 border-[#191919] shadow-[3px_3px_0px_#191919] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#191919] transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignUp ? "Create Shop Account" : "Sign In to Dashboard"}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-[#e75325] font-bold hover:underline"
            >
              {isSignUp ? "Already registered? Sign in" : "New shop? Create an account"}
            </button>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-black transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to PaperFlow Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
