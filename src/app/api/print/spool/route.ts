import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileUrl, fileName = "document.pdf", orderId } = body;

    if (!fileUrl) {
      return NextResponse.json({ error: "No file URL provided" }, { status: 400 });
    }

    // Prepare temp directory
    const tempDir = path.join(process.cwd(), ".temp_prints");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clean safe filename
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const localFilePath = path.join(tempDir, `${Date.now()}_${orderId || "job"}_${safeName}`);

    // Download file from URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));

    // Execute Windows Print Spool
    const isWindows = process.platform === "win32";
    if (isWindows) {
      // Start-Process with Verb Print sends document to default printer
      const printCmd = `powershell -NoProfile -Command "Start-Process -FilePath '${localFilePath}' -Verb Print"`;
      await execAsync(printCmd, { timeout: 10000 });
    }

    // Schedule cleanup of temp file
    setTimeout(() => {
      try {
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      } catch (e) {
        console.warn("Failed to delete temp print file:", e);
      }
    }, 20000);

    return NextResponse.json({
      success: true,
      message: "Print command dispatched to system default printer",
      filePath: localFilePath,
    });
  } catch (error: any) {
    console.error("Print spool error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send job to printer" },
      { status: 500 }
    );
  }
}
