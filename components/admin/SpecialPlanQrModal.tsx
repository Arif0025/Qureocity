"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";

export default function SpecialPlanQrModal({
  name,
  code,
  onClose,
}: {
  name: string;
  code: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/special/${code.toLowerCase()}`;

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then(({ default: QRCode }) => {
      if (!cancelled && canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, url, {
          width: 280,
          margin: 2,
          color: { dark: "#3A2E42", light: "#FFFFFF" },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${code.toLowerCase()}-registration-qr.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const share = async () => {
    if (!canvasRef.current || !navigator.share) {
      await navigator.clipboard?.writeText(url);
      return;
    }
    setSharing(true);
    try {
      const response = await fetch(canvasRef.current.toDataURL("image/png"));
      const blob = await response.blob();
      const file = new File(
        [blob],
        `${code.toLowerCase()}-registration-qr.png`,
        { type: "image/png" },
      );
      const shareData: ShareData = {
        title: name,
        text: `Register for ${name}`,
        url,
      };
      if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
      await navigator.share(shareData);
    } catch (error: any) {
      if (error?.name !== "AbortError")
        await navigator.clipboard?.writeText(url);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-brand-nightSurface p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-bold text-brand-nightText">Registration QR</p>
            <p className="text-xs text-brand-nightText/45 mt-1">{name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} className="text-brand-nightText/50" />
          </button>
        </div>
        <div className="rounded-xl bg-white p-4 flex justify-center">
          <canvas ref={canvasRef} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            type="button"
            onClick={download}
            className="min-h-[44px] rounded-xl bg-brand-sky text-white font-semibold flex items-center justify-center gap-2"
          >
            <Download size={16} /> Save QR
          </button>
          <button
            type="button"
            onClick={share}
            disabled={sharing}
            className="min-h-[44px] rounded-xl border border-white/15 text-brand-nightText font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Share2 size={16} /> {sharing ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
