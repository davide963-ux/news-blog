import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div id="main">{children}</div>
      <Footer />
    </>
  );
}
