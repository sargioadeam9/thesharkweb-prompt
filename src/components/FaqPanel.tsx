import { ArrowUpRight, ChevronDown } from 'lucide-react'

type Faq = { question: string; answer: string }

const FAQS: Faq[] = [
  {
    question: 'What is TheSharkWebPrompt?',
    answer:
      'A simple place to keep the AI prompts you use often. You save a prompt once and copy it whenever you need it again.',
  },
  {
    question: 'Do I need an account?',
    answer: 'No. There is no sign up, no email and no password. Open the app and start saving.',
  },
  {
    question: 'Where are my prompts stored?',
    answer:
      'Inside this browser, on this device. Nothing is uploaded and there is no server behind the app.',
  },
  {
    question: 'Can I see my prompts on another device?',
    answer:
      'Not right now. Each browser keeps its own copy. To move them, export a backup file and import it on the other device.',
  },
  {
    question: 'How do I back up my prompts?',
    answer:
      'Open Backup and data, then press Download JSON backup. Keep the file somewhere safe like Google Drive or Dropbox.',
  },
  {
    question: 'How do I restore a backup?',
    answer:
      'Open Backup and data, choose your file, check the preview, then pick Merge or Replace. Merge keeps what you have and adds the file. Replace starts from the file only.',
  },
  {
    question: 'What happens if I clear my browser data?',
    answer:
      'Everything goes with it. That is why the app asks you to back up. A backup file is the only copy that can survive a browser clean up.',
  },
  {
    question: 'I deleted a prompt by mistake. Can I get it back?',
    answer:
      'Yes, if you press Undo in the message at the bottom of the screen. Once that message is gone, the prompt is gone too.',
  },
  {
    question: 'What is the difference between Reset and Hard reset?',
    answer:
      'Reset removes every prompt and leaves the app ready to use. Hard reset also deletes the database itself and reloads, so the browser forgets the app completely.',
  },
  {
    question: 'What do the categories do?',
    answer:
      'They group prompts so you can find them faster. When you delete a category you can move its prompts to another one first.',
  },
  {
    question: 'Does it work on my phone?',
    answer:
      'Yes. Open it in any modern browser. You can also add it to your home screen from the browser menu.',
  },
  {
    question: 'Do you see or collect my prompts?',
    answer:
      'No. There is no server, no account and no tracking. Your prompts never leave this browser.',
  },
  {
    question: 'Is it free?',
    answer: 'Yes. It is free to use and the code is open source under the MIT license.',
  },
]

export default function FaqPanel() {
  return (
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-6">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Questions people ask</h2>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Short answers to the things that come up most. Open any question to read it.
        </p>
      </div>

      <div className="grid items-start gap-2 sm:grid-cols-2">
        {FAQS.map((item, index) => (
          <details
            key={item.question}
            open={index === 0}
            className="faq-item rounded-xl border border-line bg-surface px-4 py-2"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-medium text-ink">
              <span>{item.question}</span>
              <ChevronDown
                className="faq-chevron size-4 shrink-0 text-ink-faint"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </summary>
            <p className="mt-2 pr-5 text-[13px] leading-relaxed text-ink-muted">{item.answer}</p>
          </details>
        ))}
      </div>

      <div className="mt-7 flex justify-center">
        <a
          href="https://www.thesharkweb.com"
          target="_blank"
          rel="noopener noreferrer"
          className="faq-cta inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden="true" className="faq-cta__ring" />
          Still have questions? <span className="font-semibold">Visit thesharkweb.com</span>
          <ArrowUpRight
            className="faq-cta__arrow size-3.5"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  )
}
