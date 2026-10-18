import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

/**
 * The reference (cofounder.co) uses "neoris" — a commercial geometric sans.
 * Figtree is the closest freely-loadable stand-in: geometric, soft rounds,
 * slightly wide, sentence-case friendly.
 */
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Destinify — Plan an entire trip with agents",
  description:
    "Destinify's trip agent runs flights, stays, itinerary, food, transport, and budget for you. Chat with it to plan a trip end to end.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
