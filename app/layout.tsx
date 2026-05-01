import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "legalOS",
    template: "%s · legalOS",
  },
  description:
    "An operating system for legal departments — AI-native entry point for the workflows, agents, and tools in-house legal teams use day-to-day.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
