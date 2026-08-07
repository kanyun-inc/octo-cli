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

  async alertRulesCreate(rules: unknown[]) {
    return this.post('/infra-octopus-openapi/v1/alert/rules', rules);
  }

  async alertRulesDelete(ruleId: number) {
    return this.del('/infra-octopus-openapi/v1/alert/rules', ruleId);
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
    assigneeId: number;
    dataSource: string;
    issueIds: string[];
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/log-error-tracking/issues/batch-assign',
      params
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
    return this.post(
      '/infra-octopus-openapi/v1/metrics/query/timeseries',
      params
    );
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

  // --- Dashboard ---

  async dashboardCreate(data: unknown) {
    return this.post('/infra-octopus-openapi/v1/dashboards', data);
  }

  async dashboardUpdate(id: number, data: unknown) {
    return this.put(`/infra-octopus-openapi/v1/dashboards/${id}`, data);
  }

  // --- Users ---

  async usersSearch(names: string[]) {
    return this.post('/infra-octopus-openapi/v1/users/search', {
      names,
    });
  }
}
