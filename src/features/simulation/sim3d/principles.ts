/** Dementia-friendly design principle behind each object (used for tips, "with / without" and related tips). */
export type Principle = 'familiar' | 'lighting' | 'contrast' | 'safety' | 'signage' | 'orientation' | 'calm' | 'nature' | 'independence'

export const PRINCIPLE_OF: Record<string, Principle> = {
  bed: 'contrast', wardrobe: 'independence', clock: 'orientation', photo: 'familiar', lamp: 'lighting',
  toothbrush: 'calm', sink: 'contrast', soap: 'contrast', shower: 'safety', mat: 'safety',
  toiletSeat: 'contrast', grabRail: 'safety', toiletSign: 'signage',
  pillbox: 'safety', glass: 'independence', note: 'safety',
  hallLight: 'lighting', handrail: 'safety', signs: 'signage', runner: 'safety',
  washer: 'independence', basket: 'calm', backDoor: 'signage',
  water: 'independence', stove: 'safety', kettle: 'safety', fridge: 'signage', food: 'contrast',
  table: 'contrast', jug: 'independence', plant: 'nature',
  sofa: 'contrast', tv: 'calm', radio: 'familiar', phone: 'independence', books: 'familiar',
  armchair: 'lighting', puzzle: 'calm', album: 'familiar', gramophone: 'familiar',
  door: 'orientation', shoes: 'independence', keys: 'independence', calendar: 'orientation',
  bench: 'nature', flowers: 'nature', clothesline: 'independence', birdbath: 'nature',
}

export const PRINCIPLE_ICON: Record<Principle, string> = {
  familiar: '🖼️', lighting: '💡', contrast: '🎨', safety: '🛡️', signage: '🪧', orientation: '🧭', calm: '🍃', nature: '🌳', independence: '🙌',
}
