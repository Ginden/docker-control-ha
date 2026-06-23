import { parse, evaluate } from 'cel-js';
import type { CstNode } from 'chevrotain';
import { sdk } from '@internal/docker-open-api';
import { config } from '../config/config.mjs';
import { logger } from '../logger.mjs';

/**
 * Helper functions exposed to CEL expressions. cel-js does not support custom
 * dot-methods (e.g. `name.startsWith(...)`), so these are provided as plain
 * functions: `startsWith(name, "web")`.
 */
const celFunctions: Record<string, CallableFunction> = {
  startsWith: (value: unknown, prefix: string) => String(value).startsWith(prefix),
  endsWith: (value: unknown, suffix: string) => String(value).endsWith(suffix),
  contains: (value: unknown, substring: string) => String(value).includes(substring),
  // Regex match, anchored where the user anchors it (e.g. "^web[0-9]+$").
  matches: (value: unknown, pattern: string) => new RegExp(pattern).test(String(value)),
  lower: (value: unknown) => String(value).toLowerCase(),
  upper: (value: unknown) => String(value).toUpperCase(),
};

/**
 * Curated fields available to a CEL expression regardless of whether the
 * container has been inspected yet. These can all be derived from the cheap
 * `containerList` summary, so a filter using only these never forces an inspect.
 */
interface SummaryFilterContext extends Record<string, unknown> {
  id: string;
  name: string;
  image: string;
  labels: Record<string, string>;
  running: boolean;
  status: string;
}

/**
 * The full context, adding the inspect-only fields: `health` and the `raw` Docker
 * inspect response (escape hatch). Referencing either forces a container inspect.
 */
interface InspectFilterContext extends SummaryFilterContext {
  health: string | null;
  raw: sdk.ContainerInspectResponse;
}

function buildSummaryContext(summary: sdk.ContainerSummary): SummaryFilterContext {
  return {
    id: summary.Id ?? '',
    name: (summary.Names?.[0] ?? '').replace(/^\//, ''),
    image: summary.Image ?? '',
    labels: summary.Labels ?? {},
    running: summary.State === 'running',
    status: summary.State ?? '',
  };
}

function buildInspectContext(data: sdk.ContainerInspectResponse): InspectFilterContext {
  return {
    id: data.Id ?? '',
    name: (data.Name ?? '').replace(/^\//, ''),
    image: data.Config?.Image ?? '',
    labels: data.Config?.Labels ?? {},
    running: data.State?.Running ?? false,
    status: data.State?.Status ?? '',
    health: data.State?.Health?.Status ?? null,
    raw: data,
  };
}

/**
 * Builds an equivalent CEL expression from the deprecated `INCLUDE_DEAD_CONTAINERS`
 * and `REQUIRE_LABEL_TO_EXPOSE` env vars, preserving their original semantics.
 */
function deriveLegacyExpression(): string {
  const parts: string[] = [];
  // Old default excluded non-running containers from discovery.
  if (!config.INCLUDE_DEAD_CONTAINERS) {
    parts.push('running');
  }
  // Old behavior required a specific label to be present.
  if (config.REQUIRE_LABEL_TO_EXPOSE) {
    // JSON.stringify yields a valid, correctly-escaped CEL string literal.
    parts.push(`${JSON.stringify(config.REQUIRE_LABEL_TO_EXPOSE)} in labels`);
  }
  return parts.length > 0 ? parts.join(' && ') : 'true';
}

/**
 * Resolves the effective CEL filter expression. Prefers `CONTAINER_FILTER`; falls
 * back to the deprecated env vars (with a warning) for backward compatibility.
 */
function resolveFilterExpression(): string {
  // Detect explicit use of the legacy vars via the raw environment, since zod
  // defaults make the parsed config indistinguishable from "unset".
  const legacyUsed =
    process.env.INCLUDE_DEAD_CONTAINERS != null || process.env.REQUIRE_LABEL_TO_EXPOSE != null;

  if (config.CONTAINER_FILTER && config.CONTAINER_FILTER.trim() !== '') {
    if (legacyUsed) {
      logger.warn({
        msg: 'CONTAINER_FILTER is set; the deprecated INCLUDE_DEAD_CONTAINERS / REQUIRE_LABEL_TO_EXPOSE variables are ignored.',
      });
    }
    return config.CONTAINER_FILTER;
  }

  const derived = deriveLegacyExpression();
  if (legacyUsed) {
    logger.warn({
      msg: 'INCLUDE_DEAD_CONTAINERS and REQUIRE_LABEL_TO_EXPOSE are deprecated. Use CONTAINER_FILTER (a CEL expression) instead.',
      derivedExpression: derived,
    });
  }
  return derived;
}

const expression = resolveFilterExpression();
const parsed = parse(expression);
if (!parsed.isSuccess) {
  throw new Error(
    `Invalid CONTAINER_FILTER CEL expression: ${expression}\n${parsed.errors.join('\n')}`,
  );
}
const compiled: CstNode = parsed.cst;

/**
 * Whether the filter references inspect-only fields (`raw` or `health`). When it
 * does, every container must be inspected before it can be evaluated; otherwise
 * the cheap `containerList` summary is enough and excluded containers (e.g.
 * thousands of dead testcontainers) are never inspected.
 */
export const filterNeedsInspect = /\b(raw|health)\b/.test(expression);

logger.info({ msg: 'Container filter compiled', expression, filterNeedsInspect });

/**
 * Evaluates the compiled CEL filter against a context. Returns whether the
 * container should be exposed to Home Assistant. On evaluation error the
 * container is excluded (and a warning is logged) so a broken filter fails loud
 * rather than exposing unintended containers.
 */
function evaluateFilter(context: SummaryFilterContext, containerId: string | undefined): boolean {
  try {
    const result = evaluate(compiled, context, celFunctions);
    if (typeof result !== 'boolean') {
      logger.warn({
        msg: 'Container filter did not evaluate to a boolean; coercing.',
        containerId,
        result,
      });
      return Boolean(result);
    }
    return result;
  } catch (err) {
    logger.warn({
      msg: 'Error evaluating container filter; excluding container.',
      containerId,
      err,
    });
    return false;
  }
}

/**
 * Cheap pre-filter using only the `containerList` summary. Use this to decide
 * whether a container is worth inspecting. Only valid when {@link filterNeedsInspect}
 * is false (the expression references no inspect-only fields).
 */
export function matchesContainerSummary(summary: sdk.ContainerSummary): boolean {
  return evaluateFilter(buildSummaryContext(summary), summary.Id);
}

/**
 * Authoritative filter using the full Docker inspect response.
 */
export function matchesContainerFilter(data: sdk.ContainerInspectResponse): boolean {
  return evaluateFilter(buildInspectContext(data), data.Id);
}
