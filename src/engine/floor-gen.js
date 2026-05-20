// Shim layer: existing code imports `genMaze` from here. We now route
// through the floor-type dispatcher, which picks the right generator per floor.

export {
  generateFloor,
  generateFloorOfType,
  pickFloorType,
  updateHazards,
  updateFog,
  themeForFloor,
  THEMES
} from './floor-types.js';

import { generateFloor } from './floor-types.js';

export function genMaze(floor) {
  return generateFloor(floor);
}