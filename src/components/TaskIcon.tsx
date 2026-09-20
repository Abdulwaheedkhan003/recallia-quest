import { Bath, Bed, Coffee, Droplets, Footprints, GlassWater, Moon, Pill, Puzzle, Shirt, Smile, Sofa, Soup, Star, Sunrise, Utensils, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise, smile: Smile, droplets: Droplets, bath: Bath, shirt: Shirt, coffee: Coffee, utensils: Utensils,
  'glass-water': GlassWater, sofa: Sofa, puzzle: Puzzle, footprints: Footprints, soup: Soup, bed: Bed, moon: Moon, pill: Pill, star: Star,
}
export const ICON_CHOICES = Object.keys(ICONS)

export default function TaskIcon({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? Star
  return <I size={size} className={className} aria-hidden />
}
