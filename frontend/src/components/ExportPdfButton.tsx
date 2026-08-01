'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/sse';
import type { FeedSentence } from './StoryFeed';

export default function ExportPdfButton({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/sentences?book_id=${encodeURIComponent(bookId)}`);
      if (!res.ok) throw new Error('Could not load the story.');
      const sentences: FeedSentence[] = await res.json();
      if (sentences.length === 0) {
        setError('Nothing to export yet — the story is still empty.');
        return;
      }
      const { exportBookAsPdf } = await import('@/lib/pdf');
      await exportBookAsPdf(bookTitle, sentences);
    } catch {
      setError('Could not generate the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        onClick={handleExport}
        disabled={busy}
        title="Download this book as a PDF"
        className="text-sm px-3 py-1.5 rounded-lg border border-ink/20 text-ink/60 hover:border-library/40 hover:text-library transition-colors disabled:opacity-40"
      >
        {busy ? 'Preparing PDF…' : '⬇ Download PDF'}
      </button>
      {error && <span className="text-xs text-ember mt-1">{error}</span>}
    </div>
  );
}
