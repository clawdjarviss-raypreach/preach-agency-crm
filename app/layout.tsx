import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConvexClientProvider from "./convex-provider";

export const metadata: Metadata = {
  title: "Preach CRM",
  description: "Preach Agency CRM — Shift tracking, sales reports, and team management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
