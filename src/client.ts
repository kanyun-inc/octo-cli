import { generateAuthorizationHeader } from './auth.js';

interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

export class OctoClient {
  constructor(
    private baseUrl: string,
    private appId: string,
    private appSecret: string
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    apiPath: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${apiPath}`;
    const payload = body ? JSON.stringify(body) : '';

    const authorization = generateAuthorizationHeader(
      this.appId,
      this.appSecret,
      method,
      apiPath,
      '',
      payload
    );

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
      },
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
    status?: string;
    priorities?: string[];
    query?: string;
    services?: string[];
    limit?: number;
    pageNo?: number;
    groupId?: number;
    ruleIds?: number[];
  }) {
    return this.post('/infra-octopus-openapi/v1/alerts/search', params);
  }

  async alertRulesSearch(params: {
    groupId: number;
    env?: string;
    priority?: string;
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

  async alertRulesCreate(rules: unknown[]) {
    return this.post('/infra-octopus-openapi/v1/alert/rules', rules);
  }

  async alertRulesDelete(ruleId: number) {
    return this.del('/infra-octopus-openapi/v1/alert/rules', ruleId);
  }

  async alertSilenceCreate(params: {
    ruleId: number;
    alertId: number;
    startTime: number;
    endTime: number;
    scope: string;
    specifyGroups?: Record<string, string[]>;
    silentlyNotify: boolean;
  }) {
    return this.post(
      '/infra-octopus-openapi/v1/alerts/silences/create',
      params
    );
  }

  async alertSilenceDelete(ruleId: number) {
    return this.del(`/infra-octopus-openapi/v1/alerts/silences/${ruleId}`);
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

  // --- Dashboard ---

  async dashboardCreate(data: unknown) {
    return this.post('/infra-octopus-openapi/v1/dashboards', data);
  }

  async dashboardUpdate(id: number, data: unknown) {
    return this.put(`/infra-octopus-openapi/v1/dashboards/${id}`, data);
  }

  async dashboardDelete(id: number) {
    return this.del(`/infra-octopus-openapi/v1/dashboards/${id}`);
  }

  // --- Users ---

  async usersSearch(names: string[]) {
    return this.post('/infra-octopus-openapi/v1/users/search', {
      name: names,
    });
  }
}
