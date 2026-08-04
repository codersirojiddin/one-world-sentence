import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description:
    'One World Sentence is a collaborative writing experiment where anyone can add a sentence to a shared story, one line every 24 hours.',
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-library">About One World Sentence</h1>

      <p className="text-ink/70 leading-relaxed">
        One World Sentence is a simple idea taken seriously: what if the whole internet wrote a
        story together, one sentence at a time? No single author, no outline, no plan — just
        thousands of people, each adding one line every 24 hours, letting the plot twist wherever
        the crowd takes it.
      </p>

      <p className="text-ink/70 leading-relaxed">
        The <strong>Global Story</strong> is open to everyone — sign in, add a sentence, come back
        tomorrow for another. Prefer something more focused? Create your own book, invite friends
        to collaborate, or open it up so anyone can contribute. Readers can flag sentences that
        derail the story; enough flags and a line gets hidden or removed, keeping the collective
        narrative on track without any single person controlling it.
      </p>

      <h2 className="text-lg font-bold text-library pt-4">How it works</h2>
      <ul className="list-disc list-inside text-ink/70 space-y-2">
        <li>Sign in with Google or email, then add one sentence (up to 280 characters).</li>
        <li>Everyone gets one sentence per book every 24 hours, so no one can dominate the story.</li>
        <li>Book owners and their invited collaborators can write anytime, without the 24-hour wait.</li>
        <li>Community flags keep the story on track — enough votes and a sentence is hidden or removed.</li>
        <li>Download any finished (or unfinished) book as a PDF to keep or share.</li>
      </ul>

      <p className="text-ink/70 leading-relaxed pt-2">
        Curious where the story is headed?{' '}
        <Link href="/" className="text-library hover:text-ember transition-colors underline decoration-dotted">
          Read the Global Story
        </Link>{' '}
        or{' '}
        <Link href="/rooms" className="text-library hover:text-ember transition-colors underline decoration-dotted">
          browse genre rooms
        </Link>
        .
      </p>
    </div>
  );
}
