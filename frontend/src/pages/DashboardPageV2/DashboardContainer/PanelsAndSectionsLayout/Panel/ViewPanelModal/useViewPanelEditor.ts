import { useCallback, useMemo } from 'react';
import type {
	DashboardtypesPanelDTO,
	DashboardtypesPanelSpecDTO,
	TelemetrytypesSignalDTO,
} from 'api/generated/services/sigNoz.schemas';
import { QueryParams } from 'constants/query';
import { PANEL_TYPES } from 'constants/queryBuilder';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import useUrlQuery from 'hooks/useUrlQuery';
import { usePanelEditSession } from 'pages/DashboardPageV2/DashboardContainer/PanelEditor/hooks/usePanelEditSession';
import type { RenderablePanelDefinition } from 'pages/DashboardPageV2/DashboardContainer/Panels/types/panelDefinition';
import {
	PANEL_KIND_TO_PANEL_TYPE,
	type PanelKind,
} from 'pages/DashboardPageV2/DashboardContainer/Panels/types/panelKind';
import { resolveSignal } from 'pages/DashboardPageV2/DashboardContainer/Panels/utils/getBuilderQueries';
import { buildViewPanelSpec } from 'pages/DashboardPageV2/DashboardContainer/Panels/utils/drilldown/buildViewPanelSpec';
import { fromPerses } from 'pages/DashboardPageV2/DashboardContainer/queryV5/persesQueryAdapters';
import {
	type PanelQueryTimeOverride,
	type UsePanelQueryResult,
} from 'pages/DashboardPageV2/DashboardContainer/hooks/usePanelQuery';
import type { EQueryType } from 'types/common/dashboard';

interface UseViewPanelEditorArgs {
	panel: DashboardtypesPanelDTO;
	panelId: string;
	/** Per-view time window (epoch ms); isolates the preview from the dashboard. */
	time: PanelQueryTimeOverride;
}

export interface UseViewPanelEditorApi {
	/** Local editable copy of the panel — the preview renders this, not the saved panel. */
	draft: DashboardtypesPanelDTO;
	/** Resolved renderer for the draft's current kind. */
	panelDefinition: RenderablePanelDefinition | undefined;
	/** Current builder datasource — drives the panel-type selector's disabled rule. */
	signal?: TelemetrytypesSignalDTO;
	/** The kind's first supported signal — the query builder's fallback datasource. */
	defaultSignal: TelemetrytypesSignalDTO;
	/** Active query type (selected builder tab) — drives the panel-type selector's disabled rule. */
	queryType: EQueryType;
	/** Query result for the draft over the per-view window. */
	query: UsePanelQueryResult;
	/** Stage & run the live builder query into the draft (drilldown; not persisted). */
	runQuery: () => void;
	/** Switch the draft's visualization kind (temporary; reversible per session). */
	onChangePanelKind: (kind: PanelKind) => void;
	/** Restore the query the view opened with, discarding in-modal edits. */
	resetQuery: () => void;
	/** Bake the live (possibly un-run) query into a spec — used to hand edits to the full editor. */
	buildSaveSpec: (
		spec: DashboardtypesPanelSpecDTO,
	) => DashboardtypesPanelSpecDTO;
}

/**
 * The View modal's compact drilldown editor on the shared `usePanelEditSession`. Edits are
 * temporary — they live in the builder/URL + draft, never the dashboard (V1 parity).
 */
export function useViewPanelEditor({
	panel,
	panelId,
	time,
}: UseViewPanelEditorArgs): UseViewPanelEditorApi {
	const { currentQuery, redirectWithQueryBuilderData } = useQueryBuilder();

	// Seed the draft from the URL (`compositeQuery` + `graphType`) when present, else the saved
	// panel — mount-only, so a refresh re-seeds from the URL and in-modal edits survive (V1 parity).
	const urlQuery = useGetCompositeQueryParam();
	const urlGraphType = useUrlQuery().get(
		QueryParams.graphType,
	) as PANEL_TYPES | null;
	const initialPanel = useMemo<DashboardtypesPanelDTO>(
		() =>
			urlQuery
				? {
						...panel,
						spec: buildViewPanelSpec({
							spec: panel.spec,
							query: urlQuery,
							panelType:
								urlGraphType ?? PANEL_KIND_TO_PANEL_TYPE[panel.spec.plugin.kind],
						}),
					}
				: panel,
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only seed from the URL
		[],
	);

	const {
		draft,
		panelDefinition,
		defaultSignal,
		query,
		runQuery,
		onChangePanelKind,
		buildSaveSpec,
		reset,
	} = usePanelEditSession({ panel: initialPanel, panelId, time });

	// The query the view opened with, captured once — the Reset target.
	const savedQuery = useMemo(
		() =>
			fromPerses(
				panel.spec.queries,
				PANEL_KIND_TO_PANEL_TYPE[panel.spec.plugin.kind],
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only snapshot
		[],
	);

	const resetQuery = useCallback((): void => {
		reset();
		redirectWithQueryBuilderData(savedQuery);
	}, [reset, redirectWithQueryBuilderData, savedQuery]);

	// Current builder datasource for the panel-type disabled rule — resolved the same
	// way as the full editor's ConfigPane so the two selectors stay in sync.
	const signal = resolveSignal(draft.spec.queries, defaultSignal);

	return {
		draft,
		panelDefinition,
		signal,
		defaultSignal,
		queryType: currentQuery.queryType,
		query,
		runQuery,
		onChangePanelKind,
		resetQuery,
		buildSaveSpec,
	};
}
