import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "talk-to-form: speak an incident report in any language",
  description:
    "Say what happened in any language. Get a formal German or English incident report, checked field by field by a person.",
};

export const viewport: Viewport = {
  themeColor: "#0e1013",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
