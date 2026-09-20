import type { TKey } from '../../state/settings'

/** The ten activity families shown as clusters in the game library. */
export type Cat = 'memory' | 'focus' | 'sound' | 'language' | 'places' | 'everyday' | 'music' | 'stories' | 'creative' | 'calm'

export const CATS: { id: Cat; e: string; name: string; color: string }[] = [
  { id: 'memory', e: '🧠', name: 'Memory', color: '#8b7cf6' },
  { id: 'focus', e: '👁️', name: 'Focus', color: '#0ea5a4' },
  { id: 'sound', e: '🔊', name: 'Sound', color: '#f97362' },
  { id: 'language', e: '🗣️', name: 'Language', color: '#2563eb' },
  { id: 'places', e: '🧭', name: 'Places', color: '#16a34a' },
  { id: 'everyday', e: '🏠', name: 'Everyday Life', color: '#d97706' },
  { id: 'music', e: '🎵', name: 'Music', color: '#db2777' },
  { id: 'stories', e: '📖', name: 'Stories', color: '#9a3412' },
  { id: 'creative', e: '🎨', name: 'Creative', color: '#7c3aed' },
  { id: 'calm', e: '🌿', name: 'Calm', color: '#15803d' },
]

export interface GameMeta {
  id: string
  cat: Cat
  emoji: string
  /** English title and instructions (used when there is no translation key). */
  title: string
  how: string
  /** How demanding the activity is at its gentlest level (1 easy … 3 harder). */
  diff: 1 | 2 | 3
  /** Needs sound to play. */
  audio?: boolean
  /** Uses the microphone when available (always has a tap alternative). */
  voice?: boolean
  titleKey?: TKey
  howKey?: TKey
}

export const CATALOG: GameMeta[] = [
  /* ---- Memory ---- */
  { id: 'memory-match', cat: 'memory', emoji: '🃏', title: 'Memory Match', how: 'Turn over two cards at a time. Find the pictures that match.', diff: 1, titleKey: 'games.memoryMatch', howKey: 'games.memoryMatchHow' },
  { id: 'sequence', cat: 'memory', emoji: '🔔', title: 'Follow the Lights', how: 'Watch the shapes light up, then tap them in the same order.', diff: 2, titleKey: 'games.sequence', howKey: 'games.sequenceHow' },
  { id: 'recall', cat: 'memory', emoji: '🧺', title: 'Market Basket', how: 'Look at the things in the basket. Then find them again.', diff: 1, titleKey: 'games.recall', howKey: 'games.recallHow' },
  { id: 'whats-missing', cat: 'memory', emoji: '🫥', title: "What's Missing?", how: 'Look at the table. Something will be taken away. Tap what is gone.', diff: 1 },
  { id: 'face-name', cat: 'memory', emoji: '🧑‍🤝‍🧑', title: 'Friendly Faces', how: 'Meet some new neighbours and hear their names. Then tell who is who.', diff: 2 },

  /* ---- Focus ---- */
  { id: 'objects', cat: 'focus', emoji: '🔍', title: 'Name the Object', how: 'Look at the picture and choose its name.', diff: 1, titleKey: 'games.objects', howKey: 'games.objectsHow' },
  { id: 'pattern', cat: 'focus', emoji: '🔷', title: 'What Comes Next?', how: 'Look at the pattern and choose the shape that comes next.', diff: 2, titleKey: 'games.pattern', howKey: 'games.patternHow' },
  { id: 'shell-game', cat: 'focus', emoji: '🥤', title: 'Find the Ball', how: 'A ball hides under a cup. Watch the cups move, then tap where the ball is.', diff: 2 },
  { id: 'spot-difference', cat: 'focus', emoji: '🪞', title: 'Spot the Change', how: 'Two pictures look the same. Tap the things that are different on the right.', diff: 2 },
  { id: 'odd-one-out', cat: 'focus', emoji: '🍐', title: 'Odd One Out', how: 'All the pictures are the same except one. Tap the one that is different.', diff: 1 },
  { id: 'catch-stars', cat: 'focus', emoji: '⭐', title: 'Catch the Stars', how: 'Things float past slowly. Tap only the stars. Let everything else go by.', diff: 1 },

  /* ---- Sound ---- */
  { id: 'sound-focus', cat: 'sound', emoji: '🎧', title: 'Sound Focus', how: 'Listen to a busy place full of sounds. Did you hear the special sound? Answer yes or no.', diff: 3, audio: true },
  { id: 'sound-id', cat: 'sound', emoji: '👂', title: 'What Was That Sound?', how: 'Listen to a sound, then tap the picture that made it.', diff: 1, audio: true },
  { id: 'sound-sequence', cat: 'sound', emoji: '🎼', title: 'Sounds in Order', how: 'Listen to a few sounds, one after another. Then tap them in the same order.', diff: 2, audio: true },
  { id: 'sound-count', cat: 'sound', emoji: '🔢', title: 'Count the Bells', how: 'Listen carefully. How many times did the bell ring among the other sounds?', diff: 2, audio: true },
  { id: 'sound-direction', cat: 'sound', emoji: '↔️', title: 'Which Side?', how: 'Wear headphones if you can. Is the sound on your left, in the middle, or on your right?', diff: 1, audio: true },
  { id: 'sound-match', cat: 'sound', emoji: '⚖️', title: 'Same or Different?', how: 'Listen to two sounds. Were they the same sound, or different?', diff: 1, audio: true },
  { id: 'sound-change', cat: 'sound', emoji: '🔄', title: 'What Changed?', how: 'Listen to a room. Then listen again — one sound has changed. Which one is new?', diff: 3, audio: true },
  { id: 'follow-sound', cat: 'sound', emoji: '🧲', title: 'Follow the Sound', how: 'A humming sound moves around. Keep tapping the side where you hear it now.', diff: 2, audio: true },
  { id: 'sound-memory', cat: 'sound', emoji: '🗃️', title: 'Sound Pairs', how: 'Every box hides a sound. Open two boxes at a time and find the matching sounds.', diff: 2, audio: true },

  /* ---- Language ---- */
  { id: 'finish-saying', cat: 'language', emoji: '💬', title: 'Finish the Saying', how: 'Read the old saying and choose the word that finishes it.', diff: 1 },
  { id: 'spell-word', cat: 'language', emoji: '🔤', title: 'Word Builder', how: 'Look at the picture. Tap the letters in order to spell its name.', diff: 2 },
  { id: 'word-groups', cat: 'language', emoji: '🗂️', title: 'Word Groups', how: 'Tap every word that belongs to the group at the top.', diff: 1 },
  { id: 'say-picture', cat: 'language', emoji: '🎙️', title: 'Say the Picture', how: 'Look at the picture and say its name out loud. You can also tap the answer.', diff: 1, voice: true },
  { id: 'voice-echo', cat: 'language', emoji: '🗨️', title: 'Say It Back', how: 'Listen to a friendly sentence, then say it back in your own voice.', diff: 2, voice: true, audio: true },

  /* ---- Places ---- */
  { id: 'landmark-match', cat: 'places', emoji: '🗽', title: 'Landmark Match', how: 'Match each famous place to its name.', diff: 1 },
  { id: 'landmark-memory', cat: 'places', emoji: '🗺️', title: 'Landmark Memory', how: 'Look at the town map. Then the places hide. Tap where each place was.', diff: 2 },
  { id: 'place-landmark', cat: 'places', emoji: '📍', title: 'Build the Town', how: 'Read each clue and put the building in the right spot on the street.', diff: 2 },
  { id: 'where-is-this', cat: 'places', emoji: '❓', title: 'Where Is This?', how: 'Read the clue. Which place would you go to?', diff: 1 },
  { id: 'travel-route', cat: 'places', emoji: '🚶', title: 'Travel Route', how: 'Walk along the roads from home to the place shown. Tap the arrows to move.', diff: 2 },
  { id: 'landmark-sequence', cat: 'places', emoji: '🚌', title: 'Bus Tour', how: 'Watch the bus visit places around town. Then tap the places in the same order.', diff: 2 },

  /* ---- Everyday life ---- */
  { id: 'day-order', cat: 'everyday', emoji: '🌅', title: 'My Day in Order', how: 'Tap the parts of the day in the order they happen.', diff: 1, titleKey: 'games.dayOrder', howKey: 'games.dayOrderHow' },
  { id: 'set-table', cat: 'everyday', emoji: '🍽️', title: 'Set the Table', how: 'Pick up each item and put it in its place around the plate.', diff: 1 },
  { id: 'pay-shop', cat: 'everyday', emoji: '🪙', title: 'At the Shop', how: 'Pay for the item. Tap coins to make the exact price.', diff: 2 },
  { id: 'set-clock', cat: 'everyday', emoji: '🕰️', title: 'Set the Clock', how: 'Move the clock hands to show the time asked.', diff: 2 },
  { id: 'put-away', cat: 'everyday', emoji: '🧊', title: 'Put the Shopping Away', how: 'Put each item where it belongs: the fridge, the cupboard, or the fruit bowl.', diff: 1 },

  /* ---- Music ---- */
  { id: 'rhythm-copy', cat: 'music', emoji: '🥁', title: 'Copy the Beat', how: 'Listen to the drum beat, then tap the drum to play the same rhythm.', diff: 2, audio: true },
  { id: 'high-low', cat: 'music', emoji: '🎹', title: 'High or Low?', how: 'Listen to two notes. Was the second note higher or lower?', diff: 1, audio: true },
  { id: 'name-tune', cat: 'music', emoji: '🎶', title: 'Name That Tune', how: 'Listen to a well-known tune. Which song is it?', diff: 1, audio: true },

  /* ---- Stories ---- */
  { id: 'story-choice', cat: 'stories', emoji: '🧭', title: 'Choose the Story', how: 'You decide what happens in the story. Then answer a few friendly questions about it.', diff: 1 },
  { id: 'sound-story', cat: 'stories', emoji: '🎭', title: 'Sound Story', how: 'Listen to a short story full of sounds. Then answer questions about what you heard.', diff: 2, audio: true },
  { id: 'then-now', cat: 'stories', emoji: '📻', title: 'Then and Now', how: 'Match each thing from the old days with the thing we use today.', diff: 1 },

  /* ---- Creative ---- */
  { id: 'trace-shape', cat: 'creative', emoji: '✏️', title: 'Trace the Shape', how: 'Follow the dotted line with your finger or the mouse.', diff: 1 },
  { id: 'paint-number', cat: 'creative', emoji: '🖌️', title: 'Paint by Colour', how: 'Choose a colour, then tap the parts of the picture that have that colour dot.', diff: 1 },
  { id: 'connect-dots', cat: 'creative', emoji: '🔵', title: 'Join the Dots', how: 'Tap the dots in number order: 1, 2, 3… A picture will appear.', diff: 1 },
  { id: 'rotate-tiles', cat: 'creative', emoji: '🧩', title: 'Turn the Tiles', how: 'Tap a tile to turn it. Turn all the tiles until the picture is whole.', diff: 2 },
  { id: 'turn-cube', cat: 'creative', emoji: '🎲', title: 'Turn the Box', how: 'A 3D box has a picture on each side. Turn it until the asked picture faces you.', diff: 3 },

  /* ---- Calm ---- */
  { id: 'breathe', cat: 'calm', emoji: '🫧', title: 'Breathing Bubble', how: 'Hold the button while the bubble grows, and let go while it shrinks. Breathe along.', diff: 1 },
  { id: 'garden', cat: 'calm', emoji: '🌷', title: 'Little Garden', how: 'Water the flowers when they droop. Watch your garden grow.', diff: 1 },
  { id: 'sort-pebbles', cat: 'calm', emoji: '🪨', title: 'Pebble Path', how: 'Tap the pebbles from the smallest to the biggest to make a path.', diff: 1 },
]

export const byId = (id: string) => CATALOG.find((g) => g.id === id)
export const GAME_IDS = CATALOG.map((g) => g.id)
