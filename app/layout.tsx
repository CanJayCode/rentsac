import type { Metadata, Viewport } from "next";
import { Fraunces, Hind } from "next/font/google";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f3ea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hind.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
