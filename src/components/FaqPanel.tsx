import { ArrowUpRight, ChevronDown } from 'lucide-react'

type Faq = { question: string; answer: string }

const FAQS: Faq[] = [
  {
    question: 'What is TheSharkWebPrompt?',
    answer:
      'A private library for the AI prompts you use often. Save a prompt once, organise it with categories and tags, and copy it whenever you need it. It works offline in your browser.',
  },
  {
    question: 'Is it free?',
    answer:
      'Local use is free forever, and the code is open source under the MIT license. Live cloud sync is an optional paid plan for people who want the same library on several devices.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'Not for local use. Open the app and start saving. You only sign in with Google when you want Live cloud sync, so the same library can follow you to other devices.',
  },
  {
    question: 'Does AI see my prompts?',
    answer:
      'Only the text you type into Prompt Enhancer or Prompt Generator, and only when you press Run. It goes to a third-party AI provider to generate the result. Your saved library is never sent. Do not paste passwords or API keys.',
  },
  {
    question: 'Where are my prompts stored?',
    answer:
      'In this browser, on this device, by default. If you turn on Live cloud sync, a copy is also stored in our cloud so your signed-in devices can read it.',
  },
  {
    question: 'Can I use the same prompts on another device?',
    answer:
      'Yes, with Live cloud sync. Sign in with the same Google account, press Sync now, and your prompts and tasks appear there. Without Live cloud sync, export a JSON backup and import it on the other device.',
  },
  {
    question: 'What is Live cloud sync?',
    answer:
      'An optional add-on that keeps one library across the devices you sign in on. You stay in control: it runs when you press Sync now, and it merges changes instead of overwriting them.',
  },
  {
    question: 'How does Live cloud sync activation work?',
    answer:
      'Pay with bKash or Nagad, then submit the transaction ID in the app. We check every payment by hand, so activation usually takes a few minutes. You get an email when your plan is active.',
  },
  {
    question: 'What do the Live cloud sync plans include?',
    answer:
      'Monthly sync covers 3 devices and 500 prompts. Annual and Lifetime are unlimited. Prices and full limits are shown in the app before you pay.',
  },
  {
    question: 'What happens when my sync plan ends?',
    answer:
      'Nothing is deleted. Your local library stays complete, export keeps working, and you can renew any time. We email a reminder 3 days before expiry.',
  },
  {
    question: 'How do I remove an old device from Live cloud sync?',
    answer:
      'Message support on WhatsApp with the device you no longer use. We clear it from your account so a new device can take its place.',
  },
  {
    question: 'How do I back up my prompts?',
    answer:
      'Open Backup and data, then press Download JSON backup. Keep the file somewhere safe like Google Drive or Dropbox. You can also have the file emailed to you from the same screen. A JSON backup works even if a sync plan ends.',
  },
  {
    question: 'How do I restore a backup?',
    answer:
      'Open Backup and data, choose your file, check the preview, then pick Merge or Replace. Merge keeps what you have and adds the file. Replace starts from the file only.',
  },
  {
    question: 'What happens if I clear my browser data?',
    answer:
      'The local copy goes with it. With Live cloud sync, sign in again and pull the cloud copy; otherwise import your latest backup file. Either way, the habit that saves you is a regular JSON backup.',
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
      'Local use is private: there is no tracking, no ads, and nothing is uploaded. With Live cloud sync the synced copy is stored on our servers and our team can read it, so do not sync secrets. We never see your bKash or Nagad credentials, only the transaction ID you type in.',
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

      <div className="mt-7 flex flex-col items-center gap-3">
        <a
          href="https://sharkweb-main-2026-frontend.vercel.app/"
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

        <p className="text-center text-[11px] text-ink-faint">
          Or message us on{' '}
          <a
            href={`https://wa.me/8801896444400?text=${encodeURIComponent(
              'Hi! I have a question about TheSharkWebPrompt.',
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-deep underline underline-offset-2 hover:no-underline"
          >
            WhatsApp
          </a>{' '}
          for instant 24/7 support.
        </p>
      </div>
    </div>
  )
}
