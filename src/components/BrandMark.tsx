/**
 * The brand mark, cropped out of the supplied logo file with CSS only.
 * Source: /logo/The Shark Web Logo on White.png (1983x793), the blue mark sits
 * at x 264..568, y 248..574, so a 326px square around it is the crop we want.
 * Both values below are percentages, so the mark stays sharp at any size.
 */
export default function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="brand-logo block shrink-0"
      style={{ width: size, height: size }}
    />
  )
}
