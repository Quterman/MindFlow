import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-дневник рефлексии",
  description:
    "MVP продукта: голосовые мысли превращаются в summary, инсайты, todo и повторяющиеся паттерны по дням.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
