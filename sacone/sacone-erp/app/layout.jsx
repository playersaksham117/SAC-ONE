import './globals.css';
import { AuthProvider } from '../lib/auth-context';

export const metadata = {
  title: 'SACONE ERP',
  description: 'Modular Business Management System',
  applicationName: 'SACONE ERP',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
