import type { Metadata } from "next";
import "./globals.css";
import { VisualShell } from "@/components/VisualShell";

export const metadata: Metadata = {
  title: "Badminton Motion Lab",
  description:
    "Local-first badminton technique and footwork intelligence. Windows Local Agent required. Original video stays on your PC.",
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
