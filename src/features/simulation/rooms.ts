import type { TKey } from '../../state/settings'

/**
 * Home Simulation data model. Kept separate from rendering so a future
 * 3D / Unreal front-end can reuse the same rooms, objects and actions.
 */
export type SimAction =
  | { type: 'complete'; keys: string[] }            // mark a routine task done (by template key)
  | { type: 'meal' }                                 // complete the meal for the current part of day
  | { type: 'go'; route: string }                   // open another area
  | { type: 'time' }                                 // say the current time
  | { type: 'remind'; text: TKey; inMinutes?: number; at?: string; daily?: boolean } // create a real reminder
  | { type: 'meds' }                                 // show configured medication tasks

export interface SimObject { id: string; emoji: string; label: TKey; info: TKey; steps?: TKey; x: number; y: number; size?: number; actions: SimAction[] }
export interface Room { id: string; label: TKey; emoji: string; wall: string; floor: string; objects: SimObject[] }

export const ROOMS: Room[] = [
  {
    id: 'bedroom', label: 'sim.bedroom', emoji: '🛏️', wall: '#e9e2ff', floor: '#c9a27a',
    objects: [
      { id: 'bed', emoji: '🛏️', label: 'sim.bed', info: 'sim.bedInfo', steps: 'sim.bedSteps', x: 30, y: 62, size: 7, actions: [{ type: 'complete', keys: ['prepare_sleep'] }] },
      { id: 'wardrobe', emoji: '👕', label: 'sim.wardrobe', info: 'sim.wardrobeInfo', steps: 'sim.dressSteps', x: 75, y: 40, actions: [{ type: 'complete', keys: ['dress'] }] },
      { id: 'clock', emoji: '⏰', label: 'sim.clock', info: 'sim.clockInfo', x: 55, y: 22, actions: [{ type: 'time' }] },
      { id: 'photo', emoji: '🖼️', label: 'sim.photo', info: 'sim.photoInfo', x: 18, y: 25, actions: [{ type: 'go', route: '/capsule' }] },
      { id: 'lamp', emoji: '💡', label: 'sim.lamp', info: 'sim.lampInfo', x: 58, y: 55, actions: [] },
    ],
  },
  {
    id: 'bathroom', label: 'sim.bathroom', emoji: '🛁', wall: '#d7f3f7', floor: '#9cc9cf',
    objects: [
      { id: 'toothbrush', emoji: '🪥', label: 'sim.toothbrush', info: 'sim.toothbrushInfo', steps: 'sim.brushSteps', x: 25, y: 40, actions: [{ type: 'complete', keys: ['brush_am', 'brush_pm'] }] },
      { id: 'sink', emoji: '🚰', label: 'sim.sink', info: 'sim.sinkInfo', steps: 'sim.washSteps', x: 45, y: 48, actions: [{ type: 'complete', keys: ['wash_face'] }] },
      { id: 'soap', emoji: '🧼', label: 'sim.soap', info: 'sim.soapInfo', steps: 'sim.handSteps', x: 62, y: 45, actions: [] },
      { id: 'shower', emoji: '🚿', label: 'sim.shower', info: 'sim.showerInfo', steps: 'sim.bathSteps', x: 80, y: 30, size: 6, actions: [{ type: 'complete', keys: ['bath'] }] },
      { id: 'mat', emoji: '⚠️', label: 'sim.mat', info: 'sim.matInfo', x: 60, y: 78, actions: [] },
    ],
  },
  {
    id: 'kitchen', label: 'sim.kitchen', emoji: '🍳', wall: '#fff1d6', floor: '#d8b98c',
    objects: [
      { id: 'water', emoji: '🥤', label: 'sim.water', info: 'sim.waterInfo', x: 22, y: 52, actions: [{ type: 'complete', keys: ['water'] }, { type: 'remind', text: 'sim.remindWater', inMinutes: 120 }] },
      { id: 'stove', emoji: '🔥', label: 'sim.stove', info: 'sim.stoveInfo', steps: 'sim.stoveSteps', x: 48, y: 45, actions: [{ type: 'remind', text: 'sim.remindStove', at: '21:00', daily: true }] },
      { id: 'food', emoji: '🍲', label: 'sim.food', info: 'sim.foodInfo', x: 70, y: 58, actions: [{ type: 'meal' }] },
      { id: 'fridge', emoji: '🧊', label: 'sim.fridge', info: 'sim.fridgeInfo', x: 85, y: 30, size: 6, actions: [] },
      { id: 'kettle', emoji: '🫖', label: 'sim.kettle', info: 'sim.kettleInfo', x: 35, y: 30, actions: [] },
    ],
  },
  {
    id: 'living', label: 'sim.living', emoji: '🛋️', wall: '#ffe4dc', floor: '#b88a6a',
    objects: [
      { id: 'radio', emoji: '📻', label: 'sim.radio', info: 'sim.radioInfo', x: 20, y: 45, actions: [{ type: 'go', route: '/song' }] },
      { id: 'tv', emoji: '📺', label: 'sim.tv', info: 'sim.tvInfo', x: 50, y: 30, size: 6, actions: [{ type: 'go', route: '/relax' }] },
      { id: 'sofa', emoji: '🛋️', label: 'sim.sofa', info: 'sim.sofaInfo', x: 50, y: 65, size: 7, actions: [{ type: 'complete', keys: ['rest'] }] },
      { id: 'phone', emoji: '☎️', label: 'sim.phone', info: 'sim.phoneInfo', x: 80, y: 50, actions: [{ type: 'go', route: '/interact' }] },
      { id: 'books', emoji: '📚', label: 'sim.books', info: 'sim.booksInfo', x: 82, y: 25, actions: [{ type: 'go', route: '/stories' }] },
    ],
  },
  {
    id: 'dining', label: 'sim.dining', emoji: '🍽️', wall: '#f1f7d9', floor: '#c7a57f',
    objects: [
      { id: 'table', emoji: '🍽️', label: 'sim.table', info: 'sim.tableInfo', x: 50, y: 58, size: 7, actions: [{ type: 'meal' }] },
      { id: 'jug', emoji: '🫗', label: 'sim.jug', info: 'sim.waterInfo', x: 28, y: 45, actions: [{ type: 'complete', keys: ['water'] }] },
      { id: 'plant', emoji: '🪴', label: 'sim.plant', info: 'sim.plantInfo', x: 82, y: 40, actions: [] },
    ],
  },
  {
    id: 'entrance', label: 'sim.entrance', emoji: '🚪', wall: '#e7ecf3', floor: '#a9a39a',
    objects: [
      { id: 'door', emoji: '🚪', label: 'sim.door', info: 'sim.doorInfo', steps: 'sim.doorSteps', x: 50, y: 40, size: 7, actions: [] },
      { id: 'shoes', emoji: '👟', label: 'sim.shoes', info: 'sim.shoesInfo', x: 25, y: 72, actions: [{ type: 'complete', keys: ['walk'] }] },
      { id: 'keys', emoji: '🔑', label: 'sim.keys', info: 'sim.keysInfo', x: 78, y: 45, actions: [] },
      { id: 'calendar', emoji: '📅', label: 'sim.calendar', info: 'sim.calendarInfo', x: 20, y: 30, actions: [{ type: 'go', route: '/agent' }] },
    ],
  },
  {
    id: 'medicine', label: 'sim.medicine', emoji: '💊', wall: '#fde2ef', floor: '#d6b2c2',
    objects: [
      { id: 'pillbox', emoji: '💊', label: 'sim.pillbox', info: 'sim.pillboxInfo', x: 45, y: 50, size: 7, actions: [{ type: 'meds' }] },
      { id: 'glass', emoji: '🥛', label: 'sim.glass', info: 'sim.glassInfo', x: 70, y: 52, actions: [{ type: 'complete', keys: ['water'] }] },
      { id: 'note', emoji: '📝', label: 'sim.note', info: 'sim.noteInfo', x: 22, y: 35, actions: [] },
    ],
  },
  {
    id: 'hallway', label: 'sim.hallway', emoji: '🚪', wall: '#f3efe6', floor: '#b9a58a',
    objects: [
      { id: 'hallLight', emoji: '💡', label: 'sim.hallLight', info: 'sim.hallLightInfo', x: 30, y: 25, actions: [{ type: 'remind', text: 'sim.remindLights', at: '19:00', daily: true }] },
      { id: 'handrail', emoji: '🦯', label: 'sim.handrail', info: 'sim.handrailInfo', x: 55, y: 50, actions: [] },
      { id: 'signs', emoji: '🪧', label: 'sim.signs', info: 'sim.signsInfo', x: 75, y: 30, actions: [] },
      { id: 'runner', emoji: '🟫', label: 'sim.runner', info: 'sim.runnerInfo', x: 50, y: 78, actions: [] },
    ],
  },
  {
    id: 'toilet', label: 'sim.toilet', emoji: '🚽', wall: '#e3f6f8', floor: '#9fd0d6',
    objects: [
      { id: 'toiletSeat', emoji: '🚽', label: 'sim.toiletSeat', info: 'sim.toiletSeatInfo', steps: 'sim.handSteps', x: 45, y: 55, actions: [] },
      { id: 'grabRail', emoji: '🟥', label: 'sim.grabRail', info: 'sim.grabRailInfo', x: 75, y: 45, actions: [] },
      { id: 'toiletSign', emoji: '🪧', label: 'sim.toiletSign', info: 'sim.toiletSignInfo', x: 25, y: 25, actions: [] },
    ],
  },
  {
    id: 'laundry', label: 'sim.laundry', emoji: '🧺', wall: '#eef7ff', floor: '#c6d4dc',
    objects: [
      { id: 'washer', emoji: '🫧', label: 'sim.washer', info: 'sim.washerInfo', x: 35, y: 45, actions: [{ type: 'remind', text: 'sim.remindLaundry', inMinutes: 90 }] },
      { id: 'basket', emoji: '🧺', label: 'sim.basket', info: 'sim.basketInfo', x: 65, y: 65, actions: [] },
      { id: 'backDoor', emoji: '🚪', label: 'sim.backDoor', info: 'sim.backDoorInfo', x: 50, y: 20, actions: [] },
    ],
  },
  {
    id: 'study', label: 'sim.study', emoji: '🎨', wall: '#fdf0dc', floor: '#a47551',
    objects: [
      { id: 'armchair', emoji: '🪑', label: 'sim.armchair', info: 'sim.armchairInfo', x: 30, y: 60, actions: [{ type: 'go', route: '/stories' }] },
      { id: 'puzzle', emoji: '🧩', label: 'sim.puzzle', info: 'sim.puzzleInfo', x: 65, y: 55, actions: [{ type: 'go', route: '/games' }] },
      { id: 'album', emoji: '📔', label: 'sim.album', info: 'sim.albumInfo', x: 50, y: 30, actions: [{ type: 'go', route: '/capsule' }] },
      { id: 'gramophone', emoji: '🎶', label: 'sim.gramophone', info: 'sim.gramophoneInfo', x: 80, y: 35, actions: [{ type: 'go', route: '/song' }] },
    ],
  },
  {
    id: 'garden', label: 'sim.garden', emoji: '🌳', wall: '#dff5e3', floor: '#7cc46f',
    objects: [
      { id: 'bench', emoji: '🪑', label: 'sim.bench', info: 'sim.benchInfo', x: 30, y: 55, actions: [{ type: 'go', route: '/relax' }] },
      { id: 'flowers', emoji: '🌷', label: 'sim.flowers', info: 'sim.flowersInfo', x: 60, y: 60, actions: [{ type: 'complete', keys: ['walk'] }] },
      { id: 'clothesline', emoji: '👚', label: 'sim.clothesline', info: 'sim.clotheslineInfo', x: 75, y: 30, actions: [] },
      { id: 'birdbath', emoji: '🐦', label: 'sim.birdbath', info: 'sim.birdbathInfo', x: 45, y: 30, actions: [] },
    ],
  },
]
