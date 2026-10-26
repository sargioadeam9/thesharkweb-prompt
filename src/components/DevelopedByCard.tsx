import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Globe, Mail, MessageCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './DevelopedByCard.css'

type CreditLink = {
  label: string
  href: string
  icon: LucideIcon
  external: boolean
}

const LINKS: CreditLink[] = [
  {
    label: '+880 1896 444400',
    href: 'https://wa.me/8801896444400',
    icon: MessageCircle,
    external: true,
  },
  {
    label: 'info@zonaedhossain.com',
    href: 'mailto:info@zonaedhossain.com',
    icon: Mail,
    external: false,
  },
  {
    label: 'www.zonaedhossain.com',
    href: 'https://www.zonaedhossain.com',
    icon: Globe,
    external: true,
  },
]

export default function DevelopedByCard() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = cardRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="credit" ref={cardRef} data-shown={shown} aria-labelledby="credit-label">
      <div className="credit__surface">
        <div className="credit__inner">
          <div className="credit__head">
            <img
              className="credit__logo"
              src="/logo/the-shark-web-logo.png"
              alt="The Shark Web"
              width={210}
              height={84}
              decoding="async"
            />
            <h2 className="credit__label" id="credit-label">
              Developed by
            </h2>
            <p className="credit__name">Zonaed Hossain</p>
            <p className="credit__role">
              Founder &amp; CMO
              <span className="credit__sep" aria-hidden="true">
                |
              </span>
              The Shark Web
            </p>
          </div>

          <ul className="credit__links">
            {LINKS.map(({ label, href, icon: Icon, external }) => (
              <li key={href}>
                <a
                  className="credit__link"
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <span className="credit__icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="credit__text">{label}</span>
                  {external ? (
                    <>
                      <ArrowUpRight className="credit__arrow" size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
