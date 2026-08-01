import type { FeedSentence } from '@/components/StoryFeed';

interface ExportableSentence extends FeedSentence {
  author_name?: string;
}

export async function exportBookAsPdf(bookTitle: string, sentences: ExportableSentence[]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addFooter = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(String(page), pageWidth / 2, pageHeight - 28, { align: 'center' });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      addFooter();
      doc.addPage();
      y = margin;
    }
  };

  // Title page
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(20);
  const titleLines = doc.splitTextToSize(bookTitle, contentWidth);
  doc.text(titleLines, pageWidth / 2, pageHeight / 2 - 40, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(120);
  doc.text('Written collectively, one sentence at a time.', pageWidth / 2, pageHeight / 2 + 10, {
    align: 'center',
  });
  doc.text(
    `Exported ${new Date().toLocaleDateString()} · One World Sentence`,
    pageWidth / 2,
    pageHeight - margin,
    { align: 'center' }
  );

  doc.addPage();
  y = margin;

  const visible = sentences.filter((s) => s.status !== 'deleted');

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(20);

  for (const sentence of visible) {
    const text = sentence.status === 'soft_hidden' ? '[Soft-hidden by community]' : sentence.content;
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = 19;
    const blockHeight = lines.length * lineHeight + 14;

    ensureSpace(blockHeight);
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(lines, margin, y);
    y += lines.length * lineHeight;

    if (sentence.author_name) {
      doc.setFont('times', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text(`— ${sentence.author_name}`, margin, y + 12);
      y += 12;
    }
    y += 14;
  }

  addFooter();

  const filename = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'story';
  doc.save(`${filename}.pdf`);
}
