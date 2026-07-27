import crypto from "crypto";

const BUCKET_MS = 45_000;

function sign(bucket: number, secret: string): string {
  return crypto.createHmac("sha256", secret).update(String(bucket)).digest("hex").slice(0, 24);
}

export function generateQrToken(secret: string): string {
  const bucket = Math.floor(Date.now() / BUCKET_MS);
  return `${bucket}.${sign(bucket, secret)}`;
}

// Accepts the current bucket AND the previous one, so a token generated
// right before the display refreshes doesn't fail a scan that lands a
// second later on the other side of the boundary.
export function verifyQrToken(token: string, secret: string): boolean {
  const [bucketStr, sig] = token.split(".");
  const bucket = Number(bucketStr);
  if (!bucket || !sig) return false;

  const currentBucket = Math.floor(Date.now() / BUCKET_MS);
  if (bucket !== currentBucket && bucket !== currentBucket - 1) return false;

  return sig === sign(bucket, secret);
}
