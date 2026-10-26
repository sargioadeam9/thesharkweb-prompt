/**
 * Soft tints for prompt cards. Each prompt picks one by hashing its id, so a
 * card keeps the same colour forever and a grid never looks flat.
 * All six stay light enough for ink text to pass AA contrast.
 */
export const CARD_TINTS = [
  { from: '#eaf4fe', to: '#dbeafe' }, // sky
  { from: '#fdeee2', to: '#fbe0cd' }, // peach
  { from: '#f2ecfe', to: '#e8dcfd' }, // lilac
  { from: '#e6f7ee', to: '#d5f1e1' }, // mint
  { from: '#fdf7db', to: '#faefc6' }, // lemon
  { from: '#fde9ed', to: '#fbdde4' }, // rose
] as const

export function tintForPrompt(id: string): { from: string; to: string } {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return CARD_TINTS[hash % CARD_TINTS.length]
}
