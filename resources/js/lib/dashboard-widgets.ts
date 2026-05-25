/** Dashboard widgets a share can be scoped to. Keys must match the backend
 *  (App\Models\DashboardShare::WIDGETS). Null/all selected = whole dashboard. */
export const DASHBOARD_WIDGETS = [
    { key: 'key_metrics', label: 'Key Metrics' },
    { key: 'dispatcher_chart', label: 'Dispatcher Performance' },
    { key: 'dispatcher_rankings', label: 'Dispatcher Rankings' },
    { key: 'pnl_table', label: 'P&L Report' },
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]['key'];

/** Human-readable summary of a share's widget scope. */
export function widgetScopeLabel(widgets: string[] | null): string {
    if (!widgets || widgets.length === 0) {
        return 'Whole dashboard';
    }

    const labels = DASHBOARD_WIDGETS.filter((w) => widgets.includes(w.key)).map(
        (w) => w.label,
    );

    return labels.length > 0 ? labels.join(', ') : 'Whole dashboard';
}
