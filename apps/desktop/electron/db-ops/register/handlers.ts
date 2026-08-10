import { getDb } from '../../db'
import { registerVectorsHandlers } from '../../handlers/vectors'
import { registerDataHandlers } from '../../handlers/data'
import { registerGenresHandlers } from './genres'
import { registerProjectsHandlers } from './projects'
import { registerSeriesHandlers } from './series'
import { registerCharactersHandlers } from './characters'
import { registerCharacterRelationsHandlers } from './character-relations'
import { registerPropsHandlers } from './props'
import { registerCostumesHandlers } from './costumes'
import { registerScenesHandlers } from './scenes'
import { registerShotsHandlers } from './shots'

export function registerDatabaseHandlers() {
  getDb()
  registerGenresHandlers()
  registerProjectsHandlers()
  registerSeriesHandlers()
  registerCharactersHandlers()
  registerCharacterRelationsHandlers()
  registerPropsHandlers()
  registerCostumesHandlers()
  registerScenesHandlers()
  registerShotsHandlers()
  registerVectorsHandlers()
  registerDataHandlers()
}
