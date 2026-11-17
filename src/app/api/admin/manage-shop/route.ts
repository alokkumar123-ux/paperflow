import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shopId, action } = body;

    if (!shopId) {
      return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    }

    const shopRef = adminDb.collection("shops").doc(shopId);
    const shopDoc = await shopRef.get();

    if (!shopDoc.exists) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (action === "block") {
      await shopRef.update({
        isBlocked: true,
        is_blocked: true,
        updatedAt: new Date(),
      });
      return NextResponse.json({ success: true, message: "Shop blocked successfully", isBlocked: true });
    }

    if (action === "unblock") {
      await shopRef.update({
        isBlocked: false,
        is_blocked: false,
        updatedAt: new Date(),
      });
      return NextResponse.json({ success: true, message: "Shop unblocked successfully", isBlocked: false });
    }

    if (action === "delete") {
      await shopRef.delete();
      return NextResponse.json({ success: true, message: "Shop deleted successfully" });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error("Admin manage shop error:", error);
    return NextResponse.json({ error: error.message || "Failed to update shop" }, { status: 500 });
  }
}
