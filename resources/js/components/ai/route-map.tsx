import 'mapbox-gl/dist/mapbox-gl.css';
import { usePage } from '@inertiajs/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useMemo, useRef } from 'react';

type Point = string | [number, number];
type Route = {
    from: Point;
    to: Point;
    kind?: 'win' | 'lose';
    label?: string;
    rpm?: number;
};
type Lane = { from: [number, number]; to: [number, number]; kind: string };

/** [lng, lat] centroids for US states + DC (route endpoints are state codes). */
const STATE_CENTROIDS: Record<string, [number, number]> = {
    AL: [-86.8, 32.8], AK: [-152.5, 64.2], AZ: [-111.7, 34.3], AR: [-92.4, 34.9],
    CA: [-119.4, 36.8], CO: [-105.3, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0],
    DC: [-77.0, 38.9], FL: [-81.7, 27.8], GA: [-83.5, 32.7], HI: [-157.5, 21.1],
    ID: [-114.5, 44.2], IL: [-89.0, 40.0], IN: [-86.3, 39.8], IA: [-93.5, 42.0],
    KS: [-98.4, 38.5], KY: [-84.9, 37.7], LA: [-92.0, 31.2], ME: [-69.2, 45.4],
    MD: [-76.8, 39.0], MA: [-71.5, 42.2], MI: [-84.5, 43.3], MN: [-94.3, 46.3],
    MS: [-89.7, 32.7], MO: [-92.5, 38.5], MT: [-110.5, 46.9], NE: [-99.8, 41.5],
    NV: [-117.0, 39.3], NH: [-71.6, 43.4], NJ: [-74.5, 40.3], NM: [-106.1, 34.4],
    NY: [-75.5, 42.9], NC: [-79.4, 35.6], ND: [-100.5, 47.5], OH: [-82.8, 40.3],
    OK: [-97.5, 35.6], OR: [-120.6, 44.0], PA: [-77.8, 40.9], RI: [-71.5, 41.7],
    SC: [-80.9, 33.9], SD: [-100.2, 44.4], TN: [-86.4, 35.9], TX: [-99.3, 31.5],
    UT: [-111.9, 39.3], VT: [-72.7, 44.1], VA: [-78.2, 37.8], WA: [-120.7, 47.4],
    WV: [-80.6, 38.6], WI: [-89.6, 44.3], WY: [-107.6, 43.0],
};

const KIND_COLORS: Record<string, string> = {
    win: '#16a34a',
    lose: '#dc2626',
    neutral: '#2563eb',
};

function resolvePoint(point: Point): [number, number] | null {
    if (
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === 'number' &&
        typeof point[1] === 'number'
    ) {
        return [point[0], point[1]];
    }

    if (typeof point === 'string') {
        return STATE_CENTROIDS[point.trim().toUpperCase()] ?? null;
    }

    return null;
}

function pointLabel(point: Point): string {
    return typeof point === 'string' ? point.toUpperCase() : point.join(', ');
}

/** Draws freight lanes on a Mapbox map (or lists them if no token is set). */
export function RouteMap({
    routes = [],
    height = 320,
}: {
    routes?: Route[];
    height?: number;
}) {
    const token = usePage<{ ai?: { mapboxToken?: string | null } }>().props.ai
        ?.mapboxToken;
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapboxMap | null>(null);

    const lanes = useMemo<Lane[]>(() => {
        const list = Array.isArray(routes) ? routes : [];

        return list
            .map((route) => ({
                from: resolvePoint(route.from),
                to: resolvePoint(route.to),
                kind: route.kind ?? 'neutral',
            }))
            .filter(
                (lane): lane is Lane =>
                    lane.from !== null && lane.to !== null,
            );
    }, [routes]);

    const lanesKey = JSON.stringify(lanes);

    useEffect(() => {
        if (!token || !containerRef.current || lanes.length === 0) {
            return;
        }

        let cancelled = false;
        let map: MapboxMap | null = null;

        void import('mapbox-gl').then(({ default: mapboxgl }) => {
            if (cancelled || !containerRef.current) {
                return;
            }

            mapboxgl.accessToken = token;
            map = new mapboxgl.Map({
                container: containerRef.current,
                style: 'mapbox://styles/mapbox/light-v11',
                center: [-96, 38],
                zoom: 3,
                attributionControl: false,
            });
            mapRef.current = map;

            map.on('load', () => {
                if (!map) {
                    return;
                }

                for (const [kind, color] of Object.entries(KIND_COLORS)) {
                    const features = lanes
                        .filter((lane) => lane.kind === kind)
                        .map((lane) => ({
                            type: 'Feature' as const,
                            properties: {},
                            geometry: {
                                type: 'LineString' as const,
                                coordinates: [lane.from, lane.to],
                            },
                        }));

                    if (features.length === 0) {
                        continue;
                    }

                    map.addSource(`lanes-${kind}`, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features },
                    });
                    map.addLayer({
                        id: `lanes-${kind}`,
                        type: 'line',
                        source: `lanes-${kind}`,
                        layout: { 'line-cap': 'round', 'line-join': 'round' },
                        paint: {
                            'line-color': color,
                            'line-width': 2.5,
                            'line-opacity': 0.85,
                        },
                    });
                }

                const endpoints = new Map<string, [number, number]>();

                for (const lane of lanes) {
                    endpoints.set(lane.from.join(','), lane.from);
                    endpoints.set(lane.to.join(','), lane.to);
                }

                const bounds = new mapboxgl.LngLatBounds();

                for (const coord of endpoints.values()) {
                    bounds.extend(coord);
                    new mapboxgl.Marker({ color: '#111827', scale: 0.7 })
                        .setLngLat(coord)
                        .addTo(map);
                }

                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, {
                        padding: 48,
                        maxZoom: 6,
                        duration: 0,
                    });
                }
            });
        });

        return () => {
            cancelled = true;
            map?.remove();
            mapRef.current = null;
        };
        // lanesKey is a stable digest of `lanes`; re-init only when it changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, lanesKey]);

    if (!token) {
        return (
            <div className="rounded-md border p-3 text-sm">
                <p className="mb-1.5 font-medium">Routes</p>
                <ul className="space-y-0.5">
                    {(Array.isArray(routes) ? routes : []).map((route, index) => (
                        <li key={index}>
                            {pointLabel(route.from)} → {pointLabel(route.to)}
                            {typeof route.rpm === 'number'
                                ? ` · $${route.rpm}/mi`
                                : ''}
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                    Set MAPBOX_TOKEN to see these drawn on a map.
                </p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{ height }}
            className="w-full overflow-hidden rounded-md border"
        />
    );
}
