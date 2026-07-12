import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const title = "VeneMed — El puente directo entre tu ayuda y quien la necesita";
const description =
  "Comunidades organizadas publican lo que necesitan. Los donantes lo ven y lo comparten. Sin que nada se pierda.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://venemedapp.org",
  ),
  title,
  description,
  openGraph: {
    type: "website",
    siteName: "VeneMed",
    locale: "es_VE",
    url: "/",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  // --background (#f7f8fa, neutral/50 — page background) from globals.css
  themeColor: "#f7f8fa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
