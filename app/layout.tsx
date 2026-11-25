import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบประมาณการรายรับเงินรายได้ | คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มช.',
  description:
    'ระบบประมาณการรายรับเงินรายได้ จัดสรรกรอบงบประมาณ และติดตามรายรับจริง คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
