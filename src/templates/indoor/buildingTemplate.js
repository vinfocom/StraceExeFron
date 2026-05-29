import ExcelJS from 'exceljs'
import { addJsonWorksheet } from '../../utils/indoor/excelPlan'

const getTemplateRooms = (floor) => {
  if (floor === 1) {
    return [
      { room_name: 'Central Hall', x: 4, z: 4, width: 12, depth: 12, type: 'lobby', shape: 'circle', radius: 6, polygon_json: '' },
      { room_name: 'Reception', x: 10, z: 2, width: 4, depth: 3, type: 'front-desk', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Security', x: 14, z: 5, width: 3, depth: 3, type: 'security', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Retail A', x: 3, z: 11.5, width: 3.5, depth: 3, type: 'retail', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Retail B', x: 13.5, z: 11.5, width: 3.5, depth: 3, type: 'retail', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Study Nook', x: 0, z: 0, width: 0, depth: 0, type: 'service', shape: 'polygon', radius: '', polygon_json: '[[12.5,10],[14,10.8],[13.2,12.2],[11.9,11.5]]' },
    ]
  }

  if (floor <= 6) {
    return [
      { room_name: 'Lift Lobby', x: 0, z: 0, width: 5, depth: 5, type: 'lobby', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Open Office', x: 5, z: 0, width: 12, depth: 6, type: 'office', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Meeting Room', x: 17, z: 0, width: 5, depth: 6, type: 'meeting', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Work Area', x: 0, z: 6, width: 10, depth: 6, type: 'office', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Pantry', x: 10, z: 6, width: 4, depth: 3, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Restroom', x: 10, z: 9, width: 4, depth: 3, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Training Room', x: 14, z: 6, width: 8, depth: 6, type: 'training', shape: 'rectangle', radius: '', polygon_json: '' },
    ]
  }

  if (floor <= 14) {
    return [
      { room_name: 'Lift Lobby', x: 0, z: 0, width: 5, depth: 4, type: 'lobby', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment A Living', x: 5, z: 0, width: 7, depth: 5, type: 'living', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment A Bedroom', x: 12, z: 0, width: 5, depth: 5, type: 'bedroom', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment A Kitchen', x: 17, z: 0, width: 4, depth: 5, type: 'kitchen', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment B Living', x: 0, z: 5, width: 8, depth: 5, type: 'living', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment B Bedroom', x: 8, z: 5, width: 5, depth: 5, type: 'bedroom', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Apartment B Kitchen', x: 13, z: 5, width: 4, depth: 5, type: 'kitchen', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Shared Service', x: 17, z: 5, width: 4, depth: 5, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
    ]
  }

  if (floor <= 24) {
    return [
      { room_name: 'Sky Lobby', x: 0, z: 0, width: 6, depth: 5, type: 'lobby', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Executive Office', x: 6, z: 0, width: 8, depth: 5, type: 'office', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Board Room', x: 14, z: 0, width: 8, depth: 5, type: 'meeting', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Focus Room 1', x: 0, z: 5, width: 5, depth: 4, type: 'focus', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Focus Room 2', x: 5, z: 5, width: 5, depth: 4, type: 'focus', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Team Area', x: 10, z: 5, width: 8, depth: 4, type: 'office', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Restroom', x: 18, z: 5, width: 4, depth: 4, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
    ]
  }

  if (floor <= 33) {
    return [
      { room_name: 'Residential Lobby', x: 0, z: 0, width: 5, depth: 5, type: 'lobby', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Suite Living', x: 5, z: 0, width: 8, depth: 5, type: 'living', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Suite Bedroom', x: 13, z: 0, width: 6, depth: 5, type: 'bedroom', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Suite Kitchen', x: 19, z: 0, width: 4, depth: 5, type: 'kitchen', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Second Bedroom', x: 0, z: 5, width: 6, depth: 5, type: 'bedroom', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Study', x: 6, z: 5, width: 5, depth: 5, type: 'study', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Bath', x: 11, z: 5, width: 4, depth: 5, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
      { room_name: 'Terrace', x: 15, z: 5, width: 8, depth: 5, type: 'terrace', shape: 'rectangle', radius: '', polygon_json: '' },
    ]
  }

  return [
    { room_name: 'Roof Lobby', x: 0, z: 0, width: 6, depth: 5, type: 'lobby', shape: 'rectangle', radius: '', polygon_json: '' },
    { room_name: 'Mechanical Room', x: 6, z: 0, width: 8, depth: 5, type: 'mechanical', shape: 'rectangle', radius: '', polygon_json: '' },
    { room_name: 'Water Tank Zone', x: 14, z: 0, width: 8, depth: 5, type: 'utility', shape: 'rectangle', radius: '', polygon_json: '' },
    { room_name: 'Open Terrace', x: 0, z: 5, width: 14, depth: 7, type: 'terrace', shape: 'rectangle', radius: '', polygon_json: '' },
    { room_name: 'Service Access', x: 14, z: 5, width: 8, depth: 7, type: 'service', shape: 'rectangle', radius: '', polygon_json: '' },
  ]
}

export const createStoryBuildingTemplateWorkbook = (floorCount = 34) => {
  const wb = new ExcelJS.Workbook()
  addJsonWorksheet(wb, 'BuildingMeta', [{ building_name: `Network C - ${floorCount} Story Example`, total_floors: floorCount, unit: 'm', wall_thickness: 0.2, ceiling_height: 3.2 }])

  for (let floor = 1; floor <= floorCount; floor += 1) {
    addJsonWorksheet(
      wb,
      `Floor_${floor}`,
      getTemplateRooms(floor).map((room, index) => ({
        room_id: `F${floor}_R${index + 1}`,
        room_name: room.room_name,
        x: room.x,
        z: room.z,
        width: room.width,
        depth: room.depth,
        height: floor === 1 ? 3.6 : 3.2,
        type: room.type,
        shape: room.shape || 'rectangle',
        radius: room.radius ?? '',
        polygon_json: room.polygon_json ?? '',
      })),
    )
  }

  addJsonWorksheet(wb, 'Doors', [
    { floor_id: 'floor-1', door_id: 'D1', room_id: 'F1_R1', wall_side: 'north', offset: 2, width: 1.2, height: 2.2 },
    { floor_id: 'floor-10', door_id: 'D2', room_id: 'F10_R5', wall_side: 'west', offset: 1.5, width: 1, height: 2.1 },
  ])
  addJsonWorksheet(wb, 'Windows', [
    { floor_id: 'floor-1', window_id: 'W1', room_id: 'F1_R4', wall_side: 'east', offset: 2, width: 1.5, height: 1.2, sill_height: 1 },
    { floor_id: 'floor-20', window_id: 'W2', room_id: 'F20_R8', wall_side: 'south', offset: 1, width: 2, height: 1.2, sill_height: 1 },
  ])

  return wb
}
