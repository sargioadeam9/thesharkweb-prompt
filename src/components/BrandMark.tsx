export default function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-[8px]"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(145deg, var(--color-brand) 0%, var(--color-brand-deep) 100%)',
      }}
    />
  )
}
