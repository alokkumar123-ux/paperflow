import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      ownerEmail,
      ownerPassword,
      rateBw = 2.0,
      rateColor = 10.0,
      duplexDiscount = 0.1,
    } = body;

    if (!name || !ownerEmail) {
      return NextResponse.json({ error: "Shop Name and Owner Email are required" }, { status: 400 });
    }

    const cleanEmail = ownerEmail.trim().toLowerCase();
    const cleanPassword = (ownerPassword || "password123").trim();

    let ownerUid = "";

    // 1. Try creating Firebase Auth user so the shop owner can log in immediately
    try {
      const userRecord = await adminAuth.createUser({
        email: cleanEmail,
        password: cleanPassword,
        displayName: name.trim(),
      });
      ownerUid = userRecord.uid;
    } catch (authError: any) {
      // If user already exists in Firebase Auth, get existing user UID
      if (authError.code === "auth/email-already-exists") {
        try {
          const existingUser = await adminAuth.getUserByEmail(cleanEmail);
          ownerUid = existingUser.uid;
          // Update password if specified
          if (cleanPassword) {
            await adminAuth.updateUser(ownerUid, { password: cleanPassword });
          }
        } catch (e) {
          console.warn("Could not retrieve existing user:", e);
        }
      } else {
        console.warn("adminAuth.createUser failed (possibly local dev without service account):", authError.message);
      }
    }

    // 2. Create the Shop document in Firestore
    const shopRef = adminDb.collection("shops").doc();
    const shopData = {
      id: shopRef.id,
      name: name.trim(),
      ownerEmail: cleanEmail,
      owner_email: cleanEmail,
      ownerPassword: cleanPassword,
      ownerUid: ownerUid || shopRef.id,
      rateBw: Number(rateBw) || 2.0,
      rate_bw: Number(rateBw) || 2.0,
      rateColor: Number(rateColor) || 10.0,
      rate_color: Number(rateColor) || 10.0,
      duplexDiscount: Number(duplexDiscount) || 0.1,
      duplex_discount: Number(duplexDiscount) || 0.1,
      isOpen: true,
      is_open: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    await shopRef.set(shopData);

    return NextResponse.json({
      success: true,
      shopId: shopRef.id,
      name: name.trim(),
    });
  } catch (error: any) {
    console.error("Create shop error:", error);
    return NextResponse.json({ error: error.message || "Failed to create shop" }, { status: 500 });
  }
}
