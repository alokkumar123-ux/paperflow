import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  isPhysical: boolean;
  isOnline: boolean;
  portName?: string;
  driverName?: string;
}

export async function GET() {
  try {
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Query Windows WMI for all installed printers
      const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, WorkOffline, PortName, DriverName | ConvertTo-Json"`;
      
      let stdout = "";
      try {
        const res = await execAsync(psCmd, { timeout: 4000 });
        stdout = res.stdout?.trim();
      } catch (err: any) {
        console.warn("PowerShell printer check error:", err.message);
      }

      if (!stdout) {
        return NextResponse.json({
          hasConnectedPrinter: false,
          message: "No printer service responding",
          connectedPrinters: [],
          offlinePrinters: [],
          virtualPrinters: [],
          defaultPrinter: null,
        });
      }

      let parsed: any[] = [];
      try {
        const raw = JSON.parse(stdout);
        parsed = Array.isArray(raw) ? raw : [raw];
      } catch (e) {
        console.warn("Failed to parse printer JSON:", e);
      }

      const printers: PrinterInfo[] = parsed.map((p) => {
        const name = p.Name || "";
        const driver = (p.DriverName || "").toLowerCase();
        const port = (p.PortName || "").toUpperCase();
        const lowerName = name.toLowerCase();

        // Check if virtual / software printer
        const isVirtual =
          lowerName.includes("print to pdf") ||
          lowerName.includes("onenote") ||
          lowerName.includes("xps") ||
          lowerName.includes("fax") ||
          port === "PORTPROMPT:" ||
          port.startsWith("SHRFAX:") ||
          driver.includes("software printer") ||
          driver.includes("shared fax") ||
          driver.includes("print to pdf") ||
          driver.includes("xps document writer");

        // WorkOffline = true means printer is turned off or unplugged
        const isOffline = p.WorkOffline === true;
        // PrinterStatus: 3 is Idle/Ready, 7 is Offline, 1 is Other, 2 is Unknown
        const isReadyStatus = p.PrinterStatus === 3 || p.PrinterStatus === 0;

        return {
          name,
          isDefault: Boolean(p.Default),
          isPhysical: !isVirtual,
          isOnline: !isOffline && !isVirtual,
          portName: p.PortName,
          driverName: p.DriverName,
        };
      });

      const connectedPhysical = printers.filter((p) => p.isPhysical && p.isOnline);
      const offlinePhysical = printers.filter((p) => p.isPhysical && !p.isOnline);
      const virtualPrinters = printers.filter((p) => !p.isPhysical);
      const defaultP = printers.find((p) => p.isDefault)?.name || null;

      const hasConnectedPrinter = connectedPhysical.length > 0;

      return NextResponse.json({
        hasConnectedPrinter,
        message: hasConnectedPrinter
          ? `Printer connected: ${connectedPhysical[0].name}`
          : offlinePhysical.length > 0
          ? `Physical printer "${offlinePhysical[0].name}" is installed but OFFLINE or UNPLUGGED`
          : "No physical printer connected to this computer",
        connectedPrinters: connectedPhysical,
        offlinePrinters: offlinePhysical,
        virtualPrinters,
        defaultPrinter: defaultP,
        allPrinters: printers,
      });
    }

    // Fallback for non-windows (e.g. Linux / macOS CUPS)
    return NextResponse.json({
      hasConnectedPrinter: false,
      message: "Non-Windows environment: Please use browser print",
      connectedPrinters: [],
      offlinePrinters: [],
      virtualPrinters: [],
      defaultPrinter: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        hasConnectedPrinter: false,
        error: error.message || "Failed to check printer status",
        connectedPrinters: [],
        offlinePrinters: [],
        virtualPrinters: [],
        defaultPrinter: null,
      },
      { status: 500 }
    );
  }
}
