'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/sse';

const MAX_LENGTH = 280;

export default function SentenceInput({ bookId }: { bookId: string }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [locked, setLocked] = useState(false);

  const remaining = MAX_LENGTH - content.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/sentences', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), book_id: bookId }),
      });

      if (res.status === 401) {
        setMessage({ type: 'error', text: 'Please sign in to add a sentence.' });
        return;
      }
      if (res.status === 403) {
        setMessage({
          type: 'error',
          text: "This book isn't open for public contributions. Ask the owner to invite you as a collaborator.",
        });
        return;
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? '0');
        const hours = Math.ceil(retryAfter / 3600);
        setLocked(true);
        setMessage({
          type: 'error',
          text: `You can only add one sentence to this book every 24 hours. Try again in about ${hours}h.`,
        });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setMessage({ type: 'error', text: text || 'Something went wrong submitting your sentence.' });
        return;
      }

      setContent('');
      setMessage({ type: 'success', text: 'Your sentence joined the story!' });
    } catch {
      setMessage({ type: 'error', text: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-ink/10 pt-6 mt-8">
      <label htmlFor="sentence" className="block text-sm text-ink/60 mb-2">
        Continue the story with one sentence:
      </label>
      <textarea
        id="sentence"
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH))}
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder="And then..."
        className="w-full border border-ink/20 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-library/40 resize-none"
        disabled={submitting || locked}
      />
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${remaining < 20 ? 'text-ember' : 'text-ink/40'}`}>
          {remaining} characters remaining
        </span>
        <button
          type="submit"
          disabled={submitting || !content.trim() || locked}
          className="bg-library text-parchment px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-library/90 transition-colors"
        >
          {submitting ? 'Submitting...' : 'Add sentence'}
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-ember'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
