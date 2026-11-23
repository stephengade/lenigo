import type { Metadata } from "next";
import { Geist_Mono, Inter, Teachers } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

/** Body + UI text. */
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
/** Headings, numbers on stat cards, brand moments. */
const display = Teachers({ variable: "--font-teachers", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Lenigo — learn in public, ship with your community", template: "%s · Lenigo" },
  description:
    "Structured roadmaps, hands-on projects, daily standups and mentor reviews — a learning and accountability home for tech communities.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
