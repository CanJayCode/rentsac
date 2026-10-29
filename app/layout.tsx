import type { Metadata, Viewport } from "next";
import { Fraunces, Hind } from "next/font/google";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// Display: Fraunces (Latin). Body: Hind (Latin + Devanagari for Marathi).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const hind = Hind({
  variable: "--font-hind",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rentsac",
  description: "Rent and light-bill tracker",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Rentsac", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f3ea",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${fraunces.variable} ${hind.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
