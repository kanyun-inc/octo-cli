import { parsePositiveInteger } from './aggregate.js';
import { getExtraHeaders } from './config.js';

declare const __PKG_VERSION__: string;

const PKG_VERSION =
  typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : 'dev';
const USER_AGENT = `octo-cli/${PKG_VERSION} (node ${process.version}; ${process.platform})`;

function mergeHeaders(
  extraHeaders: Record<string, string>,
  builtInHeaders: Record<string, string>
): Record<string, string> {
  const builtInHeaderNames = new Set(
    Object.keys(builtInHeaders).map((key) => key.toLowerCase())
  );
  const safeExtraHeaders = Object.fromEntries(
    Object.entries(extraHeaders).filter(
      ([key]) => !builtInHeaderNames.has(key.toLowerCase())
    )
  );

  return {
    ...safeExtraHeaders,
    ...builtInHeaders,
  };
}

/**
 * Sort query parameters by key to keep request URLs deterministic. Sorting the
 * raw `key=value` pairs instead would order by value once one key is a prefix
 * of another (`a=2&a1=1` → `a1=1&a=2`, since `1` < `=`), and would reorder
 * repeated keys by value. Sorting is stable, so repeated keys keep their
 * original relative order.
 */
function canonicalizeQuery(rawQuery: string): string {
  if (!rawQuery) return '';
  return rawQuery
    .split('&')
    .filter(Boolean)
    .map((pair, index) => {
      const separator = pair.indexOf('=');
      return {
        key: separator === -1 ? pair : pair.slice(0, separator),
        index,
        pair,
      };
    })
    .sort((a, b) =>
      a.key === b.key ? a.index - b.index : a.key < b.key ? -1 : 1
    )
    .map(({ pair }) => pair)
    .join('&');
}

interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

type AuthConfig = { token: string };

/** Silence/disable scope. The backend only accepts these lowercase values. */
export type AlertScope = 'all' | 'specify';

export const ALERT_SCOPES: readonly AlertScope[] = ['all', 'specify'];

function normalizeIssueDataSource(
  dataSource: string | undefined
): 'log' | 'rum' {
  const normalized = dataSource ?? 'log';
  if (normalized === 'log' || normalized === 'rum') return normalized;
  throw new Error('Issue data source must be one of: log, rum');
}

function normalizeIssueIds(
  issueIds: string[],
  minimum: number,
  minimumErrorMessage: string
): string[] {
  if (!Array.isArray(issueIds)) {
    throw new Error('Issue IDs must be an array');
  }
  const normalized = issueIds.map((issueId) => String(issueId).trim());
  if (normalized.some((issueId) => !issueId)) {
    throw new Error('Issue IDs must not contain blank values');
  }
  const distinct = [...new Set(normalized)];
  if (distinct.length < minimum) {
    throw new Error(minimumErrorMessage);
  }
  return distinct;
}

function normalizeIssueId(issueId: string, fieldName: string): string {
  const normalized = String(issueId ?? '').trim();
  if (!normalized) throw new Error(`${fieldName} must not be blank`);
  return normalized;
}

/** Editable content of one error-tracking aggregation step or rule. */
export type IssueAggregationRuleElement =
  | {
      pipelineType: 'pipeline';
      issuePipeline: { name: string; filter?: string | null };
      issuePipelineProcess?: null;
    }
  | {
      pipelineType: 'process';
      issuePipelineProcess: { name: string; type: 0 | 1 | 2; rule: string };
      issuePipeline?: null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function aggregationRulesPath(dataSource: string): string {
  if (dataSource !== 'log' && dataSource !== 'rum') {
    throw new Error(
      'Aggregation rule dataSource is required and must be log or rum'
    );
  }
  return `/infra-octopus-openapi/v1/error-tracking/process/pipelines?dataSource=${dataSource}`;
}

function aggregationNodePath(
  id: number,
  dataSource: string,
  action = ''
): string {
  const [path, query] = aggregationRulesPath(dataSource).split('?');
  return `${path}/${parsePositiveInteger(id, 'Node ID')}${action}?${query}`;
}

function normalizeAggregationElement(
  element: unknown,
  dataSource: string
): IssueAggregationRuleElement {
  if (!isRecord(element)) {
    throw new Error('issuePipelineElement must be a step or rule object');
  }
  const kind = element.pipelineType;
  const config =
    kind === 'pipeline' ? element.issuePipeline : element.issuePipelineProcess;
  if (
    (kind !== 'pipeline' && kind !== 'process') ||
    !isRecord(config) ||
    (kind === 'pipeline' && element.issuePipelineProcess != null) ||
    (kind === 'process' && element.issuePipeline != null)
  ) {
    throw new Error(
      'pipelineType must be pipeline or process with only its matching configuration'
    );
  }
  if (
    typeof config.name !== 'string' ||
    !config.name.trim() ||
    config.name.length > 100
  ) {
    throw new Error(
      'Aggregation node name must be nonblank and at most 100 characters'
    );
  }
  if (kind === 'pipeline') {
    if (
      config.filter != null &&
      (typeof config.filter !== 'string' || config.filter.length > 2048)
    ) {
      throw new Error(
        'Aggregation step filter must be a string of at most 2048 characters'
      );
    }
    return {
      pipelineType: kind,
      issuePipeline: {
        name: config.name,
        filter: config.filter as string | null | undefined,
      },
    };
  }
  if (
    (config.type !== 0 && config.type !== 1 && config.type !== 2) ||
    typeof config.rule !== 'string'
  ) {
    throw new Error(
      'Aggregation rule requires numeric type 0, 1, or 2 and rule text'
    );
  }
  if (dataSource === 'rum' && config.type !== 0) {
    throw new Error('RUM supports only fingerprint rules (type 0)');
  }
  return {
    pipelineType: kind,
    issuePipelineProcess: {
      name: config.name,
      type: config.type,
      rule: config.rule,
    },
  };
}

function aggregationPosition(
  parentElementId?: number | null,
  previousElementId?: number | null
) {
  return {
    parentElementId:
      parentElementId == null || parentElementId === 0
        ? (parentElementId ?? null)
        : parsePositiveInteger(parentElementId, 'parentElementId'),
    previousElementId:
      previousElementId == null
        ? null
        : parsePositiveInteger(previousElementId, 'previousElementId'),
  };
}

export type EventSubscriptionStatus = 'DISABLED' | 'ENABLED';

export type EventWebhookRequestFormat = 'DEFAULT' | 'CUSTOM';

export interface PageData<T> {
  count: number;
  list: T[];
  lastPage: boolean;
}

export interface EventSubscriptionSearchParams {
  keyword?: string;
  environment?: 'test' | 'online';
  status?: EventSubscriptionStatus;
  pageNo?: number;
  pageSize?: number;
}

export interface EventSubscriptionCreateParams {
  name: string;
  description?: string | null;
  environment: 'test' | 'online';
  filter: string;
  webhookId: number;
}

export interface EventSubscriptionUpdateParams {
  name: string;
  description?: string | null;
  filter: string;
  webhookId: number;
}

export interface EventSubscriptionListItem {
  id: number;
  name: string;
  description: string | null;
  environment: 'test' | 'online';
  status: EventSubscriptionStatus;
  filter: string;
  webhookId: number;
  webhookName: string;
  webhookRequestFormat: EventWebhookRequestFormat;
  updatedAt: number | null;
}

export interface EventSubscriptionDetail {
  id: number;
  name: string;
  description: string | null;
  environment: 'test' | 'online';
  filter: string;
  webhookId: number;
  webhookName: string;
  status: EventSubscriptionStatus;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface EventWebhookSearchParams {
  keyword?: string;
  requestFormat?: EventWebhookRequestFormat;
  pageNo?: number;
  pageSize?: number;
}

export interface EventWebhookParams {
  name: string;
  url: string;
  headers?: Record<string, string> | null;
  requestFormat: EventWebhookRequestFormat;
  bodyTemplate?: string | null;
}

export interface EventWebhookListItem {
  id: number;
  name: string;
  url: string;
  requestFormat: EventWebhookRequestFormat;
  referenceCount: number;
  updatedAt: number | null;
}

export interface EventWebhookDetail {
  id: number;
  name: string;
  url: string;
  headers: Record<string, string>;
  requestFormat: EventWebhookRequestFormat;
  bodyTemplate: string | null;
  updatedAt: number | null;
}

export interface EventWebhookTestResult {
  success: boolean;
  httpStatus: number | null;
  durationMs: number;
  summary: string | null;
}

/**
 * Accepts the legacy uppercase spelling that older versions of this CLI sent,
 * so `--scope ALL` keeps working instead of failing with "静默范围不能为空".
 */
export function normalizeAlertScope(scope: string | undefined): AlertScope {
  const normalized = (scope ?? 'all').trim().toLowerCase();
  if (normalized === 'all' || normalized === 'specify') return normalized;
  throw new Error(
    `Invalid scope "${scope}". Expected one of: ${ALERT_SCOPES.join(', ')}`
  );
}

export class OctoClient {
  private authConfig: AuthConfig;

  constructor(
    private baseUrl: string,
    authConfig: AuthConfig
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authConfig = authConfig;
  }

  private async request<T>(
    method: string,
    apiPath: string,
    body?: unknown
  ): Promise<T> {
    // Preserve the established canonical query ordering so equivalent requests
    // produce the same URL and repeated keys retain their original order.
    const [pathOnly, rawQuery = ''] = apiPath.split('?');
    const canonicalQuery = canonicalizeQuery(rawQuery);

    const url = `${this.baseUrl}${pathOnly}${
      canonicalQuery ? `?${canonicalQuery}` : ''
    }`;
    // `body ?? ''` is not enough: a bare `0` body (a valid rule id for the
    // DELETE endpoints) is falsy and would be dropped.
    const payload =
      body === undefined || body === null ? '' : JSON.stringify(body);

    const headers = mergeHeaders(getExtraHeaders(), {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.authConfig.token}`,
      'User-Agent': USER_AGENT,
    });

    const res = await fetch(url, {
      method,
      headers,
      body: payload || undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${text}`.trim());
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (json.code !== 0) {
      throw new Error(`API error (code=${json.code}): ${json.message}`);
    }
    return json.data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async del<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }

  // --- Logs ---

  async logsSearch(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    limit?: number;
    order?: string;
    scrollId?: string;
    serializedSortValues?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/logs/search', params);
  }

  async logsAggregate(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    aggregationFields?: { field: string; operation: string }[];
    groupFields?: {
      field: string;
      limit?: number;
      sort?: { field: string; operation: string; order: string };
    }[];
  }) {
    return this.post('/infra-octopus-openapi/v1/logs/aggregate', params);
  }

  // --- Alerts ---

  async alertsSearch(params: {
    from: number;
    to: number;
    env?: string;
    /** `firing` | `resolved`. Omit for all statuses — do not pass `all`. */
    status?: string;
    priorities?: string[];
    query?: string;
    services?: string[];
    limit?: number;
    pageNo?: number;
    groupId?: number;
    ruleIds?: number[];
    alertRuleType?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/alerts/search', params);
  }

  /**
   * The backend VO uses plural array fields (`envs`, `priorities`). Singular
   * `env`/`priority` are silently ignored, returning unfiltered results.
   */
  async alertRulesSearch(params: {
    groupId: number;
    envs?: string[];
    priorities?: string[];
    statusList?: string[];
    searchInput?: string;
    types?: string[];
    service?: string;
    tags?: string[];
    creator?: string;
    pageParam: { pageNo: number; pageSize: number };
  }) {
    return this.post('/infra-octopus-openapi/v1/alert/rules/search', params);
  }

  async alertGroupsList() {
    return this.get('/infra-octopus-openapi/v1/alert/rules/groups');
  }

  async alertRuleDetailsSearch(ruleIds: number[]) {
    if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
      throw new Error('At least one alert rule ID is required');
    }
    if (ruleIds.length > 100) {
      throw new Error('At most 100 alert rule IDs can be queried at once');
    }
    if (
      ruleIds.some((ruleId) => !Number.isSafeInteger(ruleId) || ruleId <= 0)
    ) {
      throw new Error('Alert rule IDs must be positive integers');
    }

    return this.post('/infra-octopus-openapi/v1/alert/rules/details/search', {
      ruleIds,
    });
  }

  async alertRuleHistory(ruleId: number) {
    const id = parsePositiveInteger(ruleId, 'ruleId');
    return this.get(`/infra-octopus-openapi/v1/alert/rules/${id}/history`);
  }

  async alertRulesCreate(rules: unknown[]) {
    return this.post('/infra-octopus-openapi/v1/alert/rules', rules);
  }

  async alertRulesDelete(ruleId: number) {
    return this.del('/infra-octopus-openapi/v1/alert/rules', ruleId);
  }

  /** Complete PUT: callers must read rule details and submit the full edited configuration. */
  async alertRuleUpdate(ruleId: number, rule: Record<string, unknown>) {
    const id = parsePositiveInteger(ruleId, 'ruleId');
    if (!isRecord(rule) || Object.keys(rule).length === 0) {
      throw new Error('rule must be a non-empty complete rule configuration');
    }
    return this.put(`/infra-octopus-openapi/v1/alert/rules/${id}`, rule);
  }

  async alertClose(alertId: number) {
    const id = parsePositiveInteger(alertId, 'alertId');
    return this.put(`/infra-octopus-openapi/v1/alerts/${id}/close`, null);
  }

  async alertAssign(
    alertId: number,
    params: { assigneeUserId?: number; assigneeLdap?: string }
  ) {
    const id = parsePositiveInteger(alertId, 'alertId');
    const assigneeUserId =
      params.assigneeUserId == null
        ? undefined
        : parsePositiveInteger(params.assigneeUserId, 'assigneeUserId');
    const assigneeLdap =
      typeof params.assigneeLdap === 'string'
        ? params.assigneeLdap.trim()
        : undefined;
    if (assigneeUserId === undefined && !assigneeLdap) {
      throw new Error('assigneeUserId or assigneeLdap is required');
    }
    return this.put(`/infra-octopus-openapi/v1/alerts/${id}/assign`, {
      assigneeUserId,
      assigneeLdap: assigneeLdap || undefined,
    });
  }

  async alertCancelAssignment(alertId: number) {
    const id = parsePositiveInteger(alertId, 'alertId');
    return this.put(
      `/infra-octopus-openapi/v1/alerts/${id}/assign/cancel`,
      null
    );
  }

  async alertClaim(alertId: number) {
    const id = parsePositiveInteger(alertId, 'alertId');
    return this.post(`/infra-octopus-openapi/v1/alerts/${id}/claim`, null);
  }

  /** `scope` is lowercase — uppercase `ALL` is rejected with "静默范围不能为空". */
  async alertSilenceCreate(params: {
    ruleId: number;
    alertId: number;
    startTime: number;
    endTime: number;
    scope: AlertScope;
    specifyGroups?: Record<string, string[]>;
    silentlyNotify: boolean;
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/alerts/silences/create',
      params
    );
  }

  async alertDetail(alertId: number) {
    return this.get(`/infra-octopus-openapi/v1/alerts/${alertId}`);
  }

  async alertTimeseries(params: {
    alertId: number;
    from: number;
    to: number;
    conditionId?: number;
  }) {
    const qs = new URLSearchParams({
      from: String(params.from),
      to: String(params.to),
    });
    if (params.conditionId != null) {
      qs.set('conditionId', String(params.conditionId));
    }
    return this.get(
      `/infra-octopus-openapi/v1/alerts/${params.alertId}/timeseries?${qs}`
    );
  }

  async alertSilenceDelete(ruleId: number) {
    return this.del(`/infra-octopus-openapi/v1/alerts/silences/${ruleId}`);
  }

  // --- Alert rule disables ---
  // A "disable" stops the rule itself from evaluating for a time window,
  // whereas a "silence" only suppresses notifications for one firing alert.

  async alertRuleDisableCreate(params: {
    ruleId: number;
    startTime: number;
    endTime: number;
    scope: AlertScope;
    specifyGroups?: Record<string, string[]>;
    disableNotifyContent?: string;
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/alert/rules/disables/create',
      params
    );
  }

  async alertRuleDisableList(ruleId: number) {
    return this.get(`/infra-octopus-openapi/v1/alert/rules/disables/${ruleId}`);
  }

  /** Takes the disable record's own id, not the alert rule id. */
  async alertRuleDisableDelete(disableId: number) {
    return this.del(
      `/infra-octopus-openapi/v1/alert/rules/disables/${disableId}`
    );
  }

  // --- Error Tracking (Issues) ---

  async issuesSearch(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    sortType: string;
    status: string;
    service?: string;
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/search',
      params
    );
  }

  async issueDetail(issueId: string) {
    return this.get(
      `/infra-octopus-openapi/v1/log-error-tracking/issues/${issueId}`
    );
  }

  async issueAiAnalysis(
    issueId: string,
    context?: string
  ): Promise<{ sessionId: string }> {
    const normalizedIssueId = normalizeIssueId(issueId, 'issueId');
    return this.post<{ sessionId: string }>(
      `/infra-octopus-openapi/v1/log-error-tracking/issues/${encodeURIComponent(normalizedIssueId)}/ai-analysis`,
      context === undefined ? undefined : { context }
    );
  }

  async issuesBatchAssign(params: {
    assigneeId?: number;
    assigneeLdap?: string;
    dataSource?: string;
    issueIds: string[];
  }) {
    const assigneeId =
      params.assigneeId == null
        ? undefined
        : parsePositiveInteger(params.assigneeId, 'assigneeId');
    const assigneeLdap =
      typeof params.assigneeLdap === 'string'
        ? params.assigneeLdap.trim()
        : undefined;
    if (assigneeId === undefined && !assigneeLdap) {
      throw new Error('assigneeId or assigneeLdap is required');
    }
    return this.post(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/batch-assign',
      {
        ...(assigneeId === undefined ? { assigneeLdap } : { assigneeId }),
        issueIds: normalizeIssueIds(
          params.issueIds,
          1,
          'At least one Issue ID is required'
        ),
        dataSource: normalizeIssueDataSource(params.dataSource),
      }
    );
  }

  async issueCancelAssignment(issueId: string, dataSource?: string) {
    const id = encodeURIComponent(normalizeIssueId(issueId, 'issueId'));
    return this.del(
      `/infra-octopus-openapi/v1/log-error-tracking/issues/${id}/assign?dataSource=${normalizeIssueDataSource(dataSource)}`
    );
  }

  async issuesBatchUpdate(params: {
    dataSource: string;
    env: string;
    issueIds: string[];
    status: string;
    ignoreRule?: unknown;
  }) {
    return this.put(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/batch-update',
      params
    );
  }

  async issuesMerge(params: { issueIds: string[]; dataSource?: string }) {
    return this.post(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/merge',
      {
        issueIds: normalizeIssueIds(
          params.issueIds,
          2,
          'At least two distinct Issue IDs are required'
        ),
        dataSource: normalizeIssueDataSource(params.dataSource),
      }
    );
  }

  async issuesUnmerge(params: {
    mergeIssueId: string;
    childIssueIds: string[];
    dataSource?: string;
  }): Promise<{ mergeIssueExists: boolean }> {
    return this.post<{ mergeIssueExists: boolean }>(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/unmerge',
      {
        mergeIssueId: normalizeIssueId(params.mergeIssueId, 'mergeIssueId'),
        childIssueIds: normalizeIssueIds(
          params.childIssueIds,
          1,
          'At least one child Issue ID is required'
        ),
        dataSource: normalizeIssueDataSource(params.dataSource),
      }
    );
  }

  async issueMergeChildren(issueId: string, dataSource?: string) {
    const normalizedIssueId = normalizeIssueId(issueId, 'issueId');
    const normalizedDataSource = normalizeIssueDataSource(dataSource);
    return this.get(
      `/infra-octopus-openapi/v1/log-error-tracking/issues/${encodeURIComponent(normalizedIssueId)}/merge-children?dataSource=${normalizedDataSource}`
    );
  }

  // --- Error tracking aggregation rule management ---

  async issueAggregationRulesList(dataSource: string) {
    return this.get(aggregationRulesPath(dataSource));
  }

  async issueAggregationRulesCreate(params: {
    dataSource: string;
    issuePipelineElement: IssueAggregationRuleElement;
    parentElementId?: number | null;
    previousElementId?: number | null;
  }) {
    const path = aggregationRulesPath(params.dataSource);
    const element = normalizeAggregationElement(
      params.issuePipelineElement,
      params.dataSource
    );
    const position = aggregationPosition(
      params.parentElementId,
      params.previousElementId
    );
    if (element.pipelineType === 'process' && !position.parentElementId) {
      throw new Error(
        'An aggregation process rule requires a positive parentElementId'
      );
    }
    return this.post(path, { issuePipelineElement: element, ...position });
  }

  async issueAggregationRulesUpdate(
    id: number,
    params: {
      dataSource: string;
      issuePipelineElement: IssueAggregationRuleElement;
    }
  ) {
    const path = aggregationNodePath(id, params.dataSource);
    return this.put(path, {
      issuePipelineElement: normalizeAggregationElement(
        params.issuePipelineElement,
        params.dataSource
      ),
    });
  }

  async issueAggregationRulesDelete(id: number, dataSource: string) {
    return this.del(aggregationNodePath(id, dataSource));
  }

  async issueAggregationRulesStatus(
    id: number,
    enable: boolean,
    dataSource: string
  ) {
    const path = aggregationNodePath(id, dataSource, '/status');
    if (typeof enable !== 'boolean')
      throw new Error('enable must be a boolean');
    return this.put(`${path}&enable=${enable}`, null);
  }

  async issueAggregationRulesDuplicate(sourceId: number, dataSource: string) {
    const [path, query] = aggregationRulesPath(dataSource).split('?');
    return this.post(`${path}/duplicate?${query}`, {
      sourceId: parsePositiveInteger(sourceId, 'sourceId'),
    });
  }

  async issueAggregationRulesMove(params: {
    id: number;
    dataSource: string;
    parentElementId?: number | null;
    previousElementId?: number | null;
  }) {
    const [path, query] = aggregationRulesPath(params.dataSource).split('?');
    const id = parsePositiveInteger(params.id, 'Node ID');
    const position = aggregationPosition(
      params.parentElementId,
      params.previousElementId
    );
    if (position.parentElementId === id || position.previousElementId === id) {
      throw new Error('A node cannot be its own parent or previous element');
    }
    return this.post(`${path}/move?${query}`, { id, ...position });
  }

  // --- Cases ---

  async casesList(params: {
    pageNo: number;
    pageSize: number;
    groupId?: number;
    status?: string;
    priority?: string;
    assignerId?: number;
    input?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/cases/list', params);
  }

  async caseCreate(params: {
    name: string;
    groupId: number;
    priority?: string;
    status?: string;
    assignerId?: number;
    description?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/cases', params);
  }

  async caseDetail(id: number) {
    return this.post(`/infra-octopus-openapi/v1/cases/${id}`, null);
  }

  async caseDetailByKey(caseKey: string) {
    return this.post(`/infra-octopus-openapi/v1/cases/key/${caseKey}`, null);
  }

  async caseUpdate(
    id: number,
    params: {
      groupId?: number;
      priority?: string;
      status?: string;
      assignerId?: number;
      description?: string;
    }
  ) {
    return this.put(`/infra-octopus-openapi/v1/cases/${id}`, params);
  }

  async caseDelete(id: number) {
    return this.del(`/infra-octopus-openapi/v1/cases/${id}`);
  }

  async caseAddRelation(
    id: number,
    params: {
      type: string;
      targetId: string;
    }
  ) {
    return this.post(`/infra-octopus-openapi/v1/cases/${id}/relation`, params);
  }

  async caseDeleteRelation(id: number, relationId: number) {
    return this.del(
      `/infra-octopus-openapi/v1/cases/${id}/relation/${relationId}`
    );
  }

  async caseAddNote(id: number, note: string) {
    return this.post(`/infra-octopus-openapi/v1/cases/${id}/note`, note);
  }

  async caseUpdateNote(id: number, noteId: number, note: string) {
    return this.put(
      `/infra-octopus-openapi/v1/cases/${id}/note/${noteId}`,
      note
    );
  }

  async caseGroupsAll() {
    return this.get('/infra-octopus-openapi/v1/cases/groups/all');
  }

  async caseGroupCreate(params: { name: string }) {
    return this.post('/infra-octopus-openapi/v1/cases/groups', params);
  }

  // --- Inspection ---

  async inspectionReportsSearch(params: {
    pageNo: number;
    pageSize: number;
    keyword?: string;
    taskId?: number;
    taskGroupName?: string;
    result?: string;
    startCreateTime?: number;
    endCreateTime?: number;
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/inspection/reports/search',
      params
    );
  }

  // --- Trace ---

  async traceSpanList(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    limit?: number;
    order?: string;
    scrollId?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/trace/span/list', params);
  }

  async traceAggregate(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    aggregationFields?: { field: string; operation: string }[];
    groupFields?: {
      field: string;
      limit?: number;
      sort?: { field: string; operation: string; order: string };
    }[];
  }) {
    return this.post('/infra-octopus-openapi/v1/trace/aggregate', params);
  }

  // --- Metrics ---

  async metricsTimeseries(params: {
    env: string;
    from: number;
    to: number;
    pointCount?: number;
    queries: { id: string; query: string; dataSource: string }[];
  }) {
    return this.post('/infra-octopus-openapi/v1/metrics/query/timeseries', {
      ...params,
      userUtcHour: 8,
    });
  }

  async metricsQuery(params: {
    env: string;
    to: number;
    queries: { id: string; query: string; dataSource: string }[];
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/metrics/query/queryMetric',
      params
    );
  }

  // --- Services / APM ---

  async servicesList(params: {
    env: string;
    from: number;
    to: number;
    service?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/apm/query/services', params);
  }

  async servicesEntries(params: {
    env: string;
    from: number;
    to: number;
    service: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/apm/query/entries', params);
  }

  async servicesTopology(params: {
    env: string;
    from: number;
    to: number;
    service: string;
    entrySpanName?: string;
    entrySpanOperation?: string;
  }) {
    return this.post('/infra-octopus-openapi/v1/apm/topology/graph', params);
  }

  // --- LLM ---

  async llmList(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    pageSize?: number;
    scrollId?: string;
    scrollType?: string;
    serializedSortValues?: string;
    sort?: {
      field: string;
      operation?: { operationEnum: string };
      order: string;
    };
  }) {
    return this.post('/infra-octopus-openapi/v1/llm/span/list', params);
  }

  // --- RUM ---

  async rumList(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    pageSize?: number;
    scrollId?: string;
    scrollType?: string;
    serializedSortValues?: string;
    sort?: {
      field: string;
      operation?: { operationEnum: string };
      order: string;
    };
  }) {
    return this.post('/infra-octopus-openapi/v1/rum/list', params);
  }

  async rumDetail(id: string) {
    return this.get(`/infra-octopus-openapi/v1/rum/${id}`);
  }

  async rumAggregate(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    aggregationField?: { field: string; operation: string }[];
    groupFieldList?: {
      field: string;
      limit?: number;
      sort?: { field: string; operation: string; order: string };
    }[];
  }) {
    return this.post('/infra-octopus-openapi/v1/rum/aggregate', params);
  }

  // --- Events ---

  async eventList(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    pageSize?: number;
    scrollId?: string;
    scrollType?: string;
    serializedSortValues?: string;
    sort?: {
      field: string;
      operation?: { operationEnum: string };
      order: string;
    };
  }) {
    return this.post('/infra-octopus-openapi/v1/event/list', params);
  }

  async eventAggregate(params: {
    env: string;
    from: number;
    to: number;
    query?: string;
    aggregationField?: { field: string; operation: string }[];
    groupFieldList?: {
      field: string;
      limit?: number;
      sort?: { field: string; operation: string; order: string };
    }[];
  }) {
    return this.post('/infra-octopus-openapi/v1/event/aggregate', params);
  }

  // --- Event subscriptions ---

  async eventSubscriptionsList(params: EventSubscriptionSearchParams) {
    return this.post<PageData<EventSubscriptionListItem>>(
      '/infra-octopus-openapi/v1/event/subscriptions/search',
      params
    );
  }

  async eventSubscriptionDetail(id: number) {
    return this.get<EventSubscriptionDetail>(
      `/infra-octopus-openapi/v1/event/subscriptions/${id}`
    );
  }

  async eventSubscriptionCreate(params: EventSubscriptionCreateParams) {
    return this.post<EventSubscriptionDetail>(
      '/infra-octopus-openapi/v1/event/subscriptions',
      params
    );
  }

  async eventSubscriptionUpdate(
    id: number,
    params: EventSubscriptionUpdateParams
  ) {
    return this.put<EventSubscriptionDetail>(
      `/infra-octopus-openapi/v1/event/subscriptions/${id}`,
      params
    );
  }

  async eventSubscriptionUpdateStatus(
    id: number,
    status: EventSubscriptionStatus
  ) {
    return this.put<EventSubscriptionDetail>(
      `/infra-octopus-openapi/v1/event/subscriptions/${id}/status`,
      { status }
    );
  }

  async eventSubscriptionDelete(id: number) {
    return this.del<void>(
      `/infra-octopus-openapi/v1/event/subscriptions/${id}`
    );
  }

  // --- Event webhooks ---

  async eventWebhooksList(params: EventWebhookSearchParams) {
    return this.post<PageData<EventWebhookListItem>>(
      '/infra-octopus-openapi/v1/event/webhooks/search',
      params
    );
  }

  async eventWebhookDetail(id: number) {
    return this.get<EventWebhookDetail>(
      `/infra-octopus-openapi/v1/event/webhooks/${id}`
    );
  }

  async eventWebhookCreate(params: EventWebhookParams) {
    return this.post<EventWebhookDetail>(
      '/infra-octopus-openapi/v1/event/webhooks',
      params
    );
  }

  async eventWebhookUpdate(id: number, params: EventWebhookParams) {
    return this.put<EventWebhookDetail>(
      `/infra-octopus-openapi/v1/event/webhooks/${id}`,
      params
    );
  }

  async eventWebhookTest(params: EventWebhookParams) {
    return this.post<EventWebhookTestResult>(
      '/infra-octopus-openapi/v1/event/webhooks/test',
      params
    );
  }

  async eventWebhookDelete(id: number) {
    return this.del<void>(`/infra-octopus-openapi/v1/event/webhooks/${id}`);
  }

  // --- Dashboard ---

  async dashboardCreate(data: unknown) {
    return this.post('/infra-octopus-openapi/v1/dashboards', data);
  }

  async dashboardDetail(dashboardId: number) {
    const id = parsePositiveInteger(dashboardId, 'dashboardId');
    return this.get<Record<string, unknown>>(
      `/infra-octopus-openapi/v1/dashboards/${id}`
    );
  }

  async dashboardUpdate(dashboardId: number, data: unknown) {
    const id = parsePositiveInteger(dashboardId, 'dashboardId');
    if (!isRecord(data) || Object.keys(data).length === 0) {
      throw new Error(
        'dashboard must be a non-empty complete dashboard configuration'
      );
    }
    // Forward the complete configuration, including nested nulls, without merging defaults.
    return this.put(`/infra-octopus-openapi/v1/dashboards/${id}`, data);
  }

  // --- Users ---

  async usersSearch(names: string[]) {
    return this.post('/infra-octopus-openapi/v1/users/search', {
      names,
    });
  }
}
