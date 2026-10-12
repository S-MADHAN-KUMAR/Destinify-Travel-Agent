import type { Metadata } from "next";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import ChatApp from "@/components/chat-app";

export const metadata: Metadata = {
  title: "Destinify",
  description:
    "Chat with Destinify's trip agent on a full-screen canvas: flights, stays, itinerary, food and budget, planned and re-planned as you talk.",
};

export default function ChatPage() {
  return (
    <div id="top" className="flex flex-col bg-paper">
      {/* the agent owns the first screen; the footer lives below the fold */}
      <div className="flex h-[100svh] min-h-[640px] flex-col">
        <Nav tone="dark" prefix="/" cta={{ label: "Home", href: "/" }} />
        <main className="flex min-h-0 flex-1 flex-col">
          <ChatApp />
        </main>
      </div>
      <Footer />
    </div>
  );
}
