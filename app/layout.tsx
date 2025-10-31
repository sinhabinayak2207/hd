import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Highway Delite",
  description: "Curated outdoor experiences",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}