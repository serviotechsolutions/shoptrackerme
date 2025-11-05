import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
}

export const BarcodeScanner = ({ onScan }: BarcodeScannerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startScanner = async () => {
    try {
      setError(null);
      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
          setIsOpen(false);
        },
        (errorMessage) => {
          // Ignore decode errors, they happen continuously while scanning
          console.debug("Scan error:", errorMessage);
        }
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Error starting scanner:", err);
      setError("Failed to start camera. Please check camera permissions.");
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
  };

  useEffect(() => {
    if (isOpen && !isScanning) {
      startScanner();
    }
    return () => {
      if (isScanning) {
        stopScanner();
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    stopScanner();
    setIsOpen(false);
    setError(null);
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

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Product Barcode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
            <div
              id="barcode-reader"
              className="w-full rounded-lg overflow-hidden border"
            />
            <Button onClick={handleClose} variant="outline" className="w-full">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
