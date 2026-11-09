/******************************************************************************\
  templates.ts — the curated starting points shown on the Templates page.

  These are UI strings, not data. Nothing here is written to IndexedDB; a
  template only becomes a prompt when the user saves it from the modal.
  Placeholders use {{double_braces}} so they are obvious to find and replace.
\* **************************************************************************/

export type Template = {
  id: string
  title: string
  category: string
  content: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-blog-outline',
    title: 'Blog post outline',
    category: 'Writing',
    content:
      'Write a detailed outline for a blog post about {{topic}} aimed at {{audience}}. Give me a working title, a one-sentence thesis, and 5-7 H2 sections. Under each section, list 2-3 bullet points of what to cover and one concrete example or stat to include.',
  },
  {
    id: 'tpl-landing-hero',
    title: 'Landing page hero copy',
    category: 'Marketing',
    content:
      'Write hero section copy for a landing page for {{product}}, which helps {{audience}} achieve {{outcome}}. Give me three headline options (under 10 words each), a supporting subheadline, and two CTA button labels. Keep the tone {{tone}}.',
  },
  {
    id: 'tpl-cold-email',
    title: 'Cold outreach email',
    category: 'Sales',
    content:
      'Write a cold email to {{role}} at {{company}} about {{offer}}. Under 120 words, no fluff, one clear ask. Open with a specific observation about their business, connect it to a problem, and end with a low-friction next step. Give me a subject line under 6 words.',
  },
  {
    id: 'tpl-product-description',
    title: 'Product description',
    category: 'E-commerce',
    content:
      'Write a product description for {{product}}. Include a one-line hook, a short paragraph on the benefit (not the feature list), and 4 scannable bullet points. Write for {{audience}} and keep it under 150 words. Avoid superlatives like "revolutionary".',
  },
  {
    id: 'tpl-youtube-intro',
    title: 'YouTube script intro',
    category: 'Content',
    content:
      'Write the first 30 seconds of a YouTube video about {{topic}}. Hook the viewer in the first sentence, state what they will learn, and give a reason to keep watching. Conversational, no "hey guys", no long channel intro. Return it as spoken script lines.',
  },
  {
    id: 'tpl-code-reviewer',
    title: 'Code reviewer',
    category: 'Engineering',
    content:
      'Act as a senior {{language}} engineer reviewing this code. Report only real problems: correctness bugs, security issues, and unclear naming. For each finding give the line, why it matters, and a concrete fix. Skip style preferences unless they hide a bug. If the code is fine, say so plainly.',
  },
  {
    id: 'tpl-meeting-summary',
    title: 'Meeting summary',
    category: 'Productivity',
    content:
      'Turn these meeting notes into a summary with four sections: Decisions made, Open questions, Action items (owner + due date), and Anything that needs escalation. Be terse. Do not invent owners or dates that are not in the notes; mark them as TBD instead.',
  },
  {
    id: 'tpl-study-flashcards',
    title: 'Study flashcards',
    category: 'Learning',
    content:
      'Create 15 flashcards from this material on {{topic}}. Each card is a single question on the front and a short, self-contained answer on the back. Cover the core concepts first, then the edge cases. Format as "Q: ... / A: ..." one per line.',
  },
]
