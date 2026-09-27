import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  manifest: "/staff.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "QureoCity" },
};

export const viewport: Viewport = {
  themeColor: "#5B3A73",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
