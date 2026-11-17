import fs from "fs";
import path from "path";
import http from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const execAsync = promisify(exec);

// Initialize Firebase Admin
if (getApps().length === 0) {
  let serviceAccount = null;

  const localKeyPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(localKeyPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
    } catch (_) {}
  }

  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (_) {}
  }

  if (serviceAccount) {
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bola-f035f.firebasestorage.app",
    });
  } else {
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bola-f035f",
    });
  }
}

const db = getFirestore();
const BASE_DIR = process.cwd();
const SUMATRA_EXE = fs.existsSync(path.join(BASE_DIR, "SumatraPDF.exe"))
  ? path.join(BASE_DIR, "SumatraPDF.exe")
  : fs.existsSync(path.join(BASE_DIR, "bin", "SumatraPDF.exe"))
  ? path.join(BASE_DIR, "bin", "SumatraPDF.exe")
  : "D:\\paperflow\\bin\\SumatraPDF.exe";

const TEMP_DIR = path.join(BASE_DIR, "temp_prints");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 0. Check for shop-id.txt to filter for specific shop
let targetShopId = null;
const shopIdPath = path.join(BASE_DIR, "shop-id.txt");
if (fs.existsSync(shopIdPath)) {
  targetShopId = fs.readFileSync(shopIdPath, "utf8").trim();
  if (targetShopId) {
    console.log(`🎯 Locked to Shop ID: ${targetShopId}`);
  }
}

// Track active print jobs to avoid duplicate spooling
const printingJobIds = new Set();

async function printDocument(orderId, orderData) {
  if (printingJobIds.has(orderId)) return;
  printingJobIds.add(orderId);

  const ticket = orderData.ticketNumber || `#TX-${orderId.slice(0, 5)}`;
  console.log(`\n==================================================`);
  console.log(`🖨️  NEW PRINT JOB: ${ticket}`);
  console.log(`   Document: ${orderData.fileName || "document"}`);
  console.log(`   Copies: ${orderData.copies || 1} | Color: ${orderData.color || "bw"}`);
  console.log(`==================================================`);

  try {
    // 1. Identify file URL
    const fileUrl =
      orderData.fileDownloadUrl ||
      orderData.files?.[0]?.url ||
      orderData.filePath;

    if (!fileUrl) {
      throw new Error("No file URL found in order");
    }

    // 2. Download file to local temp
    const safeName = (orderData.fileName || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const localFilePath = path.join(TEMP_DIR, `${Date.now()}_${safeName}`);

    console.log(`⏳ Downloading document from cloud...`);
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
    console.log(`✅ Download complete: ${localFilePath}`);

    // 3. Build SumatraPDF Silent Print Command
    const copies = orderData.copies || 1;
    const isColor = orderData.color === "color";
    const isDuplex = orderData.sides === "duplex";

    const settingsArr = [];
    if (copies > 1) settingsArr.push(`${copies}x`);
    if (isColor) settingsArr.push("color");
    else settingsArr.push("monochrome");
    if (isDuplex) settingsArr.push("duplex");
    else settingsArr.push("simplex");

    const settingsStr = settingsArr.join(",");

    let printCmd;
    if (fs.existsSync(SUMATRA_EXE)) {
      printCmd = `"${SUMATRA_EXE}" -print-to-default -print-settings "${settingsStr}" -silent "${localFilePath}"`;
    } else {
      printCmd = `powershell -NoProfile -Command "Start-Process -FilePath '${localFilePath}' -Verb Print"`;
    }

    console.log(`🚀 Dispatching silent print to default printer (Canon G2010 series)...`);
    console.log(`   Command: ${printCmd}`);

    await execAsync(printCmd, { timeout: 15000 });
    console.log(`🎉 SUCCESS! Ticket ${ticket} sent to Canon printer with ZERO dialogs!`);

    // 4. Update order in Firestore to 'ready'
    await db.collection("orders").doc(orderId).update({
      status: "ready",
      printedAt: FieldValue.serverTimestamp(),
      printedSilently: true,
    });

    // Cleanup temp file after 30 seconds
    setTimeout(() => {
      try {
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      } catch (_) {}
    }, 30000);
  } catch (err) {
    console.error(`❌ Print failed for ${ticket}:`, err.message);
  } finally {
    printingJobIds.delete(orderId);
  }
}

// 1. Real-time Firestore Listener for Shop Orders
console.log(`📡 Connecting real-time listener to Firestore...`);
let ordersRef = db.collection("orders");
if (targetShopId) {
  ordersRef = ordersRef.where("shopId", "==", targetShopId);
  console.log(`🔒 Exclusively listening for orders for shop: ${targetShopId}`);
} else {
  console.log(`🌐 Listening for all shops`);
}

ordersRef.onSnapshot(
  (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added" || change.type === "modified") {
        const data = change.doc.data();
        const id = change.doc.id;

        // Automatically print whenever status is "printing" and not yet printed
        if (data.status === "printing" && !data.printedSilently && !printingJobIds.has(id)) {
          printDocument(id, data);
        }
      }
    });
  },
  (err) => {
    console.error("Firestore listener error:", err);
  }
);

// 2. Local HTTP Server on port 4141 for instant trigger
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", printer: "Canon G2010 series" }));
    return;
  }

  if (req.url === "/print" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { orderId } = JSON.parse(body || "{}");
        if (orderId) {
          const docSnap = await db.collection("orders").doc(orderId).get();
          if (docSnap.exists) {
            printDocument(orderId, docSnap.data());
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(4141, "127.0.0.1", () => {
  console.log(`\n======================================================`);
  console.log(`🖨️  PAPERFLOW SILENT PRINT AGENT IS ACTIVE & RUNNING!`);
  console.log(`------------------------------------------------------`);
  console.log(`• Default Printer : Canon G2010 series`);
  console.log(`• Local Port      : 4141`);
  console.log(`• Status          : Listening for "Start Printing" clicks`);
  console.log(`• Mode            : 100% SILENT (ZERO DIALOGS, ZERO POPUPS)`);
  console.log(`======================================================\n`);
});
