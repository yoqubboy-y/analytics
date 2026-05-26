<?php

namespace App\Ai;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Read-through cache over OpenRouter's public model catalogue.
 *
 * Only models that support tool calling are surfaced, because the analytics
 * assistant relies on tools to answer with real numbers.
 */
class OpenRouterModels
{
    private const CACHE_KEY = 'ai.openrouter.tool_models';

    private const CACHE_TTL = 3600; // 1 hour

    private const ENDPOINT = 'https://openrouter.ai/api/v1/models';

    /**
     * Get the tool-capable models, normalised for the model picker.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function all(): Collection
    {
        $cached = Cache::get(self::CACHE_KEY);

        if ($cached instanceof Collection) {
            return $cached;
        }

        $models = $this->fetch();

        if ($models->isNotEmpty()) {
            Cache::put(self::CACHE_KEY, $models, self::CACHE_TTL);
        }

        return $models;
    }

    /**
     * Get the set of selectable model ids.
     *
     * @return Collection<int, string>
     */
    public function ids(): Collection
    {
        return $this->all()->pluck('id');
    }

    /**
     * Fetch and normalise the catalogue from OpenRouter.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function fetch(): Collection
    {
        try {
            $response = Http::timeout(15)->acceptJson()->get(self::ENDPOINT);
        } catch (Throwable) {
            return collect();
        }

        if (! $response->successful()) {
            return collect();
        }

        return collect($response->json('data', []))
            ->filter(fn ($model): bool => is_array($model)
                && in_array('tools', $model['supported_parameters'] ?? [], true))
            ->map(fn (array $model): array => [
                'id' => (string) $model['id'],
                'name' => (string) ($model['name'] ?? $model['id']),
                'description' => $this->shorten($model['description'] ?? null),
                'context_length' => (int) ($model['context_length'] ?? 0),
                'vision' => in_array('image', $model['architecture']['input_modalities'] ?? [], true),
                'pricing' => [
                    // OpenRouter prices are dollars-per-token; show $/million.
                    'prompt' => $this->perMillion($model['pricing']['prompt'] ?? null),
                    'completion' => $this->perMillion($model['pricing']['completion'] ?? null),
                ],
            ])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    private function perMillion(mixed $price): ?float
    {
        if ($price === null || ! is_numeric($price)) {
            return null;
        }

        return round((float) $price * 1_000_000, 4);
    }

    private function shorten(mixed $description): ?string
    {
        if (! is_string($description) || $description === '') {
            return null;
        }

        return str(strip_tags($description))->squish()->limit(160)->value();
    }
}
