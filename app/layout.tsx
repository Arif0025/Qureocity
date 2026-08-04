import "./globals.css";

export const metadata = {
  title: "QureoCity",
  description: "Play. Discover. Belong.",
};

// Runs before paint, before React hydrates — reads the saved theme (if
// any) and sets it on <html> immediately, so staff pages never flash the
// wrong theme for a frame on load. Only ever touches data-theme, never
// removes/adds classes, so it can't fight with anything else here.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem("qureocity-theme");
    var theme = saved === "light" || saved === "dark" ? saved : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
