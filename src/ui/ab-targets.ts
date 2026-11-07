/** Whom an Agent Bus request about a document goes to. */
import type { BusAgent } from './api';

/** Where the targets came from, highest priority first. */
export type TargetLevel = 'picked' | 'named' | 'space' | 'instance' | 'none';

export interface TargetInput {
  /** The reader's own choice in the panel for this document; null when there is none. */
  picked: readonly string[] | null;
  /** The agents the document names (`<!-- AB: … -->`). */
  named: readonly string[];
  /** The project's default agents; absent when the project sets none. */
  spaceDefault?: readonly string[];
  /** The instance's default agents. */
  instanceDefault: readonly string[];
  /** The agents on the document's bus, as the panel last read them. */
  agents: readonly BusAgent[];
}

export interface Targets {
  level: TargetLevel;
  /** Every name of the chosen level, in its order, none dropped. */
  targets: string[];
  /** The targets that are not running or not on the bus: a send waits until none is left. */
  unavailable: string[];
}

/**
 * The first level that names anyone: the panel choice, the document's names, the project's defaults,
 * the instance's defaults. A level is taken whole — an agent that is not running stays a target and is
 * reported unavailable; a lower level never stands in for it.
 */
export function resolveTargets({ picked, named, spaceDefault, instanceDefault, agents }: TargetInput): Targets {
  const levels: Array<[TargetLevel, readonly string[] | null | undefined]> = [
    ['picked', picked],
    ['named', named],
    ['space', spaceDefault],
    ['instance', instanceDefault],
  ];
  // A choice is a choice even when empty: the reader unticked everyone.
  const hit = levels.find(([level, names]) => (level === 'picked' ? names !== null && names !== undefined : !!names?.length));
  if (!hit) return { level: 'none', targets: [], unavailable: [] };
  const targets = [...new Set(hit[1]!)];
  const alive = new Set(agents.filter((a) => a.alive).map((a) => a.name));
  return { level: hit[0], targets, unavailable: targets.filter((n) => !alive.has(n)) };
}

/** Agent names as typed: split on spaces, commas and lines, each once, in order. */
export const splitNames = (text: string): string[] => [...new Set(text.split(/[\s,]+/).filter(Boolean))];

/** What a project sets for itself, beside its `[AB]`: nothing when it inherits everything. */
export function spaceSummary(space: { endpoint?: string; default?: string[] } | undefined): string {
  if (!space) return '';
  return [space.endpoint ?? '', (space.default ?? []).join(' ')].filter(Boolean).join(' · ');
}
