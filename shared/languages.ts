/**
 * Language registry. To add a language:
 *   1. add an entry here
 *   2. (optionally) add src/i18n/locales/<code>.ts with any translated keys
 * Missing keys always fall back to English, so partial locales are safe.
 * `speech` is the BCP-47 tag used for future TTS / speech recognition.
 */
export type LangStatus = 'full' | 'partial' | 'placeholder'

export interface Language {
  code: string
  name: string
  native: string
  group: string
  speech: string
  /** Voice to borrow when the device has none for this language (same script, closest sound). */
  voiceFallback?: string
  status: LangStatus
  dir?: 'ltr' | 'rtl'
}

export const LANGUAGES: Language[] = [
  // Core
  { code: 'en', name: 'English', native: 'English', group: 'Core', speech: 'en-IN', status: 'full' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', group: 'Core', speech: 'hi-IN', status: 'partial' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', group: 'Core', speech: 'ta-IN', status: 'partial' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', group: 'Core', speech: 'te-IN', status: 'placeholder' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', group: 'Core', speech: 'ml-IN', status: 'placeholder' },
  // Northeast link languages
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', group: 'Northeast', speech: 'as-IN', voiceFallback: 'bn-IN', status: 'partial' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', group: 'Northeast', speech: 'ne-NP', voiceFallback: 'hi-IN', status: 'partial' },
  { code: 'mni', name: 'Manipuri (Meitei)', native: 'মৈতৈলোন্', group: 'Northeast', speech: 'mni-IN', status: 'placeholder' },
  { code: 'kha', name: 'Khasi', native: 'Ka Ktien Khasi', group: 'Northeast', speech: 'kha', status: 'placeholder' },
  { code: 'grt', name: 'Garo', native: 'A·chik', group: 'Northeast', speech: 'grt', status: 'placeholder' },
  { code: 'nag', name: 'Nagamese', native: 'Nagamese', group: 'Northeast', speech: 'nag', status: 'placeholder' },
  { code: 'njo', name: 'Ao', native: 'Ao', group: 'Northeast', speech: 'njo', status: 'placeholder' },
  { code: 'njm', name: 'Angami', native: 'Tenyidie', group: 'Northeast', speech: 'njm', status: 'placeholder' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', group: 'Northeast', speech: 'brx-IN', voiceFallback: 'hi-IN', status: 'placeholder' },
  { code: 'trp', name: 'Kokborok', native: 'Kokborok', group: 'Northeast', speech: 'trp', status: 'placeholder' },
  // Sikkim
  { code: 'sip', name: 'Sikkimese (Bhutia)', native: 'Drenjongke', group: 'Sikkim', speech: 'sip', status: 'placeholder' },
  { code: 'lep', name: 'Lepcha', native: 'Róng', group: 'Sikkim', speech: 'lep', status: 'placeholder' },
  { code: 'xsr', name: 'Sherpa', native: 'Sherwi', group: 'Sikkim', speech: 'xsr', status: 'placeholder' },
  // Himalayan
  { code: 'lif', name: 'Limbu', native: 'Yakthung Pan', group: 'Himalayan', speech: 'lif', status: 'placeholder' },
  // North-Assam (Tani)
  { code: 'apt', name: 'Apatani', native: 'Apatani', group: 'North-Assam (Tani)', speech: 'apt', status: 'placeholder' },
  { code: 'hru', name: 'Aka (Hruso)', native: 'Hruso', group: 'North-Assam (Tani)', speech: 'hru', status: 'placeholder' },
  { code: 'njz', name: 'Dafla (Nyishi)', native: 'Nyishi', group: 'North-Assam (Tani)', speech: 'njz', status: 'placeholder' },
  { code: 'adl', name: 'Galo', native: 'Galo', group: 'North-Assam (Tani)', speech: 'adl', status: 'placeholder' },
  { code: 'mrg', name: 'Mishing (Miri)', native: 'Mising', group: 'North-Assam (Tani)', speech: 'mrg', status: 'placeholder' },
  { code: 'adi', name: 'Adi (Abor)', native: 'Adi', group: 'North-Assam (Tani)', speech: 'adi', status: 'placeholder' },
  // Kuki-Chin
  { code: 'lus', name: 'Mizo (Lushai)', native: 'Mizo ṭawng', group: 'Kuki-Chin', speech: 'lus', status: 'placeholder' },
  { code: 'tcz', name: 'Thadou', native: 'Thadou', group: 'Kuki-Chin', speech: 'tcz', status: 'placeholder' },
  { code: 'pck', name: 'Paite', native: 'Paite', group: 'Kuki-Chin', speech: 'pck', status: 'placeholder' },
  { code: 'hmr', name: 'Hmar', native: 'Hmar', group: 'Kuki-Chin', speech: 'hmr', status: 'placeholder' },
  { code: 'kmm', name: 'Kom', native: 'Kom', group: 'Kuki-Chin', speech: 'kmm', status: 'placeholder' },
  { code: 'zom', name: 'Zou', native: 'Zou', group: 'Kuki-Chin', speech: 'zom', status: 'placeholder' },
  { code: 'vap', name: 'Vaiphei', native: 'Vaiphei', group: 'Kuki-Chin', speech: 'vap', status: 'placeholder' },
  { code: 'nre', name: 'Rengma', native: 'Rengma', group: 'Kuki-Chin', speech: 'nre', status: 'placeholder' },
  { code: 'lmg', name: 'Liangmei', native: 'Liangmei', group: 'Kuki-Chin', speech: 'lmg', status: 'placeholder' },
  { code: 'cnh', name: 'Lai (Hakha Chin)', native: 'Laiholh', group: 'Kuki-Chin', speech: 'cnh', status: 'placeholder' },
]

export const getLanguage = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
