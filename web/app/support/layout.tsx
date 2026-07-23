import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Harvcious Support",
  description: "Live support chat — Harvcious Loader",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#090909",
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
