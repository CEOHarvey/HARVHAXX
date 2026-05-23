import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "License Dashboard",
  description: "Owner dashboard — live license duration and key generation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
