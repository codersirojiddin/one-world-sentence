'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE, subscribeToStory, SentenceCreatedEvent, SentenceModeratedEvent } from '@/lib/sse';
import ModerationModal from './ModerationModal';

export interface FeedSentence {
  id: string;
  sequence_order: number;
  content: string;
  status: 'visible' | 'soft_hidden' | 'deleted';
  flag_count: number;
  created_at: string;
  author_name?: string;
}

const COLD_START_THRESHOLD_MS = 1500;

export default function StoryFeed({ bookId }: { bookId: string }) {
  const [sentences, setSentences] = useState<FeedSentence[] | null>(null);
  const [showColdStartLoader, setShowColdStartLoader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<FeedSentence | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const coldStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    coldStartTimer.current = setTimeout(() => {
      if (!cancelled) setShowColdStartLoader(true);
    }, COLD_START_THRESHOLD_MS);

    fetch(`${API_BASE}/api/sentences?book_id=${encodeURIComponent(bookId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load the story.');
        return res.json();
      })
      .then((data: FeedSentence[]) => {
        if (!cancelled) setSentences(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Something went wrong.');
      })
      .finally(() => {
        if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
        if (!cancelled) setShowColdStartLoader(false);
      });

    const unsubscribe = subscribeToStory(bookId, {
      onCreated: (event: SentenceCreatedEvent) => {
        setSentences((prev) => {
          const next = prev ? [...prev] : [];
          if (next.some((s) => s.id === event.id)) return next;
          next.push({
            id: event.id,
            sequence_order: event.sequence_order,
            content: event.content,
            status: event.status,
            flag_count: event.flag_count,
            created_at: event.created_at,
            author_name: event.author_name,
          });
          return next.sort((a, b) => a.sequence_order - b.sequence_order);
        });
      },
      onModerated: (event: SentenceModeratedEvent) => {
        setSentences((prev) =>
          prev
            ? prev
                .map((s) => (s.id === event.id ? { ...s, status: event.status, flag_count: event.flag_count } : s))
                .filter((s) => s.status !== 'deleted')
            : prev
        );
      },
    });

    return () => {
      cancelled = true;
      if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
      unsubscribe();
    };
  }, [bookId]);

  async function handleReveal(sentence: FeedSentence) {
    if (revealed[sentence.id]) return;
    try {
      const res = await fetch(`${API_BASE}/api/sentences/${sentence.id}/reveal`);
      if (!res.ok) return;
      const data = await res.json();
      setRevealed((prev) => ({ ...prev, [sentence.id]: data.content }));
    } catch {
      // silently ignore — the sentence just stays blurred
    }
  }

  if (showColdStartLoader && sentences === null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 animate-pulseSoft">
        <div className="w-10 h-10 border-4 border-library/20 border-t-library rounded-full animate-spin" />
        <p className="text-ink/60 italic">Waking up the digital library...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-ember text-center py-12">{error}</p>;
  }

  if (sentences === null) {
    return <div className="py-12" />; // fast path: nothing rendered before the 1.5s threshold
  }

  return (
    <div className="space-y-1">
      <p className="text-lg leading-relaxed">
        {sentences.map((s) => (
          <span key={s.id} className="group relative">
            {s.status === 'soft_hidden' && !revealed[s.id] ? (
              <span
                className="blur-sentence bg-ink/5 rounded px-1"
                onClick={() => handleReveal(s)}
                title="Click to reveal"
              >
                {s.content}{' '}
              </span>
            ) : (
              <span>{revealed[s.id] ?? s.content} </span>
            )}
            <button
              onClick={() => setFlagTarget(s)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs align-super text-ink/30 hover:text-ember ml-0.5"
              title="Flag this sentence"
            >
              [flag]
            </button>
          </span>
        ))}
      </p>

      {sentences.length === 0 && (
        <p className="text-ink/40 italic text-center py-16">
          No one has written the first sentence yet. Be the one who begins the story.
        </p>
      )}

      {flagTarget && (
        <ModerationModal
          sentence={flagTarget}
          onClose={() => setFlagTarget(null)}
          onFlagged={(result) => {
            setSentences((prev) =>
              prev
                ? prev
                    .map((s) => (s.id === result.id ? { ...s, status: result.status, flag_count: result.flag_count } : s))
                    .filter((s) => s.status !== 'deleted')
                : prev
            );
            setFlagTarget(null);
          }}
        />
      )}
    </div>
  );
}
