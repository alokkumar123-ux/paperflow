import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { calculatePrice } from "@/lib/utils";
import { FieldValue, Transaction } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      shopId,
      customerUid,
      files = [],
      fileName,
      filePath,
      fileSize,
      fileDownloadUrl,
      pageCount = 1,
      color = "bw",
      sides = "single",
      copies = 1,
      notes = "",
    } = body;

    if (!shopId) {
      return NextResponse.json({ error: "Missing required shopId" }, { status: 400 });
    }

    const primaryFileName = fileName || (files.length > 0 ? files[0].name : "Document");
    const totalFilesCount = files.length > 0 ? files.length : 1;
    const displayName = totalFilesCount > 1 
      ? `${primaryFileName} (+${totalFilesCount - 1} more)` 
      : primaryFileName;

    const shopRef = adminDb.collection("shops").doc(shopId);
    const shopDoc = await shopRef.get();

    let rateBw = 2.0;
    let rateColor = 10.0;
    let duplexDiscount = 0.1;

    if (shopDoc.exists) {
      const data = shopDoc.data();
      rateBw = data?.rateBw ?? data?.rate_bw ?? 2.0;
      rateColor = data?.rateColor ?? data?.rate_color ?? 10.0;
      duplexDiscount = data?.duplexDiscount ?? data?.duplex_discount ?? 0.1;
    }

    // Recompute price server-side
    const priceDetails = calculatePrice(
      rateBw,
      rateColor,
      duplexDiscount,
      color,
      sides,
      Number(pageCount) || 1,
      Number(copies) || 1
    );

    // Atomic ticket counter using transaction
    const ticketCounterRef = adminDb.collection("counters").doc(`shop_${shopId}`);
    
    let ticketNumber = 1001;

    await adminDb.runTransaction(async (transaction: Transaction) => {
      const counterDoc = await transaction.get(ticketCounterRef);
      if (!counterDoc.exists) {
        transaction.set(ticketCounterRef, { current: 1001 });
        ticketNumber = 1001;
      } else {
        const nextVal = (counterDoc.data()?.current || 1000) + 1;
        transaction.update(ticketCounterRef, { current: nextVal });
        ticketNumber = nextVal;
      }
    });

    const orderRef = adminDb.collection("orders").doc();
    const orderData = {
      id: orderRef.id,
      shopId,
      ticketNumber: `TX-${ticketNumber}`,
      ticketNum: ticketNumber,
      customerUid: customerUid || "anonymous",
      customerName: `Ticket #${ticketNumber}`,
      files: files.length > 0 ? files : [{
        name: primaryFileName,
        url: fileDownloadUrl || "",
        path: filePath || "",
        size: fileSize || 0,
        pageCount: Number(pageCount) || 1,
      }],
      fileName: displayName,
      filePath: filePath || (files[0]?.path || ""),
      fileSize: fileSize || 0,
      fileDownloadUrl: fileDownloadUrl || (files[0]?.url || ""),
      pageCount: Number(pageCount) || 1,
      color,
      sides,
      copies: Number(copies) || 1,
      notes: notes || "",
      subtotal: priceDetails.subtotal,
      discountTotal: priceDetails.discountTotal,
      amount: priceDetails.total,
      paymentStatus: "unpaid",
      status: "queued",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await orderRef.set(orderData);

    return NextResponse.json({
      success: true,
      orderId: orderRef.id,
      ticketNumber: `TX-${ticketNumber}`,
      amount: priceDetails.total,
    });
  } catch (error: any) {
    console.error("Order creation error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
