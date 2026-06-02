import { useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const SCANNER_ID = "seller-qr-reader";

type QrScannerProps = {
  active: boolean;
  onDecode: (raw: string) => void;
  onError?: (message: string) => void;
};

async function resolveCamera(): Promise<string | MediaTrackConstraints> {
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      return { facingMode: { ideal: "environment" } };
    }
    const backCamera = cameras.find((camera) =>
      /back|rear|environment|задн/i.test(camera.label)
    );
    if (backCamera) {
      return backCamera.id;
    }
    return cameras[cameras.length - 1]!.id;
  } catch {
    return { facingMode: { ideal: "environment" } };
  }
}

async function stopScanner(scanner: Html5Qrcode | null) {
  if (!scanner) {
    return;
  }
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
    scanner.clear();
  } catch {
    // Scanner may already be stopped.
  }
}

export function QrScanner({ active, onDecode, onError }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);

  onDecodeRef.current = onDecode;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    if (!active) {
      busyRef.current = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      void stopScanner(scanner);
      return;
    }

    busyRef.current = false;

    const start = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) {
        return;
      }

      await stopScanner(scannerRef.current);
      if (cancelled) {
        return;
      }

      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: false,
        verbose: false
      });
      scannerRef.current = scanner;

      try {
        const camera = await resolveCamera();
        if (cancelled) {
          await stopScanner(scanner);
          scannerRef.current = null;
          return;
        }

        await scanner.start(
          camera,
          {
            fps: 10,
            disableFlip: false,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.max(200, Math.floor(edge * 0.85));
              return { width: size, height: size };
            }
          },
          (decodedText) => {
            if (busyRef.current || cancelled) {
              return;
            }
            busyRef.current = true;
            onDecodeRef.current(decodedText);
          },
          () => undefined
        );
      } catch {
        scannerRef.current = null;
        await stopScanner(scanner);
        if (!cancelled) {
          onErrorRef.current?.("Не удалось открыть камеру. Проверьте HTTPS и разрешение камеры.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      busyRef.current = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      void stopScanner(scanner);
    };
  }, [active]);

  return <div id={SCANNER_ID} className="scanner" hidden={!active} />;
}
