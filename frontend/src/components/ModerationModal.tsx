'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/sse';
import type { FeedSentence } from './StoryFeed';

interface FlagResult {
  id: string;
  status: 'visible' | 'soft_hidden' | 'deleted';
  flag_count: number;
  threshold: number;
}

export default function ModerationModal({
  sentence,
  onClose,
  onFlagged,
}: {
  sentence: FeedSentence;
  onClose: () => void;
  onFlagged: (result: FlagResult) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sentences/${sentence.id}/flag`, {
        method: 'POST',
        body: '{}',
      });
      if (res.status === 401) {
        setError('Please sign in to flag a sentence.');
        return;
      }
      if (!res.ok) {
        setError('Could not submit your flag. Please try again.');
        return;
      }
      const result: FlagResult = await res.json();
      onFlagged(result);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
      <div className="bg-parchment rounded-xl shadow-xl max-w-sm w-full p-6">
        <h3 className="font-bold text-lg mb-2">Flag this sentence?</h3>
        <p className="text-sm text-ink/70 mb-4">
          Community flags help keep the story on track. Sentences are automatically hidden once
          enough readers flag them, and removed once flags cross the community threshold.
        </p>
        <blockquote className="border-l-2 border-ember/50 pl-3 italic text-sm text-ink/60 mb-4">
          {sentence.content}
        </blockquote>

        {error && <p className="text-ember text-sm mb-3">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg text-ink/60 hover:bg-ink/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg bg-ember text-white hover:bg-ember/90 transition-colors disabled:opacity-40"
          >
            {submitting ? 'Flagging...' : 'Flag sentence'}
          </button>
        </div>
      </div>
    </div>
  );
}
