import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import "../qr-scanner.css";

// The browser's own QR decoder; TypeScript's DOM library leaves it out.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorClass = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats: () => Promise<string[]>;
};

type Failure = "insecure" | "denied" | "no-camera" | "other";

const FAILURE_TEXT: Record<Failure, string> = {
  insecure: "The camera only works over a secure (https) connection, so the scanner can’t start here.",
  denied: "Wannadoo isn’t allowed to use the camera. Allow camera access in your browser’s settings to scan.",
  "no-camera": "This device has no camera the scanner can use.",
  other: "The camera didn’t start.",
};

// Decodes a few times a second rather than every frame, on a frame shrunk to at most this many pixels a side.
const SCAN_INTERVAL_MS = 250;
const MAX_SCAN_SIDE = 640;
// How long a rejection message stays up.
const MESSAGE_MS = 2500;

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

// A full-screen rear-camera scanner. `onResult` gets each decoded QR text; returning a message rejects the code,
// shows the message and keeps scanning, and returning nothing ends the scan. The camera stops on success, cancel,
// error, and unmount.
export function QrScanner({
  title = "Scan a QR code",
  onResult,
  onCancel,
  fallback,
}: {
  title?: string;
  onResult: (text: string) => string | void;
  onCancel: () => void;
  // Offered when the camera can't be used, such as typing the code instead.
  fallback?: { label: string; onClick: () => void };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let messageTimer: number | undefined;

    function stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(messageTimer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setFailure(window.isSecureContext ? "no-camera" : "insecure");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (e) {
        if (!stopped) setFailure(failureOf(e));
        return;
      }
      // Unmounted while the permission prompt was up.
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted inline video normally succeeds; frames still arrive if it doesn't.
      }
      if (stopped) return;
      setLive(true);

      const decode = await pickDecoder();
      const scan = async () => {
        if (stopped) return;
        let text: string | null = null;
        try {
          text = await decode(video);
        } catch {
          // A frame that fails to decode is skipped.
        }
        if (stopped) return;
        if (text !== null) {
          const rejection = onResultRef.current(text);
          if (typeof rejection !== "string") {
            stop();
            return;
          }
          setMessage(rejection);
          window.clearTimeout(messageTimer);
          messageTimer = window.setTimeout(() => setMessage(null), MESSAGE_MS);
        }
        timer = window.setTimeout(() => void scan(), SCAN_INTERVAL_MS);
      };
      void scan();
    }

    void start();
    return stop;
  }, []);

  return (
    <div className="qr-scanner" role="dialog" aria-modal="true" aria-label={title}>
      <video ref={videoRef} className="qr-scanner-video" muted playsInline autoPlay aria-hidden="true" />

      <div className="qr-scanner-top">
        <h2>{title}</h2>
      </div>

      {failure ? (
        <div className="qr-scanner-failure" role="alert">
          <p>{FAILURE_TEXT[failure]}</p>
          {fallback && (
            <button type="button" className="btn-primary" onClick={fallback.onClick}>
              {fallback.label}
            </button>
          )}
        </div>
      ) : (
        <div className="qr-scanner-middle">
          <div className={live ? "qr-scanner-frame live" : "qr-scanner-frame"} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p className="qr-scanner-note" role="status">
            {message ?? (live ? "Point the camera at the code." : "Starting the camera…")}
          </p>
        </div>
      )}

      <div className="qr-scanner-bottom">
        <button type="button" className="btn-primary light" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function failureOf(error: unknown): Failure {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "no-camera";
  }
  return "other";
}

// The browser's BarcodeDetector where it reads QR codes (Android Chrome, Safari 17+ on some setups), else jsQR.
async function pickDecoder(): Promise<Decoder> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (Detector) {
    try {
      if ((await Detector.getSupportedFormats()).includes("qr_code")) {
        const detector = new Detector({ formats: ["qr_code"] });
        return async (video) => {
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
          const [code] = await detector.detect(video);
          return code?.rawValue ?? null;
        };
      }
    } catch {
      // Fall through to jsQR.
    }
  }
  return jsQrDecoder();
}

function jsQrDecoder(): Decoder {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const { videoWidth: width, videoHeight: height } = video;
    if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !width || !height) return null;
    const scale = Math.min(1, MAX_SCAN_SIDE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}
