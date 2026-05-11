import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BeeMail — Email tạm thời | Bee AI Store",
  description:
    "Tạo địa chỉ email tạm thời với domain @beeaistore.site để nhận mã xác thực, test tài khoản và hạn chế spam. Nhanh, riêng tư, không cần đăng ký.",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐝</text></svg>" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
