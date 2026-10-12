import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

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
