import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Nail Nurse | Healthy Nails, Happy You",
  description: "Thoughtful nail care and pretty little details in Ho, Ghana. Book your appointment with The Nail Nurse.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
