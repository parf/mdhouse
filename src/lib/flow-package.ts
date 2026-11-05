/** Data-only flow authoring packages. Validation never authorizes or executes a flow. */
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

export const FLOW_LIMITS = { manifest: 128 * 1024, document: 256 * 1024, nodes: 128 } as const;
const SCOPES = ['selected-project', 'selected-subsystem', 'selected-document'] as const;
const RANGES = ['explicit-baseline', 'since-last-run'] as const;
const EFFECTS = ['analysis', 'edit', 'commit', 'ticket', 'merge', 'deploy'] as const;
const STATES = ['complete', 'blocked', 'failed', 'cancelled', 'partial'] as const;
export type FlowEffect = typeof EFFECTS[number];
export type FlowState = typeof STATES[number];
export type FlowTarget = { kind: 'step'; id: string }
  | { kind: 'end'; status: FlowState }
  | { kind: 'handoff'; to: 'person' | 'team' | 'agent' | 'external'; target: string };
export interface FlowStep {
  id: string;
  document: string;
  effect: FlowEffect;
  approval: 'none' | 'explicit';
  on: Record<string, FlowTarget>;
}
export interface FlowPackage {
  schemaVersion: 1;
  id: string;
  title: string;
  family: string;
  entry: string;
  defaults: {
    scope: typeof SCOPES[number]; range: typeof RANGES[number]; audience: string;
    output: string; destination: string;
  };
  evidence: { required: string[]; missing: 'block' | 'report' };
  example: string;
  steps: FlowStep[];
}
export interface LoadedFlowPackage {
  manifest: FlowPackage;
  documents: Map<string, string>;
  example: string;
}

function invalid(at: string, message: string): never {
  throw new Error(`Invalid flow package at ${at}: ${message}`);
}
function object(value: unknown, keys: string[], at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(at, 'expected an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${at}.${key}`, 'unknown field');
  return value as Record<string, unknown>;
}
function label(value: unknown, at: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) invalid(at, 'expected a trimmed nonempty label (max 1024 characters)');
  return value;
}
function choice<const T extends readonly string[]>(value: unknown, choices: T, at: string): T[number] {
  const text = label(value, at);
  if (!choices.includes(text)) invalid(at, `expected ${choices.join(', ')}`);
  return text as T[number];
}
function id(value: unknown, at: string): string {
  const text = label(value, at);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(text) || text.length > 80) invalid(at, 'expected a lowercase slug (max 80 characters)');
  return text;
}
/** Relative asset/output declarations only; this does not resolve or grant project access. */
function path(value: unknown, extension: '.md' | '.json', at: string): string {
  const text = label(value, at);
  if (isAbsolute(text) || /[\\:%?#]/.test(text) || !text.endsWith(extension)
    || text.split('/').some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    invalid(at, `expected a relative ${extension} path without traversal, URL or .git components`);
  }
  return text;
}
function target(value: unknown, at: string): FlowTarget {
  const item = object(value, ['kind', 'id', 'status', 'to', 'target'], at);
  if (item.kind === 'step') {
    object(value, ['kind', 'id'], at);
    return { kind: 'step', id: id(item.id, `${at}.id`) };
  }
  if (item.kind === 'end') {
    object(value, ['kind', 'status'], at);
    return { kind: 'end', status: choice(item.status, STATES, `${at}.status`) };
  }
  if (item.kind === 'handoff') {
    object(value, ['kind', 'to', 'target'], at);
    const to = choice(item.to, ['person', 'team', 'agent', 'external'] as const, `${at}.to`);
    return { kind: 'handoff', to, target: to === 'external' ? id(item.target, `${at}.target`) : label(item.target, `${at}.target`) };
  }
  return invalid(`${at}.kind`, 'expected step, end or handoff');
}

/** Returns fresh typed data or throws; validates declarations, never live destinations or approvals. */
export function validateFlowPackage(value: unknown): FlowPackage {
  const item = object(value, ['schemaVersion', 'id', 'title', 'family', 'entry', 'defaults', 'evidence', 'example', 'steps'], 'manifest');
  if (item.schemaVersion !== 1) invalid('schemaVersion', 'expected 1');
  const defaults = object(item.defaults, ['scope', 'range', 'audience', 'output', 'destination'], 'defaults');
  const evidence = object(item.evidence, ['required', 'missing'], 'evidence');
  if (!Array.isArray(evidence.required) || !evidence.required.length || evidence.required.length > 128) invalid('evidence.required', 'expected 1–128 source labels');
  const required = evidence.required.map((v, i) => label(v, `evidence.required[${i}]`));
  if (new Set(required).size !== required.length) invalid('evidence.required', 'duplicate source');
  if (!Array.isArray(item.steps) || !item.steps.length || item.steps.length > FLOW_LIMITS.nodes) invalid('steps', 'expected 1–128 nodes');
  const steps: FlowStep[] = item.steps.map((v, i) => {
    const at = `steps[${i}]`;
    const node = object(v, ['id', 'document', 'effect', 'approval', 'on'], at);
    const effect = choice(node.effect, EFFECTS, `${at}.effect`);
    const approval = choice(node.approval, ['none', 'explicit'] as const, `${at}.approval`);
    if (approval !== (effect === 'analysis' ? 'none' : 'explicit')) invalid(`${at}.approval`, 'each consequential effect requires explicit approval; analysis uses none');
    const outcomes = effect === 'analysis' ? ['complete', 'blocked', 'failed'] : ['succeeded', 'denied', 'failed', 'partial'];
    const on = object(node.on, outcomes, `${at}.on`);
    const routes: Record<string, FlowTarget> = {};
    for (const outcome of outcomes) {
      const route = target(on[outcome], `${at}.on.${outcome}`);
      if (outcome !== 'complete' && outcome !== 'succeeded') {
        const status = outcome === 'denied' ? 'cancelled' : outcome;
        if (route.kind !== 'end' || route.status !== status) invalid(`${at}.on.${outcome}`, `must end in recoverable ${status} state`);
      }
      routes[outcome] = route;
    }
    return { id: id(node.id, `${at}.id`), document: path(node.document, '.md', `${at}.document`), effect, approval, on: routes };
  });
  const manifest: FlowPackage = {
    schemaVersion: 1, id: id(item.id, 'id'), title: label(item.title, 'title'), family: id(item.family, 'family'), entry: id(item.entry, 'entry'),
    defaults: {
      scope: choice(defaults.scope, SCOPES, 'defaults.scope'), range: choice(defaults.range, RANGES, 'defaults.range'),
      audience: label(defaults.audience, 'defaults.audience'), output: id(defaults.output, 'defaults.output'),
      destination: path(defaults.destination, '.md', 'defaults.destination'),
    },
    evidence: { required, missing: choice(evidence.missing, ['block', 'report'] as const, 'evidence.missing') },
    example: path(item.example, '.md', 'example'), steps,
  };
  const nodes = new Map(steps.map((node) => [node.id, node]));
  if (nodes.size !== steps.length) invalid('steps', 'duplicate node ID');
  if (!nodes.has(manifest.entry)) invalid('entry', 'missing node');
  for (const node of steps) for (const route of Object.values(node.on)) {
    if (route.kind === 'step' && !nodes.has(route.id)) invalid(`steps.${node.id}.on`, `missing target ${route.id}`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) invalid(`steps.${nodeId}`, 'routing cycle');
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const route of Object.values(nodes.get(nodeId)!.on)) if (route.kind === 'step') visit(route.id);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  visit(manifest.entry);
  if (visited.size !== steps.length) invalid('steps', 'unreachable node');
  return manifest;
}

async function readAsset(root: string, rel: string, extension: '.md' | '.json', limit: number): Promise<string> {
  path(rel, extension, rel);
  const absolute = await realpath(join(root, rel));
  const inside = relative(root, absolute);
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)
    || inside.split(sep).some((part) => part.toLowerCase() === '.git')) invalid(rel, 'asset escapes package or enters .git');
  const file = await open(absolute, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) invalid(rel, 'expected a regular file');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) invalid(rel, `exceeds ${limit} bytes`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    if (!text.trim()) invalid(rel, 'empty asset');
    return text;
  } finally {
    await file.close();
  }
}

/** Reads declared local assets only; callers choose the package directory, not an HTTP path. */
export async function loadFlowPackage(packageDir: string): Promise<LoadedFlowPackage> {
  const root = await realpath(packageDir);
  const manifest = validateFlowPackage(JSON.parse(await readAsset(root, 'flow.json', '.json', FLOW_LIMITS.manifest)));
  const documents = new Map<string, string>();
  for (const step of manifest.steps) if (!documents.has(step.document)) {
    documents.set(step.document, await readAsset(root, step.document, '.md', FLOW_LIMITS.document));
  }
  const example = await readAsset(root, manifest.example, '.md', FLOW_LIMITS.document);
  return { manifest, documents, example };
}

/** Loads an explicit catalog atomically; no discovery scans, writes, target resolution or execution. */
export async function loadFlowCatalog(directory: string): Promise<LoadedFlowPackage[]> {
  const root = await realpath(directory);
  const catalog = object(JSON.parse(await readAsset(root, 'catalog.json', '.json', FLOW_LIMITS.manifest)), ['schemaVersion', 'packages'], 'catalog');
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages) || !catalog.packages.length || catalog.packages.length > 128) invalid('catalog', 'expected version 1 with 1–128 packages');
  const loaded: LoadedFlowPackage[] = [];
  const ids = new Set<string>();
  for (const [i, value] of catalog.packages.entries()) {
    const at = `catalog.packages[${i}]`;
    const entry = object(value, ['id', 'family', 'manifest', 'example'], at);
    const entryId = id(entry.id, `${at}.id`);
    if (ids.has(entryId)) invalid(at, 'duplicate package ID');
    ids.add(entryId);
    const family = id(entry.family, `${at}.family`);
    const manifestPath = path(entry.manifest, '.json', `${at}.manifest`);
    if (!manifestPath.endsWith('/flow.json')) invalid(at, 'expected <package>/flow.json');
    await readAsset(root, manifestPath, '.json', FLOW_LIMITS.manifest);
    const entryExample = path(entry.example, '.md', `${at}.example`);
    const flow = await loadFlowPackage(join(root, dirname(manifestPath)));
    if (flow.manifest.id !== entryId || flow.manifest.family !== family
      || entryExample !== `${dirname(manifestPath)}/${flow.manifest.example}`) invalid(at, 'catalog identity/example mismatch');
    if (await readAsset(root, entryExample, '.md', FLOW_LIMITS.document) !== flow.example) invalid(at, 'catalog example mismatch');
    loaded.push(flow);
  }
  return loaded;
}
