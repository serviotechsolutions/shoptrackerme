import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, AlertCircle, Keyboard, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

const READER_ID = "barcode-reader";

export const BarcodeScanner = ({ onScan }: BarcodeScannerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const stopScanner = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
        await s.clear();
      } catch (err) {
        console.debug("stopScanner:", err);
      }
    }
    setIsScanning(false);
  };

  const startWithCamera = async (cameraId: string | { facingMode: string }) => {
    setError(null);
    // Wait for the reader element to mount
    let tries = 0;
    while (!document.getElementById(READER_ID) && tries < 20) {
      await new Promise((r) => setTimeout(r, 50));
      tries++;
    }
    const el = document.getElementById(READER_ID);
    if (!el) {
      setError("Scanner failed to initialize. Please try again.");
      return;
    }

    try {
      // Request permission explicitly for clearer prompts
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        stream.getTracks().forEach((t) => t.stop());
      }

      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;

      await scanner.start(
        cameraId as any,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText.trim());
          stopScanner().then(() => setIsOpen(false));
        },
        () => {}
      );
      setIsScanning(true);

      // Populate camera list for switching
      try {
        const devs = await Html5Qrcode.getCameras();
        if (devs?.length) {
          setCameras(devs.map((d) => ({ id: d.id, label: d.label })));
          if (typeof cameraId === "string") setActiveCameraId(cameraId);
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.error("Scanner error:", err);
      const name = err?.name || "";
      if (name === "NotAllowedError" || /permission/i.test(err?.message || "")) {
        setError(
          "Camera permission denied. Please allow camera access in your browser settings."
        );
      } else if (name === "NotFoundError" || /no camera/i.test(err?.message || "")) {
        setError("No camera found on this device.");
      } else {
        setError(
          "Camera not accessible. Please check permissions or device, or use manual input below."
        );
      }
      setIsScanning(false);
    }
  };

  const initScanner = async () => {
    if (!isSecure) {
      setError("Camera requires secure connection (HTTPS).");
      return;
    }
    await startWithCamera({ facingMode: "environment" });
  };

  useEffect(() => {
    if (isOpen) {
      initScanner();
    }
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = async () => {
    await stopScanner();
    setIsOpen(false);
    setError(null);
    setManualCode("");
  };

  const handleSwitchCamera = async () => {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex((c) => c.id === activeCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    await stopScanner();
    setActiveCameraId(next.id);
    await startWithCamera(next.id);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    handleClose();
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="icon"
        title="Scan Barcode"
      >
        <Camera className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={(o) => (o ? setIsOpen(true) : handleClose())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Product Barcode / QR</DialogTitle>
            <DialogDescription>
              Point your camera at a barcode or QR code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div
              id={READER_ID}
              className="w-full rounded-lg overflow-hidden border bg-muted min-h-[250px]"
            />

            {cameras.length > 1 && isScanning && (
              <Button
                onClick={handleSwitchCamera}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Switch Camera
              </Button>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-2 border-t pt-3">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> Manual entry (fallback)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter barcode..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  autoFocus={!!error}
                />
                <Button type="submit" disabled={!manualCode.trim()}>
                  Add
                </Button>
              </div>
            </form>

            <Button onClick={handleClose} variant="outline" className="w-full">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
