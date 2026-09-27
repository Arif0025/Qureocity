import { NextResponse } from "next/server";

// TEMPORARY — diagnostic only. Reports the shape of the VAPID env vars
// without ever printing their actual value, so it's safe to deploy for
// a minute. Delete this file once the private-key issue is confirmed
// fixed; it should never stay in production.
export async function GET() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  const subj = process.env.VAPID_SUBJECT ?? "";

  const inspect = (s: string) => ({
    length: s.length,
    startsWithQuote: s.startsWith('"') || s.startsWith("'"),
    endsWithQuote: s.endsWith('"') || s.endsWith("'"),
    hasLeadingSpace: s !== s.trimStart(),
    hasTrailingSpace: s !== s.trimEnd(),
    hasNewline: /[\r\n]/.test(s),
    // base64url = A-Z a-z 0-9 - _  only
    onlyBase64UrlChars: s.length > 0 && /^[A-Za-z0-9_-]*$/.test(s),
    first3: s.slice(0, 3),
    last3: s.slice(-3),
  });

  return NextResponse.json({
    publicKey: inspect(pub),
    privateKey: inspect(priv),
    subject: { value: subj, length: subj.length },
  });
}
