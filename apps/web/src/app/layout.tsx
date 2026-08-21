import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VisualShell } from "@/components/VisualShell";

export const metadata: Metadata = {
  title: "Badminton Motion Lab",
  description:
    "Local-first badminton technique and footwork intelligence. Windows Local Agent required. Original video stays on your PC.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VisualShell>{children}</VisualShell>
      </body>
    </html>
  );
}
