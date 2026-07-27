import { NextResponse } from "next/server";
import { generateQrToken } from "@/lib/qrToken";

export async function GET() {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "QR_SIGNING_SECRET not configured" }, { status: 500 });
  }
  return NextResponse.json({ token: generateQrToken(secret) });
}
