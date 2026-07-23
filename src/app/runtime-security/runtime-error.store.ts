import { signal } from '@angular/core';

export type RuntimeErrorSeverity = 'warning' | 'critical';

export interface RuntimeErrorNotice {
  detail?: string;
  message: string;
  severity: RuntimeErrorSeverity;
  source: string;
  sourceLabel: string;
  summary?: string;
  timestamp: number;
  title: string;
}

const DEFAULT_WARNING_TITLE = 'Runtime issue detected';
const DEFAULT_WARNING_MESSAGE = 'MicrobeTrace caught an error. Your current view may still be usable, but the last action may need to be retried.';
const DEFAULT_CRITICAL_TITLE = 'Application startup error';
const DEFAULT_CRITICAL_MESSAGE = 'MicrobeTrace could not finish starting. Refresh the page and retry the last action.';
const DETAIL_LIMIT = 1200;
const SUMMARY_LIMIT = 220;
const SOURCE_LABELS: Record<string, string> = {
  'angular.error': 'App component or action',
  bootstrap: 'Application startup',
  'window.error': 'Browser runtime event',
  'window.unhandledrejection': 'Async browser task',
};

export const runtimeErrorNotice = signal<RuntimeErrorNotice | null>(null);

export function reportRuntimeError(options: {
  detail?: string;
  error?: unknown;
  source: string;
  title?: string;
  message?: string;
  severity?: RuntimeErrorSeverity;
}): void {
  const severity = options.severity ?? 'warning';
  if (severity !== 'critical') {
    return;
  }

  const detail = options.detail ?? describeErrorDetail(options.error);
  const summary = options.error === undefined && options.detail
    ? options.detail
    : describeError(options.error);
  const nextNotice: RuntimeErrorNotice = {
    title: options.title ?? getDefaultTitle(severity),
    message: options.message ?? getDefaultMessage(severity),
    severity,
    summary: normalizeErrorText(summary, SUMMARY_LIMIT),
    detail: normalizeErrorText(detail, DETAIL_LIMIT, true),
    timestamp: Date.now(),
    source: options.source,
    sourceLabel: SOURCE_LABELS[options.source] ?? options.source,
  };

  const currentNotice = runtimeErrorNotice();
  if (
    currentNotice &&
    currentNotice.source === nextNotice.source &&
    currentNotice.severity === nextNotice.severity &&
    currentNotice.title === nextNotice.title &&
    currentNotice.message === nextNotice.message &&
    currentNotice.summary === nextNotice.summary &&
    currentNotice.detail === nextNotice.detail
  ) {
    return;
  }

  runtimeErrorNotice.set(nextNotice);
}

export function dismissRuntimeError(): void {
  runtimeErrorNotice.set(null);
}

export function describeError(error: unknown): string {
  if (error === undefined || error === null) {
    return 'No error detail was supplied.';
  }

  if (error instanceof Error) {
    const name = error.name || 'Error';
    return error.message ? `${name}: ${error.message}` : name;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return 'Non-serializable error object';
    }
  }

  return 'Unknown runtime error';
}

function describeErrorDetail(error: unknown): string {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  return describeError(error);
}

function getDefaultTitle(severity: RuntimeErrorSeverity): string {
  return severity === 'critical' ? DEFAULT_CRITICAL_TITLE : DEFAULT_WARNING_TITLE;
}

function getDefaultMessage(severity: RuntimeErrorSeverity): string {
  return severity === 'critical' ? DEFAULT_CRITICAL_MESSAGE : DEFAULT_WARNING_MESSAGE;
}

function normalizeErrorText(text: string | undefined, limit: number, preserveWhitespace = false): string | undefined {
  const trimmedText = text?.trim();
  const normalizedText = preserveWhitespace ? trimmedText : trimmedText?.replace(/\s+/g, ' ');

  if (!normalizedText || normalizedText === 'No error detail was supplied.') {
    return undefined;
  }

  if (normalizedText.length <= limit) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, limit - 1)}...`;
}
