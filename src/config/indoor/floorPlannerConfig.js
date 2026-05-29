export const MAX_EXCEL_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_SHEET_ROWS = 500

export const ALLOWED_EXCEL_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  '',
])

export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export const initialRooms = [
  { id: 'R1', floorId: 'level-1', floorName: 'Level 1', name: 'Lobby', width: 8, depth: 6, height: 3.2, x: 0, z: 0 },
  { id: 'R2', floorId: 'level-1', floorName: 'Level 1', name: 'Server Room', width: 5, depth: 4, height: 3.2, x: 9, z: 0 },
]
