import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KRCTech DocAI - 토목설계 문서 AI 플랫폼",
  description: "인허가 절차, 설계기준 등 토목설계 업무 문서를 업로드하고 AI에게 질문하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
