import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanBarcode, X } from 'lucide-react';
import { Modal } from '../common/Modal';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorInstance {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
  }
}

export function BarcodeScannerModal({ open, onClose, onDetected }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [hasDetector, setHasDetector] = useState(true);

  useEffect(() => {
    if (!open) {
      setManualCode('');
      setError(null);
      return;
    }

    let active = true;
    let stream: MediaStream | null = null;
    let timerId: number | undefined;

    const DetectorCtor = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
    const supported = Boolean(DetectorCtor);
    setHasDetector(supported);

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available in this browser or requires HTTPS.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        if (DetectorCtor) {
          const detector = new DetectorCtor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });

          const scanTick = async () => {
            if (!active || !videoRef.current) return;
            if (videoRef.current.readyState >= 2) {
              try {
                const results = await detector.detect(videoRef.current);
                const code = results.find((r) => r.rawValue && r.rawValue.trim())?.rawValue?.trim();
                if (code) {
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(70);
                  }
                  onDetected(code);
                  onClose();
                  return;
                }
              } catch {
                // ignore single-frame decode misses
              }
            }
            if (active) {
              timerId = window.setTimeout(() => void scanTick(), 220);
            }
          };

          timerId = window.setTimeout(() => void scanTick(), 300);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not open camera: ${err.message}. Enter barcode manually below.`
            : 'Camera permission denied. Enter barcode manually below.'
        );
      }
    };

    void startCamera();

    return () => {
      active = false;
      if (timerId) window.clearTimeout(timerId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open, onClose, onDetected]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    onDetected(cleaned);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Scan Bottle Barcode" maxWidth="max-w-md">
      <div className="space-y-3">
        {!error ? (
          <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
            <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-white flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-emerald-400" />
              {hasDetector
                ? 'Point camera at bottle barcode'
                : 'Auto-scan unsupported in this browser — enter digits below'}
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <ScanBarcode className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Or type / paste barcode number..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Lookup
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close scanner"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Modal>
  );
}

