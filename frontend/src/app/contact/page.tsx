import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the One World Sentence team — questions, feedback, or content reports.',
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-library">Contact</h1>

      <p className="text-ink/70 leading-relaxed">
        Questions, feedback, partnership ideas, or something in the story that needs a closer
        look? We&apos;d love to hear from you.
      </p>

      <div className="border border-ink/10 rounded-xl p-5 bg-white space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink/60 mb-1">General inquiries</h2>
          <a
            href="mailto:hello@oneworldsentence.site"
            className="text-library hover:text-ember transition-colors underline decoration-dotted"
          >
            hello@oneworldsentence.site
          </a>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink/60 mb-1">Report content</h2>
          <p className="text-sm text-ink/70">
            You can flag any sentence directly from the story feed — enough community flags will
            automatically hide or remove it. For anything that needs urgent attention, email{' '}
            <a
              href="mailto:report@oneworldsentence.site"
              className="text-library hover:text-ember transition-colors underline decoration-dotted"
            >
              report@oneworldsentence.site
            </a>
            .
          </p>
        </div>
      </div>

      <p className="text-xs text-ink/40">We usually reply within a few days.</p>
    </div>
  );
}
