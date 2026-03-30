---
name: octopus-openapi
description: Octopus OpenAPI 接口指南。涵盖 ApplicationKey 与 V1/V2（OC-HMAC-SHA256 / OC-HMAC-SHA256-2）鉴权、Python/Java SDK、日志/Trace/指标（含 V2.0）/错误追踪/告警/服务 APM/大盘/用户/LLM/RUM/事件等 HTTP 接口与限流说明。用于对接 Octopus 可观测数据开放 API。
version: 1.1.0
tags:
  - octopus
  - openapi
  - api
  - integration
  - observability
---

<!-- source: Notion「Octopus 用户文档 → OpenAPI」及子页面，synced 2026-03-25 -->

# Octopus OpenAPI 接口指南

## 文档结构（与 Notion 目录一致）

| 主题 | 说明 |
|------|------|
| 概述 | OpenAPI 是对外数据获取能力；接口持续迭代，可按业务提需求 |
| [鉴权](#一鉴权) | ApplicationKey、V2/V1 签名 |
| [集成 SDK](#二集成-sdk) | Python 包、Java 签名参考 |
| [日志](#三日志查询相关接口) | search / aggregate |
| [Trace](#四trace-查询相关接口) | span list / aggregate |
| [指标](#五指标查询相关接口) | timeseries / queryMetric，及 [V2.0](#指标接口-v20) |
| [错误追踪](#六错误追踪相关接口) | Issue 查询、详情、分布、分配、状态与 `ignoreRule` |
| [告警](#七告警查询相关接口) | 告警查询、规则 CRUD、静默 |
| [服务 APM](#八服务查询相关接口) | 入口/上下游/拓扑/时序等 |
| [大盘](#九大盘相关接口) | 创建 / 更新 / 删除大盘 |
| [用户](#十用户查询相关接口) | 用户列表 |
| [LLM](#十一llm-查询相关接口) | LLM span 列表 |
| [RUM](#十二rum-查询相关接口) | 列表 / 详情 / 聚合 |
| [事件](#十三事件查询相关接口) | Event 列表 |

**API 根路径约定**：下文接口路径均以 `https://<host>/infra-octopus-openapi/v1` 为前缀。常见 host 为 `octopus-app.zhenguanyu.com`（与官方 SDK 示例一致）；部分文档链接使用 `octopus.zhenguanyu.com`，部署环境以前者为准或按运维说明切换。

---

## 一、鉴权

OpenAPI 使用 **ApplicationKey + 请求签名** 鉴权，保证请求可信且未被篡改。须在 Octopus 平台创建 ApplicationKey。

### 1.1 ApplicationKey 字段

| 字段 | 说明 |
|------|------|
| `tenantId` | 租户标识 |
| `appId` | 应用唯一标识；**限流按 appId** |
| `appSecret` | 私钥，用于 HMAC 签名；泄露须立即停用 Key |
| `name` | 应用名称，便于日志与监控可读；可重复 |

当前无角色/权限模型，每个 Key 可访问全部 OpenAPI；后续可能绑定角色或权限。

### 1.2 服务端校验说明（背景）

签名在 **OpenApiAuthFilter** 中校验。因需读取 body 且不影响后续解析，通过 `RequestReaderHttpServletRequestWrapper` 缓存 body。

### 1.3 签名方法 V2（推荐）

适用于 **POST / PUT / DELETE** 等需将 **request body** 纳入签名的场景。

**请求头（公共）**

| Header | 说明 |
|--------|------|
| `Content-Type` | 必填；须与实际发送 body 完全一致（注意 charset 等，否则验签失败） |
| `Authorization` | 见下 |

`Authorization` 示例格式：

```http
OC-HMAC-SHA256 Credential={appId}/, Timestamp={unix秒}, SignedHeaders=content-type, Signature={Base64(HMAC)}
```

- **Credential**：`{appId}/` + scope（当前 scope 为空串）
- **Timestamp**：Unix 秒；与服务器时间相差超过约 **5 分钟** 会失败
- **SignedHeaders**：参与签名的 header 名，小写，分号分隔，须含 `content-type`
- **Signature**：见下

**规范请求串 CanonicalRequest**

```
CanonicalRequest =
  HTTPMethod + "\n" +
  CanonicalURI + "\n" +
  CanonicalQueryString + "\n" +
  CanonicalHeaders + "\n" +
  SignedHeaders + "\n" +
  HashedRequestPayload
```

- `CanonicalQueryString`：参数按 key 排序；同名参数再按 value 排序；`key=value` 用 `&` 连接
- `CanonicalHeaders`：参与签名的 header：`key:value\n`，key/value 小写、去空格；多个 header 按 key 的 ASCII 升序
- `SignedHeaders`：参与签名的 header 名，小写，ASCII 升序，`;` 连接
- `HashedRequestPayload`：对 body 做 SHA256 后 **十六进制小写**；GET 或无 body 时为对空字节的哈希

**StringToSign**

```
StringToSign =
  Algorithm + "\n" +
  Timestamp + "\n" +
  CredentialScope + "\n" +
  HashedCanonicalRequest
```

- `Algorithm`：与 `Authorization` 中一致；SDK V2 使用 **`OC-HMAC-SHA256-2`**
- `CredentialScope`：当前为 **空串**
- `HashedCanonicalRequest`：对 **整个 CanonicalRequest 字符串** 做 SHA256 的 **十六进制小写**

**签名**

```
Signature = Base64( HMAC_SHA256(appSecret, StringToSign) )
```

### 1.4 签名方法 V1

仅适用于 **GET**（不把 body 纳入签名）。CanonicalRequest **不含** `HashedRequestPayload` 行，其余与 V2 思路一致。若签名泄露，攻击者可能复用签名提交其它 body，故 **V1 仅用于 GET**。

### 1.5 POST 与 multipart

当前 OpenAPI 以 **JSON body** 为主，使用 **V2** 即可。multipart 等大文件场景需单独约定是否对 part 哈希等（见原文档说明）。

---

## 二、集成 SDK

三步：**申请 ApplicationKey → 引入 SDK → 调用接口**。

### 2.1 Python

- PyPI：[octopus-openapi-util](https://pypi.org/project/octopus-openapi-util/0.0.1/)
- 安装：`pip install octopus-openapi-util==0.0.1`
- 使用 `octopus_openapi_util.authorization.build_authorization_header_v2` 生成 `Authorization`，与文档示例 path、header 一致

示例（日志 search，请将 host 换为你的环境）：

```python
import json
import time
from octopus_openapi_util import authorization as auth
import requests

APP_ID = "YOUR_APP_ID"
APP_SECRET = "YOUR_APP_SECRET"

def search_log(query, from_time, to_time):
    url = "https://octopus-app.zhenguanyu.com/infra-octopus-openapi/v1/logs/search"
    timestamp_in_second = str(int(time.time()))
    payload = json.dumps({
        "env": "online",
        "from": from_time,
        "to": to_time,
        "order": "asc",
        "query": query,
    })
    authorization = auth.build_authorization_header_v2(
        APP_ID, APP_SECRET, "POST",
        "/infra-octopus-openapi/v1/logs/search",
        "", payload,
        {"content-type": "application/json"},
        timestamp_in_second,
    )
    headers = {
        "content-type": "application/json",
        "authorization": authorization,
    }
    return requests.post(url, headers=headers, data=payload).json()
```

### 2.2 Java

或者可以自己实现生成 `AuthorizationHeader` 的逻辑。下面先给出 **`AuthorizationHeader`**（封装算法、凭证、时间戳、参与签名的 header 名与签名；**`toString()`** 即为请求里的 `Authorization` 头字符串；**`parse`** 用于从已有头解析，常见于服务端验签或联调）。再给出 **`OctopusOpenapiClient`** 签名计算。需 Lombok、`StringUtils`（Apache Commons Lang）等与团队工程一致。

```java
@Data
public class AuthorizationHeader {
    private static final String CREDENTIAL_PREFIX = "Credential=";
    private static final String TIMESTAMP_PREFIX = "Timestamp=";
    private static final String SIGNED_HEADERS_PREFIX = "SignedHeaders=";
    private static final String SIGNATURE_PREFIX = "Signature=";
    private static final String CREDENTIAL_SEPARATOR = "/";

    private String algorithm;
    private String appId;
    private String scope = "";   // 没用，占位

    private long timestampInSecond;
    private List<String> signedHeaders;
    private String signature;

    @Override
    public String toString() {
        return new StringBuilder()
                .append(algorithm).append(" ")
                .append(CREDENTIAL_PREFIX).append(appId).append(CREDENTIAL_SEPARATOR).append(scope).append(", ")
                .append(TIMESTAMP_PREFIX).append(timestampInSecond).append(", ")
                .append(SIGNED_HEADERS_PREFIX).append(StringUtils.join(signedHeaders, ";")).append(", ")
                .append(SIGNATURE_PREFIX).append(signature)
                .toString();
    }

    public static AuthorizationHeader parse(String header) {
        String[] splits = header.split(" ");
        if (splits.length != 5) {
            return null;
        }
        AuthorizationHeader authorizationHeader = new AuthorizationHeader();
        // 读取ALGORITHM
        if (StringUtils.isBlank(splits[0])) {
            return null;
        }
        authorizationHeader.setAlgorithm(splits[0]);

        // 读取Credential
        if (!splits[1].endsWith(",") || !splits[1].startsWith(CREDENTIAL_PREFIX) || !splits[1].contains(CREDENTIAL_SEPARATOR)) {
            return null;
        }
        String credential = splits[1].substring(CREDENTIAL_PREFIX.length(), splits[1].length() - 1);
        authorizationHeader.setAppId(credential.substring(0, credential.indexOf(CREDENTIAL_SEPARATOR)));

        // 读取Timestamp
        if (!splits[2].endsWith(",") || !splits[2].startsWith(TIMESTAMP_PREFIX)) {
            return null;
        }
        authorizationHeader.setTimestampInSecond(Long.parseLong(splits[2].substring(TIMESTAMP_PREFIX.length(), splits[2].length() - 1)));

        // 读取SignedHeaders
        if (!splits[3].endsWith(",") || !splits[3].startsWith(SIGNED_HEADERS_PREFIX)) {
            return null;
        }
        String signedHeaders = splits[3].substring(SIGNED_HEADERS_PREFIX.length(), splits[3].length() - 1);
        authorizationHeader.setSignedHeaders(Arrays.asList(signedHeaders.split(";")));

        // 读取Signature
        if (!splits[4].startsWith(SIGNATURE_PREFIX)) {
            return null;
        }
        authorizationHeader.setSignature(splits[4].substring(SIGNATURE_PREFIX.length()));

        return authorizationHeader;
    }
}

public class OctopusOpenapiClient {

    private static final String ALGORITHM = "OC-HMAC-SHA256";

    private static final String ALGORITHM_V2 = "OC-HMAC-SHA256-2";

    public static AuthorizationHeader buildAuthorizationHeader(String appId, String appSecret, String httpMethod, String path, String queryString, Map<String, String> signedHeaders, long timestampInSecond) {
        return buildHeader(appId, appSecret, httpMethod, path, queryString, null, signedHeaders, timestampInSecond, ALGORITHM);
    }

    public static AuthorizationHeader buildAuthorizationHeaderV2(String appId, String appSecret, String httpMethod, String path, String queryString, byte[] requestPayload, Map<String, String> signedHeaders, long timestampInSecond) {
        return buildHeader(appId, appSecret, httpMethod, path, queryString, requestPayload, signedHeaders, timestampInSecond, ALGORITHM_V2);
    }

    private static AuthorizationHeader buildHeader(String appId, String appSecret, String httpMethod, String path, String queryString,
                                            byte[] requestPayload, Map<String, String> signedHeaders, long timestampInSecond, String algorithm) {
        Map<String, String> headersWithLowercaseName = signedHeaders.entrySet()
                .stream()
                .collect(Collectors.toMap(e -> e.getKey().toLowerCase(), Map.Entry::getValue));
        AuthorizationHeader authorizationHeader = new AuthorizationHeader();
        authorizationHeader.setAlgorithm(algorithm);
        authorizationHeader.setAppId(appId);
        authorizationHeader.setTimestampInSecond(timestampInSecond);
        authorizationHeader.setSignedHeaders(headersWithLowercaseName.keySet().stream().sorted().collect(Collectors.toList()));
        authorizationHeader.setSignature(buildSignature(buildCanonicalSignString(httpMethod, path, queryString, requestPayload, headersWithLowercaseName, authorizationHeader), appSecret));
        return authorizationHeader;
    }

    private static String buildSignature(String canonicalSignString, String appSecret) {
        return Base64.encode(hmac256(appSecret.getBytes(StandardCharsets.UTF_8), canonicalSignString));
    }

    private static String buildCanonicalSignString(String httpMethod, String path, String queryString, byte[] requestPayload,
                                                   Map<String, String> headersWithLowercaseName, AuthorizationHeader authorizationHeader) {
        String canonicalRequest = httpMethod.toUpperCase() + '\n'
                + path + '\n'
                + buildCanonicalQueryString(queryString) + '\n'
                + getCanonicalHeaders(headersWithLowercaseName, authorizationHeader.getSignedHeaders()) + '\n'
                + getSignedHeaders(authorizationHeader.getSignedHeaders());
        if (ALGORITHM_V2.equals(authorizationHeader.getAlgorithm())) {
            canonicalRequest += '\n' + sha256Hex(requestPayload);
        }
        return authorizationHeader.getAlgorithm() + '\n'
                + authorizationHeader.getTimestampInSecond() + '\n'
                + authorizationHeader.getScope() + '\n'
                + sha256Hex(canonicalRequest);
    }

    private static String buildCanonicalQueryString(String queryString) {
        if (StringUtils.isEmpty(queryString)) {
            return "";
        }
        if (!queryString.startsWith("?")) {
            queryString = "?" + queryString;
        }
        MultiValueMap<String, String> parameters =
                UriComponentsBuilder.fromUriString(queryString).build().getQueryParams();
        List<Pair<String, String>> params = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : parameters.entrySet()) {
            for (String value : entry.getValue()) {
                params.add(Pair.of(entry.getKey(), value));
            }
        }
        params.sort(Comparator.comparing(Pair<String, String>::getLeft).thenComparing(Pair::getRight));
        return StringUtils
                .join(params.stream().map(p -> p.getLeft() + "=" + p.getRight()).collect(Collectors.toList()), "&");
    }

    private static String getCanonicalHeaders(Map<String, String> headersWithLowercaseName,
                                              Collection<String> signedHeaders) {
        List<Pair<String, String>> signedHeaderList = new ArrayList<>();
        for (String header : signedHeaders) {
            signedHeaderList.add(Pair
                    .of(header.toLowerCase(), headersWithLowercaseName.getOrDefault(header.toLowerCase(), "")));
        }
        signedHeaderList.sort(Comparator.comparing(Pair<String, String>::getLeft));
        StringBuilder ans = new StringBuilder();
        for (Pair<String, String> header : signedHeaderList) {
            ans.append(header.getLeft());
            ans.append(':');
            ans.append(header.getRight());
            ans.append('\n');
        }
        return ans.toString();
    }

    private static String getSignedHeaders(Collection<String> signedHeaders) {
        return signedHeaders.stream().map(String::toLowerCase).sorted().collect(Collectors.joining(";"));
    }

    private static String sha256Hex(String s) {
        s = s == null ? "" : s;
        return sha256Hex(s.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(byte[] bytes) {
        bytes = bytes == null ? new byte[0] : bytes;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(bytes);
            return DatatypeConverter.printHexBinary(d).toLowerCase();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static byte[] hmac256(byte[] key, String msg) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(key, mac.getAlgorithm());
            mac.init(secretKeySpec);
            return mac.doFinal(msg.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalArgumentException(e);
        }
    }
}
```

---

## 三、日志查询相关接口

**限流（search / aggregate）**：单 AppId **每 10 秒最多 50 次**。

### 3.1 日志列表 `POST /infra-octopus-openapi/v1/logs/search`

主要参数：`env`、`from`、`to`（毫秒）、`query`、`order`（asc/desc）、`limit`（单次上限 500）、`scrollId`、`serializedSortValues`（与 scrollId 配合翻页）。

响应 `data.logs` 中含 `serializedSortValues` 等；`code === 0` 表示成功。

### 3.2 日志聚合 `POST /infra-octopus-openapi/v1/logs/aggregate`

**维度限制**：聚合维度不超过 1000；单 `groupField` 的 limit ≤1000；多 `groupField` 时各 limit **乘积** ≤1000。

`aggregationFields`：`field`、`operation`（count、count_distinct、sum、avg、max、min、pxx 等）。

---

## 四、Trace 查询相关接口

**限流**：单 AppId 每 10 秒最多 **50** 次（list / aggregate）。

### 4.1 Span 列表 `POST /infra-octopus-openapi/v1/trace/span/list`

参数含 `env`、`from`、`to`（ms）、`limit`（最大 500）、`order`、`query`、`scrollId`。

响应 `data.spanItems`：`id`、`traceId`、`spanId`、`service`、`name`、`operation`、`duration`、`status` 等。

### 4.2 Span 聚合 `POST /infra-octopus-openapi/v1/trace/aggregate`

与日志聚合类似的 `aggregationFields` / `groupFields` 及维度上限说明。

---

## 五、指标查询相关接口

**限流**：单 AppId 每 10 秒最多 **200** 次。

### 5.1 指标时序 `POST /infra-octopus-openapi/v1/metrics/query/timeseries`

- `from` / `to`：毫秒
- `pointCount`：推荐 **150**，最大 **500**
- `queries[]`：`id`（`dataSource=metric` 时建议单个大写字母 A–Z）、`query`、`dataSource`（`metric` | `formula`）
- 表达式查询示例：`formula-1` 对应 `query: "A + B"`

响应 `data[]`：`id`、`labelList`、`times`、`values`。

### 5.2 指标点查 `POST /infra-octopus-openapi/v1/metrics/query/queryMetric`

在单个时间点取值，以 `to` 为查询时刻；参数语义与 timeseries 类似（无 `from` / `pointCount` 的用法以实际请求为准）。

### 指标接口 V2.0

在 V1 反馈基础上的优化（子页面「指标接口V2.0」）：

- **timeseries / queryMetric**：查询项使用 **`name`** 替代易混淆的 `id`；可指定 **`needResult`**，表达式中部分子查询可不返回结果。
- 仅 **一条** metric 查询时，可不传 name，接口默认 **`A`**。
- 返回 `data` 为 **对象**；`labelList` 由 list 调整为 **map**，便于反序列化。

具体路径以线上 OpenAPI 发布说明为准（若已提供 `/v2/metrics/...` 等，请对齐网关路由）。

---

## 六、错误追踪相关接口

**限流**：多数接口单 AppId 每 10 秒 **50** 次。

### 6.1 Issue 搜索 `POST /infra-octopus-openapi/v1/log-error-tracking/issues/search`

参数：`env`、`from`、`to`、`query`、`sortType`（`logCount` | `firstSeen`）、`status`（`unresolved` | `resolved` | `ignored` | `all`）；`service` 可选（拟废弃）。

### 6.2 Issue 详情 `GET /infra-octopus-openapi/v1/log-error-tracking/issues/{issueId}`

### 6.3 多 Issue 分布 `POST .../issues/multi-distribution`

请求为 **数组**；每项含 `issueIds`、`env`、`from`、`to`、`interval`、`query`、`dataSource`（log/rum）等。

### 6.4 批量分配 `POST .../issues/batch-assign`

`assigneeId`、`dataSource`、`issueIds`。

### 6.5 批量更新状态 `PUT .../issues/batch-update`

`issueIds`、`status`、`env`、`dataSource`；将状态置为 **ignored** 时需传 `ignoreRule`（`type`：time / appearCount / userCount 等及子结构），见官方子文档示例。

---

## 七、告警查询相关接口

**限流**：单 AppId 每 10 秒 **50** 次（除非另有说明）。

### 7.1 告警查询 `POST /infra-octopus-openapi/v1/alerts/search`

参数示例：`env`、`from`、`to`、`limit`、`pageNo`、`priorities`（UNKNOWN/P0/P1/P2）、`query`、`status`（all/firing/resolved）、`services`、`alertRuleType`。

### 7.2 告警规则搜索 `POST /infra-octopus-openapi/v1/alert/rules/search`

含 `groupId`、`pageParam`、`statusList`（enabled/disabled/paused/silenced）、`searchInput`、`types`、`tags`、`creator` 等。

### 7.3 创建告警规则 `POST /infra-octopus-openapi/v1/alert/rules`

Body 为规则 **数组**；字段含 `name`、`env`、`priority`、`ruleType`（log/metric/issue）、`conditions`、`conditionEvaluationType`（single/and/or）、`notice`、`groupId`、`tags`、`active` 等（结构复杂，以 Notion 长 JSON 为准）。

### 7.4 删除告警规则 `DELETE /infra-octopus-openapi/v1/alert/rules`

请求体含待删 **`ruleId`**（以线上实际为准：亦有文档写作 `ruleIds` 列表，集成时请对照 Swagger）。

### 7.5 告警静默 `POST /infra-octopus-openapi/v1/alerts/silences/create`

`ruleId`、`alertId`、`startTime`、`endTime`、`scope`（如 ALL / SPECIFY）、`specifyGroups`、`silentlyNotify`。

### 7.6 删除静默 `DELETE /infra-octopus-openapi/v1/alerts/silences/{ruleId}`

---

## 八、服务查询相关接口

**限流**：单 AppId 每 10 秒 **50** 次。

| 接口 | 方法 | 路径 |
|------|------|------|
| 入口列表 | POST | `/infra-octopus-openapi/v1/apm/query/entries` |
| 上游服务 | POST | `/infra-octopus-openapi/v1/apm/query/upstream/services` |
| 下游入口 | POST | `/infra-octopus-openapi/v1/apm/query/downstream/entries` |
| 拓扑图 | POST | `/infra-octopus-openapi/v1/apm/topology/graph` |
| 节点时序 | POST | `/infra-octopus-openapi/v1/apm/topology/node-stat` |
| 边时序 | POST | `/infra-octopus-openapi/v1/apm/topology/edge-stat` |
| 服务列表 | POST | `/infra-octopus-openapi/v1/apm/query/services` |

公共字段常含 `env`、`from`、`to`、`service`；拓扑/时序另含 `entrySpanName`、`entrySpanOperation`、`interval`（ms，最多约 1000 点）、`nodeService` 或 `sourceService`/`targetService`。

拓扑响应含 `edges`（`sourceService` → `targetService`）、`upstreamServices`、`downstreamServices`、`isDegraded` 等。

---

## 九、大盘相关接口

- **创建** `POST /infra-octopus-openapi/v1/dashboards`：Body 含 `parent`（**目录 id，必填**）、`title`、`variableList`、`widgetList` 等；结构复杂，建议从页面已有大盘导出 JSON 再改。可参考浏览器控制台拉取 `infra-octopus-rest` 下大盘详情接口中的 `data` 字段（见 Notion 原文）。
- **更新** `PUT /infra-octopus-openapi/v1/dashboards/{id}`：**全量覆盖**。
- **删除** `DELETE /infra-octopus-openapi/v1/dashboards/{id}`：当前仅可删 **同一 APP_ID 创建** 的大盘。

业务与数据结构可能迭代，以最新文档为准。

---

## 十、用户查询相关接口

### 用户列表 `POST /infra-octopus-openapi/v1/users/search`

请求体示例：`{ "name": [] }`（用户名称列表）。响应含用户 `id`、`name` 等。

---

## 十一、LLM 查询相关接口

### LLM 列表 `POST /infra-octopus-openapi/v1/llm/span/list`

参数含 `env`、`from`、`to`、`pageSize`、`query`、`scrollId`、`scrollType`（pre/next）、`serializedSortValues`、`sort` 等。

响应 `spanItems[]` 中 `llm` 含 model、measure（token、cost 等）、session、application 等嵌套字段。

---

## 十二、RUM 查询相关接口

| 接口 | 方法 | 路径 |
|------|------|------|
| RUM 列表 | POST | `/infra-octopus-openapi/v1/rum/list` |
| RUM 详情 | GET | `/infra-octopus-openapi/v1/rum/{id}` |
| RUM 聚合 | POST | `/infra-octopus-openapi/v1/rum/aggregate` |

列表参数与 LLM/事件类似，含 `targetId`、排序与翻页字段；聚合使用 `aggregationField`、`groupFieldList`。

---

## 十三、事件查询相关接口

### Event 列表 `POST /infra-octopus-openapi/v1/event/list`

请求字段与 RUM 列表相近；响应 `eventItems` 含 `eventId`、`title`、`type`、`impactedService`、`timestamp` 等。

---

## 通用说明

- 多数接口响应形如 `{ "code": 0, "data": ..., "message": "..." }`，**code 为 0 表示成功**。
- **env**：如 `online` / `test`，与 Octopus 环境配置一致。
- 时间与翻页字段以各接口官方子文档与线上一致为准；文档中部分超链误指向 `/v2/logs/search`，**路径以正文路径 / 本文 `/v1` 为准**。
