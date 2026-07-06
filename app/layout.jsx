import "./globals.css";

export const metadata = {
  title: "Wordrill Chat",
  description: "Next.js realtime chat prototype"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
