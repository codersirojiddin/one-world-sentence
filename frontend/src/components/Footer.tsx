import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-ink/10 mt-10">
      <div className="max-w-3xl mx-auto px-6 py-8 text-center">
        <p className="text-xs text-ink/40 mb-3">
          Written collectively, one sentence every 24 hours, by anyone, everywhere.
        </p>
        <nav className="flex justify-center gap-5 text-xs text-ink/50">
          <Link href="/about" className="hover:text-ember transition-colors">
            About
          </Link>
          <Link href="/contact" className="hover:text-ember transition-colors">
            Contact
          </Link>
          <Link href="/rooms" className="hover:text-ember transition-colors">
            Genre Rooms
          </Link>
        </nav>
        <p className="text-xs text-ink/25 mt-4">
          © {new Date().getFullYear()} One World Sentence
        </p>
      </div>
    </footer>
  );
}
