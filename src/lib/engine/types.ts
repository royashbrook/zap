export type Random = () => number
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

// three colours, each also its own shape on every skin, so a colourblind kid
// reads the board by form as well as colour
export type Color = 0 | 1 | 2
export const COLORS = 3

// which way a capsule half's partner sits; none once its partner is cleared
export type Link = 'left' | 'right' | 'up' | 'down' | null

export type Cell =
  | { kind: 'germ'; color: Color }
  | { kind: 'half'; color: Color; link: Link }

export type Speed = 'calm' | 'slow' | 'medium' | 'fast'
