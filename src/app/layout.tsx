import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PaperFlow – Smart Print Shop OS",
  description:
    "No queue at the counter. Just tickets. Customers scan, upload and get a ticket number. You see every job live, take cash, and print.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrainsMono.variable}`}>
      <head>
        <style>{`
          :root {
            --font-sans: var(--font-bricolage), ui-sans-serif, system-ui, sans-serif;
            --font-mono: var(--font-jetbrains), ui-monospace, monospace;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
