import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";

let app: App;

if (getApps().length === 0) {
  let serviceAccount: any = null;

  // 1. Check for local service-account.json file
  const localKeyPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(localKeyPath)) {
    try {
      const fileData = fs.readFileSync(localKeyPath, "utf8");
      serviceAccount = JSON.parse(fileData);
    } catch (e) {
      console.warn("Failed reading service-account.json:", e);
    }
  }

  // 2. Check for FIREBASE_SERVICE_ACCOUNT_JSON env var
  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.warn("Failed parsing FIREBASE_SERVICE_ACCOUNT_JSON:", e);
    }
  }

  if (serviceAccount) {
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    app = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bola-f035f.firebasestorage.app",
    });
    console.log("Firebase Admin initialized successfully with Service Account for project:", serviceAccount.project_id);
  } else {
    app = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bola-f035f",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bola-f035f.firebasestorage.app",
    });
    console.warn("Firebase Admin initialized with default projectId (no Service Account found).");
  }
} else {
  app = getApps()[0];
}

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export const adminStorage = getStorage(app);
export default app;
