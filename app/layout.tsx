import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Ignited | Team workspace",
  description: "Private delivery workspace for Ignited Content Co.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
