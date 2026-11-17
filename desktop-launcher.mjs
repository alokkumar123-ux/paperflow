import sumatraPath from "./bin/SumatraPDF.exe" with { type: "file" };
import fs from "fs";
import path from "path";
import http from "http";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const execAsync = promisify(exec);

// 1. APPDATA Configuration
const APPDATA_DIR = path.join(process.env.APPDATA || "C:\\", "PaperFlow");
fs.mkdirSync(APPDATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(APPDATA_DIR, "config.json");

// 2. Temp Directory for Silent Print Engine & Documents
const TEMP_DIR = path.join(process.env.TEMP || "C:\\Temp", "PaperFlow");
fs.mkdirSync(TEMP_DIR, { recursive: true });
const SUMATRA_EXE = path.join(TEMP_DIR, "SumatraPDF.exe");

async function extractSumatra() {
  if (!fs.existsSync(SUMATRA_EXE)) {
    try {
      console.log("📦 Extracting embedded print engine...");
      const buf = await Bun.file(sumatraPath).arrayBuffer();
      fs.writeFileSync(SUMATRA_EXE, Buffer.from(buf));
      console.log("✅ Silent print engine ready.");
    } catch (e) {
      console.warn("⚠️ Using fallback print system:", e.message);
    }
  }
}

// 3. Find Edge or Chrome for Desktop App Window
function getBrowserPath() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// 4. Detect Physical Printer Status (Canon, HP, Epson, Brother)
async function detectPhysicalPrinter() {
  const psCmd = `powershell -NoProfile -Command "Get-Printer | Select-Object Name, PrinterStatus, PortName, DriverName, Type | ConvertTo-Json"`;
  try {
    const { stdout } = await execAsync(psCmd, { timeout: 4000 });
    const raw = JSON.parse(stdout || "[]");
    const list = Array.isArray(raw) ? raw : [raw];
    const physical = list.filter((p) => {
      const name = (p.Name || "").toLowerCase();
      const driver = (p.DriverName || "").toLowerCase();
      return (
        !driver.includes("microsoft") &&
        !name.includes("pdf") &&
        !name.includes("onenote") &&
        !name.includes("xps") &&
        !name.includes("fax")
      );
    });

    if (physical.length > 0) {
      const p = physical[0];
      const isOnline =
        p.PrinterStatus === "Normal" ||
        p.PrinterStatus === 0 ||
        p.PrinterStatus === 1 ||
        p.PrinterStatus === 3;
      return {
        connected: true,
        name: p.Name,
        status: p.PrinterStatus,
        port: p.PortName,
        isOnline: isOnline,
      };
    }
  } catch (e) {
    console.warn("Printer detection warning:", e.message);
  }
  return { connected: false, name: null, status: "Disconnected", isOnline: false };
}

// 5. Prompt for Shop ID if not configured
async function getShopId() {
  // Check local file shop-id.txt first
  const localShopFile = path.join(process.cwd(), "shop-id.txt");
  if (fs.existsSync(localShopFile)) {
    const sId = fs.readFileSync(localShopFile, "utf8").trim();
    if (sId) return sId;
  }

  // Check saved config in APPDATA
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (cfg.shopId) return cfg.shopId;
    } catch (_) {}
  }

  // Show Native Windows Prompt Box
  try {
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('Welcome to PaperFlow Smart Print Shop OS!\\n\\nPlease enter your Shop ID to connect your printer to your queue:', 'PaperFlow Setup', 'LrcWSIpRWSWqP0uy7Qpl')"`;
    const { stdout } = await execAsync(psCmd);
    const entered = stdout.trim();
    if (entered) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ shopId: entered }, null, 2));
      return entered;
    }
  } catch (err) {
    console.warn("Input dialog error, defaulting to campus shop:", err.message);
  }

  return "LrcWSIpRWSWqP0uy7Qpl";
}

// 5. Initialize Firebase Admin
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
    // 0. Verify physical printer is connected & ready before proceeding
    const printer = await detectPhysicalPrinter();
    if (!printer.connected || !printer.isOnline) {
      const errMsg = printer.name
        ? `Printer "${printer.name}" is offline or turned off`
        : "No physical printer is connected to this computer";
      console.error(`❌ PRINT BLOCKED: ${errMsg}`);

      // Revert order back to 'queued' so it does not complete
      await db.collection("orders").doc(orderId).update({
        status: "queued",
        printError: errMsg,
        printedSilently: false,
      });
      return;
    }

    const fileUrl =
      orderData.fileDownloadUrl ||
      orderData.files?.[0]?.url ||
      orderData.filePath;

    if (!fileUrl) throw new Error("No file URL found in order");

    const safeName = (orderData.fileName || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const localFilePath = path.join(TEMP_DIR, `${Date.now()}_${safeName}`);

    console.log(`⏳ Downloading document...`);
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
    console.log(`✅ Download complete: ${localFilePath}`);

    // Print Settings
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

    console.log(`🚀 Dispatching silent print to default printer...`);
    await execAsync(printCmd, { timeout: 15000 });
    console.log(`🎉 SUCCESS! Ticket ${ticket} printed with ZERO dialogs!`);

    await db.collection("orders").doc(orderId).update({
      status: "ready",
      printedAt: FieldValue.serverTimestamp(),
      printedSilently: true,
    });

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

async function main() {
  await extractSumatra();
  const shopId = await getShopId();

  console.log(`\n======================================================`);
  console.log(`🚀  STARTING PAPERFLOW DESKTOP OS`);
  console.log(`------------------------------------------------------`);
  console.log(`• Shop ID     : ${shopId}`);
  console.log(`• Mode        : Native Desktop Window + Silent Printer`);
  console.log(`======================================================\n`);

  // 1. Connect Firestore Listener for this Shop
  const ordersRef = db.collection("orders").where("shopId", "==", shopId);
  ordersRef.onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          const id = change.doc.id;

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

  // 2. Start local HTTP bridge on 4141
  const server = http.createServer(async (req, res) => {
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
      res.end(JSON.stringify({ status: "online", shopId }));
      return;
    }

    if (req.url === "/printer-status") {
      const p = await detectPhysicalPrinter();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(p));
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
            if (docSnap.exists) printDocument(orderId, docSnap.data());
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
    console.log(`🔌 Local bridge active on 127.0.0.1:4141`);
  });

  // 3. Periodically sync printer status to Firestore
  const syncPrinter = async () => {
    try {
      const p = await detectPhysicalPrinter();
      await db.collection("shops").doc(shopId).update({
        printerName: p.connected ? p.name : null,
        isPrinterOnline: Boolean(p.connected && p.isOnline),
        printerUpdatedAt: FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  };
  syncPrinter();
  setInterval(syncPrinter, 5000);

  // 4. Launch the Native Desktop Window
  const browserPath = getBrowserPath();
  const dashboardUrl = `https://paperflow-dev.vercel.app/dashboard/${shopId}`;

  if (browserPath) {
    console.log(`🖥️  Opening PaperFlow Desktop Window...`);
    const appArgs = [
      `--app=${dashboardUrl}`,
      `--window-size=1300,850`,
      `--window-position=center`,
    ];
    const child = spawn(browserPath, appArgs, { detached: false, stdio: "ignore" });
    child.on("exit", () => {
      console.log("PaperFlow Desktop Window closed by user. Exiting...");
      process.exit(0);
    });
  } else {
    // Fallback: open default browser
    exec(`start ${dashboardUrl}`);
  }
}

main().catch((err) => {
  console.error("Fatal launcher error:", err);
});
