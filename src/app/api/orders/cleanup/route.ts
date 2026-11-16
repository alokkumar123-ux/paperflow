import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const data = orderDoc.data();
    const files = Array.isArray(data?.files) ? data.files : [];
    const pathsToDelete: string[] = [
      ...(data?.filePath ? [data.filePath] : []),
      ...files.map((f: any) => f.path).filter(Boolean),
    ];

    // Delete all uploaded files from Firebase Storage
    const bucket = adminStorage.bucket();
    for (const p of pathsToDelete) {
      try {
        const file = bucket.file(p);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
          console.log(`Successfully deleted file from storage: ${p}`);
        }
      } catch (storageErr) {
        console.warn(`File deletion failed or already deleted: ${p}`, storageErr);
      }
    }

    // Update order status to completed and clear file paths
    await orderRef.update({
      status: "completed",
      filePath: null,
      fileDownloadUrl: null,
      files: files.map((f: any) => ({ name: f.name, size: f.size, pageCount: f.pageCount })),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: "Order completed and storage cleaned up" });
  } catch (error: any) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: error.message || "Failed to cleanup order" }, { status: 500 });
  }
}
