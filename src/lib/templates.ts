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
    content: `Write a detailed outline for a blog post about {{topic}} aimed at {{audience}}.

Give me:
1. A working title (under 70 characters, specific, no clickbait).
2. A one-sentence thesis that states the main argument or takeaway.
3. 5-7 H2 sections. Under each H2, add:
   - 2-4 bullet points covering the key ideas, examples, or data to include
   - One sentence on why this section matters to {{audience}}
4. A short intro hook (2-3 sentences) and a conclusion with one clear call to action.

Order the sections in a logical flow from problem to solution. Avoid generic
filler sections like "What is X?" unless {{audience}} genuinely needs them.
Output in Markdown.`,
  },
  {
    id: 'tpl-landing-hero',
    title: 'Landing page hero copy',
    category: 'Marketing',
    content: `Write hero section copy for a landing page for {{product}}, which helps
{{audience}} achieve {{outcome}}.

Give me:
1. Three headline options (under 10 words each). Each one takes a different
   angle: benefit-led, problem-led, and bold/contrarian.
2. For each headline, a subheadline (under 25 words) that explains how
   {{product}} delivers {{outcome}}.
3. Two call-to-action button labels (2-4 words, starting with a verb).
4. One line of social proof or trust text I can adapt (e.g. "Used by…").

Rules: plain language, no buzzwords ("revolutionary", "seamless",
"unlock"), no exclamation marks. Speak directly to {{audience}} using "you".
End with one sentence recommending which headline to test first and why.`,
  },
  {
    id: 'tpl-cold-email',
    title: 'Cold outreach email',
    category: 'Sales',
    content: `Write a cold email to a {{role}} at {{company}} about {{offer}}.

Constraints:
- Under 120 words, no fluff, one clear ask.
- Open with a specific observation about their company or role, not a
  compliment and not "I hope this finds you well".
- Connect that observation to a problem {{offer}} solves, in one or two
  sentences.
- Include one concrete proof point (result, number, or similar customer).
- End with a single low-friction ask (e.g. a 15-minute call or a yes/no
  question).

Also give me 3 subject line options (under 6 words, lowercase, no
clickbait). If you need a fact you don't know, use a [bracketed placeholder]
instead of inventing it.`,
  },
  {
    id: 'tpl-product-description',
    title: 'Product description',
    category: 'E-commerce',
    content: `Write a product description for {{product}}.

Include:
1. A one-line hook that names the main benefit for the buyer.
2. A short paragraph (2-3 sentences) on the benefit, not the feature list:
   how the buyer's day or result is better with this product.
3. 4 scannable bullet points. Each bullet starts with a bolded benefit,
   followed by the feature that delivers it.
4. A closing line that reduces purchase risk (guarantee, shipping, care,
   or fit) if relevant.

Keep it under 150 words. Use sensory, concrete language and avoid
superlatives you can't prove ("best", "ultimate"). If key specs are
missing, add [bracketed placeholders] rather than inventing them.`,
  },
  {
    id: 'tpl-youtube-intro',
    title: 'YouTube script intro',
    category: 'Content',
    content: `Write the first 30 seconds of a YouTube video about {{topic}}
(about 75-90 spoken words).

Structure:
1. Hook the viewer in the first sentence with a surprising fact, bold
   claim, or relatable problem.
2. State what they will learn by the end of the video, in concrete terms.
3. Give a reason to keep watching (a payoff, reveal, or mistake to avoid
   that comes later).
4. Transition smoothly into the main content.

Write it to be spoken: short sentences, conversational tone, no "Hey guys,
welcome back to my channel". Add brief [B-roll] or [on-screen text] cues in
brackets where useful. Give me 2 alternative opening lines as well.`,
  },
  {
    id: 'tpl-code-reviewer',
    title: 'Code reviewer',
    category: 'Engineering',
    content: `Act as a senior {{language}} engineer reviewing this code.

Report only real problems: correctness bugs, security issues, and unclear
naming. Ignore style preferences and formatting that a linter would catch.

For each issue, give:
- Severity: Critical / Major / Minor
- Location: function name or line number
- Problem: what is wrong and why it matters (1-2 sentences)
- Fix: a concrete suggestion, with a corrected code snippet when helpful

Order issues by severity, most critical first. If you are unsure whether
something is a bug, say so and explain what you would need to confirm it.
If the code has no real problems, say so plainly instead of inventing
issues. Finish with a one-line overall verdict.

Code:
<paste code here>`,
  },
  {
    id: 'tpl-meeting-summary',
    title: 'Meeting summary',
    category: 'Productivity',
    content: `Turn these meeting notes into a summary with four sections:

1. Decisions made: what was agreed, one bullet each.
2. Open questions: what is still unresolved and who raised it.
3. Action items (owner + due date): a table with columns
   Task | Owner | Due date. Write "Unassigned" or "No date" when missing.
4. Anything that needs escalation: risks, blockers, or disagreements
   that need someone outside the meeting.

Rules: use only information in the notes; don't invent owners, dates, or
decisions. Keep each bullet to one line. Start with a 2-sentence TL;DR.
If a section has nothing, write "None".

Notes:
<paste notes here>`,
  },
  {
    id: 'tpl-study-flashcards',
    title: 'Study flashcards',
    category: 'Learning',
    content: `Create 15 flashcards from this material on {{topic}}.

Each card is a single question on the front and a short, self-contained
answer on the back (1-2 sentences). Cover the most important concepts
first, then definitions, then common mistakes or edge cases.

Rules:
- One idea per card; no "list all…" questions.
- Mix question types: definition, why/how, compare/contrast, and
  apply-to-an-example.
- The answer must make sense without seeing the question's source text.
- Use only facts from the material provided.

Output as a Markdown table with columns: # | Front | Back.
Then add a CSV version (front,back) I can import into Anki or Quizlet.

Material:
<paste material here>`,
  },
]
