import { NextRequest, NextResponse } from "next/server";
import { readWhatsAppActionToken } from "@/lib/push/whatsapp-action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("action");
  const action = token ? readWhatsAppActionToken(token) : null;
  if (!action) {
    return NextResponse.json({ error: "This message link is invalid or expired." }, { status: 400 });
  }
  const params = new URLSearchParams({ text: action.message });
  const response = NextResponse.redirect(`https://wa.me/${action.phone}?${params.toString()}`, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
