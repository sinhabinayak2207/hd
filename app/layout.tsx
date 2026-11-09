import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClusterX AI",
  description: "Review and edit subtitles, labels and metadata for processed videos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
