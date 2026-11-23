import { callAi, getAiStatus } from './aiClient';
import {
  type MetricSuggestionCatalogItem,
  type MetricSuggestionInput,
  type MetricSuggestionResult,
  validateMetricSuggestion,
  buildFallbackMetricSuggestion,
} from '../core/metrics/metricSuggestionValidator';

export interface FetchMetricSuggestionsOptions {
  cleanRowCount: number;
  confirmedRoles: string[];
  catalogMetrics: MetricSuggestionCatalogItem[];
  confidenceLevel: string;
  signal?: AbortSignal;
  timeoutMs?: number; // Defaults to 7000ms (7s cap)
}

export async function fetchMetricSuggestions(
  options: FetchMetricSuggestionsOptions
): Promise<MetricSuggestionResult> {
  const startMs = Date.now();
  const timeoutMs = options.timeoutMs ?? 7000;
  const feasibleMetrics = options.catalogMetrics.filter((m) => m.feasible);
  const feasibleSet = new Set(feasibleMetrics.map((m) => m.id));

  // Quick fallback check if no API key or AI mode is fallback
  try {
    const aiStatus = await getAiStatus().catch(() => ({ ai_mode: 'fallback' as const }));
    if (aiStatus.ai_mode === 'fallback') {
      const fallback = buildFallbackMetricSuggestion(feasibleMetrics, options.confirmedRoles);
      return {
        ...fallback,
        source: 'fallback',
        model: 'template-local',
        latency_ms: Date.now() - startMs,
      };
    }
  } catch {
    const fallback = buildFallbackMetricSuggestion(feasibleMetrics, options.confirmedRoles);
    return {
      ...fallback,
      source: 'fallback',
      model: 'template-local',
      latency_ms: Date.now() - startMs,
    };
  }

  // AbortController for 7-second timeout
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onParentAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      const fallback = buildFallbackMetricSuggestion(feasibleMetrics, options.confirmedRoles);
      return {
        ...fallback,
        source: 'fallback',
        model: 'template-local',
        latency_ms: Date.now() - startMs,
      };
    }
    options.signal.addEventListener('abort', onParentAbort, { once: true });
  }

  const payload: MetricSuggestionInput = {
    clean_row_count: options.cleanRowCount,
    confirmed_roles: options.confirmedRoles,
    catalog_metrics: options.catalogMetrics,
    confidence_level: options.confidenceLevel,
  };

  try {
    const res = await callAi<unknown>('metric_suggestion', payload, controller.signal);
    clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', onParentAbort);
    }

    const validated = validateMetricSuggestion(res.data, feasibleSet);
    return {
      ...validated,
      source: 'ai',
      model: res.model,
      latency_ms: Date.now() - startMs,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', onParentAbort);
    }

    if (timedOut) {
      console.warn(`[MetricSuggestion] AI suggestion timed out after ${timeoutMs}ms, falling back to local.`);
    } else {
      console.warn('[MetricSuggestion] AI suggestion failed, falling back to local:', err);
    }

    const fallback = buildFallbackMetricSuggestion(feasibleMetrics, options.confirmedRoles);
    return {
      ...fallback,
      source: 'fallback',
      model: 'template-local',
      latency_ms: Date.now() - startMs,
    };
  }
}
