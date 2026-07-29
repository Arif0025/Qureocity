import { NextResponse } from "next/server";
import { generateQrToken } from "@/lib/qrToken";

// This token contains the current 45-second time bucket. A cached route
// response would keep serving an already-expired QR code, so it must never
// be statically optimized or cached by Vercel/the browser.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "QR_SIGNING_SECRET not configured" }, { status: 500 });
  }
  return NextResponse.json(
    { token: generateQrToken(secret) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
