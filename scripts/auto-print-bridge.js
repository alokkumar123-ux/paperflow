/**
 * PaperFlow Auto-Print Bridge
 * Watches Firestore for orders matching { paymentStatus: 'paid_offline', status: 'queued' }
 * Downloads the PDF document from Firebase Storage and spools to local printer.
 *
 * Usage:
 *   bun run scripts/auto-print-bridge.js <SHOP_ID>
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { exec } = require("child_process");

const shopId = process.argv[2] || process.env.PAPERFLOW_SHOP_ID;

if (!shopId) {
  console.error("Please provide a shop ID: bun run scripts/auto-print-bridge.js <SHOP_ID>");
  process.exit(1);
}

// Initialize Admin
if (!admin.apps.length) {
  let serviceAccount = null;
  const localKeyPath = path.join(__dirname, "../service-account.json");
  if (fs.existsSync(localKeyPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
    } catch (e) {}
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {}
  }

  if (serviceAccount) {
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bola-f035f.firebasestorage.app",
    });
  } else {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bola-f035f",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bola-f035f.firebasestorage.app",
    });
  }
}

const db = admin.firestore();
console.log(`[PaperFlow Bridge] Listening for paid print jobs at shop: ${shopId}...`);

const tempDir = path.join(__dirname, "../.temp_prints");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

db.collection("orders")
  .where("shopId", "==", shopId)
  .where("paymentStatus", "==", "paid_offline")
  .where("status", "==", "queued")
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added" || change.type === "modified") {
        const order = change.doc.data();
        const orderId = change.doc.id;

        console.log(`[Auto-Print] New order detected: ${order.ticketNumber} (${order.fileName})`);

        if (!order.fileDownloadUrl) {
          console.log(`[Auto-Print] Order ${order.ticketNumber} has no download URL yet, skipping...`);
          return;
        }

        const localFilePath = path.join(tempDir, `${orderId}_${order.fileName}`);
        const fileStream = fs.createWriteStream(localFilePath);

        https.get(order.fileDownloadUrl, (res) => {
          res.pipe(fileStream);
          fileStream.on("finish", async () => {
            fileStream.close();
            console.log(`[Auto-Print] Downloaded file to: ${localFilePath}`);

            // Update status to printing
            await db.collection("orders").doc(orderId).update({
              status: "printing",
              autoPrintedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Windows / Linux print spooling command
            const isWindows = process.platform === "win32";
            const printCmd = isWindows
              ? `powershell -Command "Start-Process -FilePath '${localFilePath}' -Verb Print -PassThru | ForEach-Object { Start-Sleep -Seconds 5; $_.CloseMainWindow() }"`
              : `lp "${localFilePath}"`;

            console.log(`[Auto-Print] Executing print spool: ${printCmd}`);
            exec(printCmd, async (err) => {
              if (err) {
                console.error(`[Auto-Print] Print spool failed:`, err);
              } else {
                console.log(`[Auto-Print] Successfully spooled ${order.ticketNumber} to printer!`);
                // Mark ready
                await db.collection("orders").doc(orderId).update({
                  status: "ready",
                });
              }

              // Cleanup local temp file after delay
              setTimeout(() => {
                try {
                  if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
                } catch (e) {}
              }, 15000);
            });
          });
        });
      }
    });
  });
