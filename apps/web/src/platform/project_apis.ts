import {
  STORE_NAMES,
  type SeriesSceneLinkRow,
  type SeriesCharacterLinkRow,
  type SeriesPropLinkRow,
  type SeriesCostumeLinkRow,
  getAllRows,
  getRowById,
  putRow,
  deleteRowById,
  removeRowsWhere,
  sortByCreatedDesc,
  sortByCreatedAsc,
  sortSeriesByProjectOrder,
  normalizeIds,
  removeIds,
  normalizeCharacterRow,
  normalizeCostumeRow,
  normalizeShotRow,
  buildSceneLinkId,
  buildCharacterLinkId,
  buildPropLinkId,
  buildCostumeLinkId,
} from './runtime_db'

async function removeCharacterReferencesFromCostumes(
  projectId: string,
  removedCharacterIds: Set<string>,
): Promise<void> {
  if (removedCharacterIds.size === 0) return
  const costumes = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
  const targets = costumes.filter((row) => row.project_id === projectId)
  await Promise.all(targets.map(async (row) => {
    const currentCharacterIds = normalizeIds(row.character_ids)
    const nextCharacterIds = currentCharacterIds.filter((id) => !removedCharacterIds.has(id))
    if (nextCharacterIds.length === currentCharacterIds.length) return
    await putRow(STORE_NAMES.costumes, {
      ...row,
      character_ids: nextCharacterIds,
    } satisfies CostumeRow)
  }))
}

type ShotReferenceField = 'character_ids' | 'prop_ids' | 'costume_ids'

async function pruneShotReferences(
  field: ShotReferenceField,
  removedIds: ReadonlySet<string>,
  projectId?: string,
): Promise<void> {
  if (removedIds.size === 0) return

  const [shots, seriesRows] = await Promise.all([
    getAllRows<ShotRow>(STORE_NAMES.shots),
    projectId ? getAllRows<SeriesRow>(STORE_NAMES.series) : Promise.resolve([]),
  ])
  const projectSeriesIds = projectId
    ? new Set(seriesRows.filter((row) => row.project_id === projectId).map((row) => row.id))
    : null
  const targets = projectSeriesIds
    ? shots.filter((shot) => projectSeriesIds.has(shot.series_id))
    : shots

  await Promise.all(targets.map(async (shot) => {
    const currentIds = normalizeIds(shot[field])
    const nextIds = removeIds(currentIds, removedIds)
    if (nextIds.length === currentIds.length) return
    await putRow(STORE_NAMES.shots, {
      ...shot,
      [field]: nextIds,
    } satisfies ShotRow)
  }))
}

async function syncProjectSeriesCount(projectId: string): Promise<void> {
  const [project, allSeries] = await Promise.all([
    getRowById<ProjectRow>(STORE_NAMES.projects, projectId),
    getAllRows<SeriesRow>(STORE_NAMES.series),
  ])
  if (!project) return
  const seriesCount = allSeries.filter((series) => series.project_id === projectId).length
  await putRow(STORE_NAMES.projects, {
    ...project,
    series_count: seriesCount,
  })
}

export function registerProjectApis(runtimeWindow: Window): void {
  runtimeWindow.genresAPI = {
    getAll: async () => {
      const rows = await getAllRows<GenreRow>(STORE_NAMES.genres)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (genre: GenreRow) => {
      await putRow(STORE_NAMES.genres, genre)
    },
    update: async (genre: GenreRow) => {
      await putRow(STORE_NAMES.genres, genre)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.genres, id)
    },
  }

  runtimeWindow.categoriesAPI = {
    getAll: async () => {
      const rows = await getAllRows<CategoryRow>(STORE_NAMES.categories)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (category: CategoryRow) => {
      await putRow(STORE_NAMES.categories, category)
    },
    update: async (category: CategoryRow) => {
      await putRow(STORE_NAMES.categories, category)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.categories, id)
    },
  }

  runtimeWindow.projectsAPI = {
    getAll: async () => {
      const rows = await getAllRows<ProjectRow>(STORE_NAMES.projects)
      return rows.sort(sortByCreatedDesc)
    },
    insert: async (project: ProjectRow) => {
      await putRow(STORE_NAMES.projects, project)
    },
    update: async (project: ProjectRow) => {
      await putRow(STORE_NAMES.projects, project)
    },
    delete: async (id: string) => {
      const [seriesRows, sceneRows] = await Promise.all([
        getAllRows<SeriesRow>(STORE_NAMES.series),
        getAllRows<SceneRow>(STORE_NAMES.scenes),
      ])
      const seriesIds = new Set(
        seriesRows.filter((row) => row.project_id === id).map((row) => row.id),
      )
      const sceneIds = new Set(
        sceneRows.filter((row) => row.project_id === id).map((row) => row.id),
      )

      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<CharacterRow>(STORE_NAMES.characters, (row) => row.project_id === id),
        removeRowsWhere<CharacterRelationRow>(
          STORE_NAMES.characterRelations,
          (row) => row.project_id === id,
        ),
        removeRowsWhere<PropRow>(STORE_NAMES.props, (row) => row.project_id === id),
        removeRowsWhere<CostumeRow>(STORE_NAMES.costumes, (row) => row.project_id === id),
        removeRowsWhere<ShotRow>(
          STORE_NAMES.shots,
          (row) => sceneIds.has(row.scene_id) || seriesIds.has(row.series_id),
        ),
        removeRowsWhere<SceneRow>(STORE_NAMES.scenes, (row) => row.project_id === id),
        removeRowsWhere<SeriesRow>(STORE_NAMES.series, (row) => row.project_id === id),
      ])
      await deleteRowById(STORE_NAMES.projects, id)
    },
  }

  runtimeWindow.seriesAPI = {
    getAll: async () => {
      const rows = await getAllRows<SeriesRow>(STORE_NAMES.series)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<SeriesRow>(STORE_NAMES.series)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortSeriesByProjectOrder)
    },
    insert: async (series: SeriesRow) => {
      await putRow(STORE_NAMES.series, series)
      await syncProjectSeriesCount(series.project_id)
    },
    update: async (series: SeriesRow) => {
      await putRow(STORE_NAMES.series, series)
    },
    delete: async (id: string) => {
      const row = await getRowById<SeriesRow>(STORE_NAMES.series, id)
      await Promise.all([
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (shot) => shot.series_id === id),
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (link) => link.series_id === id,
        ),
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (link) => link.series_id === id,
        ),
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (link) => link.series_id === id,
        ),
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (link) => link.series_id === id,
        ),
      ])
      await deleteRowById(STORE_NAMES.series, id)
      if (row) {
        await syncProjectSeriesCount(row.project_id)
      }
    },
  }

  runtimeWindow.charactersAPI = {
    getAll: async () => {
      const rows = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      return rows.map(normalizeCharacterRow).sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      return rows
        .filter((row) => row.project_id === projectId)
        .map(normalizeCharacterRow)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<CharacterRow>(STORE_NAMES.characters),
        getAllRows<SeriesCharacterLinkRow>(STORE_NAMES.seriesCharacterLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.character_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .map(normalizeCharacterRow)
        .sort(sortByCreatedAsc)
    },
    insert: async (character: CharacterRow) => {
      await putRow(STORE_NAMES.characters, normalizeCharacterRow(character))
    },
    update: async (character: CharacterRow) => {
      await putRow(STORE_NAMES.characters, normalizeCharacterRow(character))
    },
    delete: async (id: string) => {
      const row = await getRowById<CharacterRow>(STORE_NAMES.characters, id)
      await Promise.all([
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.character_id === id,
        ),
        removeRowsWhere<CharacterRelationRow>(
          STORE_NAMES.characterRelations,
          (row) => row.source_character_id === id || row.target_character_id === id,
        ),
        deleteRowById(STORE_NAMES.characters, id),
        pruneShotReferences('character_ids', new Set([id]), row?.project_id),
      ])
      if (row?.project_id) {
        await removeCharacterReferencesFromCostumes(row.project_id, new Set([id]))
      }
    },
    replaceByProject: async (payload: { projectId: string; characters: CharacterRow[] }) => {
      const existingCharacters = await getAllRows<CharacterRow>(STORE_NAMES.characters)
      const removedIds = new Set(
        existingCharacters
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id)
          .filter((id) => !payload.characters.some((character) => character.id === id)),
      )
      await Promise.all([
        removeRowsWhere<SeriesCharacterLinkRow>(
          STORE_NAMES.seriesCharacterLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<CharacterRow>(
          STORE_NAMES.characters,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.characters, normalizeCharacterRow({
          ...character,
          project_id: payload.projectId,
        })),
      ))
      await Promise.all([
        removeCharacterReferencesFromCostumes(payload.projectId, removedIds),
        pruneShotReferences('character_ids', removedIds, payload.projectId),
        removeRowsWhere<CharacterRelationRow>(
          STORE_NAMES.characterRelations,
          (row) => removedIds.has(row.source_character_id) || removedIds.has(row.target_character_id),
        ),
      ])
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      characters: CharacterRow[]
    }) => {
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.characters, normalizeCharacterRow({
          ...character,
          project_id: payload.projectId,
        })),
      ))

      await removeRowsWhere<SeriesCharacterLinkRow>(
        STORE_NAMES.seriesCharacterLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.characters.map((character) =>
        putRow(STORE_NAMES.seriesCharacterLinks, {
          id: buildCharacterLinkId(payload.seriesId, character.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          character_id: character.id,
          created_at: now,
        } satisfies SeriesCharacterLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      character_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesCharacterLinks, {
        id: buildCharacterLinkId(payload.series_id, payload.character_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        character_id: payload.character_id,
        created_at: payload.created_at,
      } satisfies SeriesCharacterLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; characterId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesCharacterLinks,
        buildCharacterLinkId(payload.seriesId, payload.characterId),
      )
    },
  }

  runtimeWindow.characterRelationsAPI = {
    getAll: async () => {
      const rows = await getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    insert: async (row: CharacterRelationRow) => {
      await putRow(STORE_NAMES.characterRelations, row)
    },
    update: async (row: CharacterRelationRow) => {
      await putRow(STORE_NAMES.characterRelations, row)
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.characterRelations, id)
    },
    replaceByProject: async (payload: {
      projectId: string
      relations: CharacterRelationRow[]
    }) => {
      await removeRowsWhere<CharacterRelationRow>(
        STORE_NAMES.characterRelations,
        (row) => row.project_id === payload.projectId,
      )
      await Promise.all(payload.relations.map((row) =>
        putRow(STORE_NAMES.characterRelations, {
          ...row,
          project_id: payload.projectId,
        }),
      ))
    },
  }

  runtimeWindow.propsAPI = {
    getAll: async () => {
      const rows = await getAllRows<PropRow>(STORE_NAMES.props)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<PropRow>(STORE_NAMES.props)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<PropRow>(STORE_NAMES.props),
        getAllRows<SeriesPropLinkRow>(STORE_NAMES.seriesPropLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.prop_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .sort(sortByCreatedAsc)
    },
    insert: async (prop: PropRow) => {
      await putRow(STORE_NAMES.props, prop)
    },
    update: async (prop: PropRow) => {
      await putRow(STORE_NAMES.props, prop)
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.prop_id === id,
        ),
        deleteRowById(STORE_NAMES.props, id),
        pruneShotReferences('prop_ids', new Set([id])),
      ])
    },
    replaceByProject: async (payload: { projectId: string; props: PropRow[] }) => {
      const existingProps = await getAllRows<PropRow>(STORE_NAMES.props)
      const nextIds = new Set(payload.props.map((prop) => prop.id))
      const removedIds = new Set(
        existingProps
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id)
          .filter((id) => !nextIds.has(id)),
      )
      await Promise.all([
        removeRowsWhere<SeriesPropLinkRow>(
          STORE_NAMES.seriesPropLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<PropRow>(
          STORE_NAMES.props,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.props, {
          ...prop,
          project_id: payload.projectId,
        }),
      ))
      await pruneShotReferences('prop_ids', removedIds, payload.projectId)
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      props: PropRow[]
    }) => {
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.props, {
          ...prop,
          project_id: payload.projectId,
        }),
      ))

      await removeRowsWhere<SeriesPropLinkRow>(
        STORE_NAMES.seriesPropLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.props.map((prop) =>
        putRow(STORE_NAMES.seriesPropLinks, {
          id: buildPropLinkId(payload.seriesId, prop.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          prop_id: prop.id,
          created_at: now,
        } satisfies SeriesPropLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      prop_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesPropLinks, {
        id: buildPropLinkId(payload.series_id, payload.prop_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        prop_id: payload.prop_id,
        created_at: payload.created_at,
      } satisfies SeriesPropLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; propId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesPropLinks,
        buildPropLinkId(payload.seriesId, payload.propId),
      )
    },
  }

  runtimeWindow.costumesAPI = {
    getAll: async () => {
      const rows = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
      return rows
        .map(normalizeCostumeRow)
        .sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
      return rows
        .filter((row) => row.project_id === projectId)
        .map(normalizeCostumeRow)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<CostumeRow>(STORE_NAMES.costumes),
        getAllRows<SeriesCostumeLinkRow>(STORE_NAMES.seriesCostumeLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.costume_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .map(normalizeCostumeRow)
        .sort(sortByCreatedAsc)
    },
    insert: async (costume: CostumeRow) => {
      await putRow(STORE_NAMES.costumes, normalizeCostumeRow(costume))
    },
    update: async (costume: CostumeRow) => {
      await putRow(STORE_NAMES.costumes, normalizeCostumeRow(costume))
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.costume_id === id,
        ),
        deleteRowById(STORE_NAMES.costumes, id),
        pruneShotReferences('costume_ids', new Set([id])),
      ])
    },
    replaceByProject: async (payload: { projectId: string; costumes: CostumeRow[] }) => {
      const existingCostumes = await getAllRows<CostumeRow>(STORE_NAMES.costumes)
      const nextIds = new Set(payload.costumes.map((costume) => costume.id))
      const removedIds = new Set(
        existingCostumes
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id)
          .filter((id) => !nextIds.has(id)),
      )
      await Promise.all([
        removeRowsWhere<SeriesCostumeLinkRow>(
          STORE_NAMES.seriesCostumeLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<CostumeRow>(
          STORE_NAMES.costumes,
          (row) => row.project_id === payload.projectId,
        ),
      ])
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.costumes, normalizeCostumeRow({
          ...costume,
          project_id: payload.projectId,
        })),
      ))
      await pruneShotReferences('costume_ids', removedIds, payload.projectId)
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      costumes: CostumeRow[]
    }) => {
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.costumes, normalizeCostumeRow({
          ...costume,
          project_id: payload.projectId,
        })),
      ))

      await removeRowsWhere<SeriesCostumeLinkRow>(
        STORE_NAMES.seriesCostumeLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.costumes.map((costume) =>
        putRow(STORE_NAMES.seriesCostumeLinks, {
          id: buildCostumeLinkId(payload.seriesId, costume.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          costume_id: costume.id,
          created_at: now,
        } satisfies SeriesCostumeLinkRow),
      ))
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      costume_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesCostumeLinks, {
        id: buildCostumeLinkId(payload.series_id, payload.costume_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        costume_id: payload.costume_id,
        created_at: payload.created_at,
      } satisfies SeriesCostumeLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; costumeId: string }) => {
      await deleteRowById(
        STORE_NAMES.seriesCostumeLinks,
        buildCostumeLinkId(payload.seriesId, payload.costumeId),
      )
    },
  }

  runtimeWindow.scenesAPI = {
    getAll: async () => {
      const rows = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      return rows.sort(sortByCreatedDesc)
    },
    getByProject: async (projectId: string) => {
      const rows = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      return rows
        .filter((row) => row.project_id === projectId)
        .sort(sortByCreatedAsc)
    },
    getBySeries: async (seriesId: string) => {
      const [rows, links] = await Promise.all([
        getAllRows<SceneRow>(STORE_NAMES.scenes),
        getAllRows<SeriesSceneLinkRow>(STORE_NAMES.seriesSceneLinks),
      ])
      const linkedIds = new Set(
        links
          .filter((link) => link.series_id === seriesId)
          .map((link) => link.scene_id),
      )
      return rows
        .filter((row) => linkedIds.has(row.id))
        .sort(sortByCreatedAsc)
    },
    insert: async (scene: SceneRow) => {
      await putRow(STORE_NAMES.scenes, scene)
    },
    update: async (scene: SceneRow) => {
      await putRow(STORE_NAMES.scenes, scene)
    },
    delete: async (id: string) => {
      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.scene_id === id,
        ),
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (row) => row.scene_id === id),
        deleteRowById(STORE_NAMES.scenes, id),
      ])
    },
    replaceByProject: async (payload: { projectId: string; scenes: SceneRow[] }) => {
      const scenesToDelete = await getAllRows<SceneRow>(STORE_NAMES.scenes)
      const sceneIds = new Set(
        scenesToDelete
          .filter((row) => row.project_id === payload.projectId)
          .map((row) => row.id),
      )

      await Promise.all([
        removeRowsWhere<SeriesSceneLinkRow>(
          STORE_NAMES.seriesSceneLinks,
          (row) => row.project_id === payload.projectId,
        ),
        removeRowsWhere<ShotRow>(STORE_NAMES.shots, (row) => sceneIds.has(row.scene_id)),
        removeRowsWhere<SceneRow>(STORE_NAMES.scenes, (row) => row.project_id === payload.projectId),
      ])

      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.scenes, {
          ...scene,
          project_id: payload.projectId,
        }),
      ))
    },
    replaceBySeries: async (payload: {
      projectId: string
      seriesId: string
      scenes: SceneRow[]
    }) => {
      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.scenes, {
          ...scene,
          project_id: payload.projectId,
        }),
      ))

      await removeRowsWhere<SeriesSceneLinkRow>(
        STORE_NAMES.seriesSceneLinks,
        (row) => row.project_id === payload.projectId && row.series_id === payload.seriesId,
      )
      const now = Date.now()
      await Promise.all(payload.scenes.map((scene) =>
        putRow(STORE_NAMES.seriesSceneLinks, {
          id: buildSceneLinkId(payload.seriesId, scene.id),
          project_id: payload.projectId,
          series_id: payload.seriesId,
          scene_id: scene.id,
          created_at: now,
        } satisfies SeriesSceneLinkRow),
      ))

      const allowedSceneIds = new Set(payload.scenes.map((scene) => scene.id))
      await removeRowsWhere<ShotRow>(
        STORE_NAMES.shots,
        (shot) => shot.series_id === payload.seriesId && !allowedSceneIds.has(shot.scene_id),
      )
    },
    linkToSeries: async (payload: {
      project_id: string
      series_id: string
      scene_id: string
      created_at: number
    }) => {
      await putRow(STORE_NAMES.seriesSceneLinks, {
        id: buildSceneLinkId(payload.series_id, payload.scene_id),
        project_id: payload.project_id,
        series_id: payload.series_id,
        scene_id: payload.scene_id,
        created_at: payload.created_at,
      } satisfies SeriesSceneLinkRow)
    },
    unlinkFromSeries: async (payload: { seriesId: string; sceneId: string }) => {
      await Promise.all([
        deleteRowById(
          STORE_NAMES.seriesSceneLinks,
          buildSceneLinkId(payload.seriesId, payload.sceneId),
        ),
        removeRowsWhere<ShotRow>(
          STORE_NAMES.shots,
          (row) => row.series_id === payload.seriesId && row.scene_id === payload.sceneId,
        ),
      ])
    },
  }

  runtimeWindow.shotsAPI = {
    getAll: async () => {
      const rows = await getAllRows<ShotRow>(STORE_NAMES.shots)
      return rows
        .map(normalizeShotRow)
        .sort(sortByCreatedDesc)
    },
    getBySeries: async (seriesId: string) => {
      const rows = await getAllRows<ShotRow>(STORE_NAMES.shots)
      return rows
        .filter((row) => row.series_id === seriesId)
        .map(normalizeShotRow)
        .sort((left, right) => left.shot_index - right.shot_index || left.created_at - right.created_at)
    },
    insert: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, normalizeShotRow(shot))
    },
    update: async (shot: ShotRow) => {
      await putRow(STORE_NAMES.shots, normalizeShotRow(shot))
    },
    delete: async (id: string) => {
      await deleteRowById(STORE_NAMES.shots, id)
    },
    replaceBySeries: async (payload: { seriesId: string; shots: ShotRow[] }) => {
      await removeRowsWhere<ShotRow>(
        STORE_NAMES.shots,
        (row) => row.series_id === payload.seriesId,
      )
      await Promise.all(payload.shots.map((shot) =>
        putRow(STORE_NAMES.shots, {
          ...normalizeShotRow(shot),
          series_id: payload.seriesId,
        }),
      ))

      const series = await getRowById<SeriesRow>(STORE_NAMES.series, payload.seriesId)
      if (!series) return

      const now = Date.now()
      for (const rawShot of payload.shots) {
        const shot = normalizeShotRow(rawShot)
        await putRow(STORE_NAMES.seriesSceneLinks, {
          id: buildSceneLinkId(payload.seriesId, shot.scene_id),
          project_id: series.project_id,
          series_id: payload.seriesId,
          scene_id: shot.scene_id,
          created_at: now,
        } satisfies SeriesSceneLinkRow)

        for (const characterId of shot.character_ids) {
          await putRow(STORE_NAMES.seriesCharacterLinks, {
            id: buildCharacterLinkId(payload.seriesId, characterId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            character_id: characterId,
            created_at: now,
          } satisfies SeriesCharacterLinkRow)
        }

        for (const propId of shot.prop_ids) {
          await putRow(STORE_NAMES.seriesPropLinks, {
            id: buildPropLinkId(payload.seriesId, propId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            prop_id: propId,
            created_at: now,
          } satisfies SeriesPropLinkRow)
        }

        for (const costumeId of shot.costume_ids) {
          await putRow(STORE_NAMES.seriesCostumeLinks, {
            id: buildCostumeLinkId(payload.seriesId, costumeId),
            project_id: series.project_id,
            series_id: payload.seriesId,
            costume_id: costumeId,
            created_at: now,
          } satisfies SeriesCostumeLinkRow)
        }
      }
    },
  }

}
