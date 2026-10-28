import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";

const jakarta = localFont({ src: "./fonts/PlusJakartaSans-Variable.ttf", weight: "200 800", display: "swap", variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "AYUSH Central EPR",
  description: "Ayush Ayurveda & Yoga Therapy Centre — central multi-user Electronic Patient Record",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
