import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "License Dashboard",
  description: "Owner dashboard — live license duration and key generation",
};

const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("dashboard-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.dataset.theme = t;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.dataset.theme = "dark";
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
