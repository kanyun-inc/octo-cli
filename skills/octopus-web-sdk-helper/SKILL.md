---
name: octopus-web-sdk-helper
description: 帮助用户了解和使用 octopus-web-sdk 前端监控 SDK 和 octopus-cli 命令行工具。答疑、配置指导、问题排查。触发："octopus sdk"、"前端监控"、"RUM"、"日志上报"、"octopus-cli"、"sourcemap 上传"
user-invocable: true
allowed-tools: Bash(curl:*)
---

# Octopus Web SDK 助手

帮助用户了解和使用 octopus-web-sdk 前端监控 SDK 和 octopus-cli 命令行工具，包括概念解释、配置指导、API 使用和问题排查。

## GitLab 仓库访问

使用 GitLab API 读取源代码：

```bash
# octopus-web-sdk 仓库
curl -s --header "PRIVATE-TOKEN: C8MZy9zhQUvdY1-yCTUF" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-sdk/repository/files/{URL编码的文件路径}/raw?ref=master"

# octopus-cli 仓库
curl -s --header "PRIVATE-TOKEN: Tg7YJ1xPkxQb3HiEHCSc" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-cli/repository/files/{URL编码的文件路径}/raw?ref=main"

# 获取目录列表（octopus-web-sdk）
curl -s --header "PRIVATE-TOKEN: C8MZy9zhQUvdY1-yCTUF" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-sdk/repository/tree?path={目录路径}&ref=master"

# 获取目录列表（octopus-cli）
curl -s --header "PRIVATE-TOKEN: Tg7YJ1xPkxQb3HiEHCSc" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-cli/repository/tree?path={目录路径}&ref=main"

# 搜索代码（octopus-web-sdk）
curl -s --header "PRIVATE-TOKEN: C8MZy9zhQUvdY1-yCTUF" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-sdk/search?scope=blobs&search={关键词}"

# 搜索代码（octopus-cli）
curl -s --header "PRIVATE-TOKEN: Tg7YJ1xPkxQb3HiEHCSc" \
  "https://gitlab-ee.zhenguanyu.com/api/v4/projects/octopus-web%2Foctopus-web-cli/search?scope=blobs&search={关键词}"
```

**注意**：文件路径需要 URL 编码，如 `packages/browser-rum/src/main.ts` → `packages%2Fbrowser-rum%2Fsrc%2Fmain.ts`

## SDK 概览

octopus-web-sdk 是前端监控工具集，包含以下核心包：

| 包名                      | 功能                         | 全局变量/命令             |
| ------------------------- | ---------------------------- | ------------------------- |
| @octopus-sdk/browser-core | 核心库：配置、传输、错误处理 | -                         |
| @octopus-sdk/browser-rum  | RUM 性能监控                 | `OC_RUM` / `octopusRum`   |
| @octopus-sdk/browser-logs | 日志收集                     | `OC_LOGS` / `octopusLogs` |
| @octopus-sdk/octopus-cli  | 命令行工具                   | `octopus-cli`             |

## 代码结构地图

根据问题类型，查找对应文件：

### octopus-web-sdk

| 问题类型      | 查找路径                                                          |
| ------------- | ----------------------------------------------------------------- |
| RUM 配置项    | `packages/browser-rum/src/domain/configuration/configuration.ts`  |
| Logs 配置项   | `packages/browser-logs/src/domain/configuration/configuration.ts` |
| 核心配置项    | `packages/browser-core/src/domain/configuration/configuration.ts` |
| RUM 公开 API  | `packages/browser-rum/src/boot/rumPublicApi.ts`                   |
| Logs 公开 API | `packages/browser-logs/src/boot/logsPublicApi.ts`                 |
| Logger 类     | `packages/browser-logs/src/domain/logger.ts`                      |
| 数据传输      | `packages/browser-core/src/transport/`                            |
| 错误追踪      | `packages/browser-core/src/domain/error/`                         |

### octopus-cli

| 问题类型       | 查找路径                            |
| -------------- | ----------------------------------- |
| CLI 入口       | `src/cli.ts`                        |
| Sourcemap 上传 | `src/commands/sourcemaps/upload.ts` |
| 事件上报       | `src/commands/event/event.ts`       |
| 日志上报       | `src/commands/log/log.ts`           |
| 认证相关       | `src/helpers/auth.ts`               |
| 请求处理       | `src/helpers/request.ts`            |
| 并发控制       | `src/helpers/concurrency.ts`        |

## 核心配置项速查

### 通用配置 (InitConfiguration)

| 配置项            | 类型     | 必填     | 说明                                                         |
| ----------------- | -------- | -------- | ------------------------------------------------------------ |
| clientToken       | string   | ✅       | 认证令牌                                                     |
| service           | string   | ✅       | 服务名称                                                     |
| env               | string   | ✅       | 环境标识，仅支持 `online`、`test`                            |
| site              | string   | ✅ (RUM) | Octopus 接入点域名，见下方接入点列表；**octopusLogs 不需要** |
| version           | string   | -        | 应用版本                                                     |
| sessionSampleRate | number   | -        | 采样率 0-100，默认 100                                       |
| beforeSend        | function | -        | 发送前回调，可修改或过滤事件                                 |

### RUM 专属配置 (RumInitConfiguration)

| 配置项                | 类型    | 必填 | 说明                     |
| --------------------- | ------- | ---- | ------------------------ |
| applicationId         | string  | ✅   | 应用 ID                  |
| trackViewsManually    | boolean | -    | 手动追踪视图，默认 false |
| trackUserInteractions | boolean | -    | 追踪用户交互             |
| trackResources        | boolean | -    | 追踪资源加载             |
| allowedTracingUrls    | array   | -    | 允许追踪的 URL 列表      |

### 接入点域名 (site)

Octopus 在国内外有多个接入点，接入时请选择离你最近的接入点：

| 接入点 | 域名                             | 位置   |
| ------ | -------------------------------- | ------ |
| CN     | octopus-ingest-cn.zhenguanyu.com | 北京   |
| SG     | ingest-sg.octopusgateway.com     | 新加坡 |
| US     | ingest-us.octopusgateway.com     | 美东   |

**❗️ 国外的业务请先确认是否有合规要求，谨慎选择国内接入点，首选 SG ❗️**

## RUM API 速查

```typescript
// 初始化
import { octopusRum } from "@octopus-sdk/browser-rum";

octopusRum.init({
  applicationId: "<OCTOPUS_APPLICATION_ID>",
  clientToken: "<OCTOPUS_CLIENT_TOKEN>",
  site: "octopus-ingest-cn.zhenguanyu.com", // 接入点见上方列表，国内北京
  service: "<SERVICE_NAME>",
  version: "<SERVICE_VERSION>",
  env: "<ENV>", // 仅支持 "online" 或 "test"
  trackResources: true,
  trackUserInteractions: true,
});

// 自定义行为
octopusRum.addAction("button_click", { buttonId: "submit" });

// 手动上报错误
octopusRum.addError(new Error("something wrong"), { context: "checkout" });

// 设置用户信息
octopusRum.setUser({ id: "123", name: "John", email: "john@example.com" });

// 设置全局上下文
octopusRum.setGlobalContext({ tenant: "acme" });

// 手动视图切换（需开启 trackViewsManually）
octopusRum.startView({ name: "checkout-page" });
```

## Logs API 速查

```typescript
// 初始化
import { octopusLogs } from "@octopus-sdk/browser-logs";

octopusLogs.init({
  clientToken: "<OCTOPUS_CLIENT_TOKEN>",
  service: "<SERVICE_NAME>",
  env: "online", // 仅支持 "online" 或 "test"
});

// 记录日志（不同级别）
octopusLogs.logger.debug("Debug message", { extra: "data" });
octopusLogs.logger.info("Info message");
octopusLogs.logger.warn("Warning message");
octopusLogs.logger.error(
  "Error message",
  { userId: "123" },
  new Error("details"),
);
octopusLogs.logger.fatal("Fatal error");

// 设置用户
octopusLogs.setUser({ id: "123" });
```

---

## Octopus CLI 命令行工具

### 安装

```bash
npm install -g @octopus-sdk/octopus-cli
```

### 环境变量配置

```bash
# Sourcemap 上传需要
export OCTOPUS_APP_ID="你的应用ID"
export OCTOPUS_APP_SECRET="你的应用密钥"

# 日志和事件上报需要
export OCTOPUS_REPORT_KEY="你的上报密钥"
```

### 命令速查

#### 1. Sourcemap 上传

```bash
octopus-cli sourcemaps upload <basePath> \
  --service <服务名> \
  --release-version <版本号> \
  --deploy-path-prefix <部署路径前缀>

# 可选参数
--dry-run                    # 测试模式，不实际上传
--max-concurrency <number>   # 最大并发数，默认 20
```

**示例**：

```bash
octopus-cli sourcemaps upload ./dist \
  --service "my-web-app" \
  --release-version "1.2.3" \
  --deploy-path-prefix "https://cdn.example.com/static"
```

#### 2. 事件上报

```bash
octopus-cli event report <eventType> \
  --service <服务名> \
  --env <环境> \
  --serviceVersion <版本号>

# 可选参数
--operator <操作人>
--referenceUrl <关联URL>
--linkKey <关联key>          # 用于关联部署开始和结束事件
--stage <阶段>               # venv, staging, online
--reportKey <上报密钥>       # 优先于环境变量
--reportUrl <上报URL>        # 默认 https://octopus-api.zhenguanyu.com/event/v1
```

**支持的事件类型**：

- `deployment.start` - 部署开始
- `deployment.success` - 部署成功
- `deployment.failure` - 部署失败
- `config.publish` - 配置发布

**示例**：

```bash
# 上报部署开始
octopus-cli event report deployment.start \
  --service "my-app" \
  --env "production" \
  --serviceVersion "1.2.3" \
  --operator "张三" \
  --linkKey "deploy-001"

# 上报部署成功
octopus-cli event report deployment.success \
  --service "my-app" \
  --env "production" \
  --serviceVersion "1.2.3" \
  --linkKey "deploy-001"
```

#### 3. 日志上报

```bash
octopus-cli log report "<日志内容>" \
  --service <服务名> \
  --env <环境>

# 可选参数
--reportKey <上报密钥>       # 优先于环境变量
--reportUrl <上报URL>        # 默认 https://octopus-ingest-cn.zhenguanyu.com/http/v1/log
```

**示例**：

```bash
# 普通日志
octopus-cli log report "应用启动成功" \
  --service "my-app" \
  --env "production"

# JSON 格式日志（使用单引号）
octopus-cli log report '{"level":"error","message":"数据库连接失败"}' \
  --service "my-app" \
  --env "production"
```

### CI/CD 集成示例

**GitHub Actions**：

```yaml
- name: Upload Sourcemaps
  env:
    OCTOPUS_APP_ID: ${{ secrets.OCTOPUS_APP_ID }}
    OCTOPUS_APP_SECRET: ${{ secrets.OCTOPUS_APP_SECRET }}
  run: |
    npx @octopus-sdk/octopus-cli sourcemaps upload ./dist \
      --service "my-app" \
      --release-version ${{ github.sha }} \
      --deploy-path-prefix "https://cdn.example.com/static"
```

**GitLab CI**：

```yaml
upload_sourcemaps:
  script:
    - npx @octopus-sdk/octopus-cli sourcemaps upload ./dist
      --service "my-app"
      --release-version $CI_COMMIT_SHA
      --deploy-path-prefix "https://cdn.example.com/static"
  variables:
    OCTOPUS_APP_ID: $OCTOPUS_APP_ID
    OCTOPUS_APP_SECRET: $OCTOPUS_APP_SECRET
```

---

## 问题排查策略

### SDK 问题

#### 1. SDK 未初始化

检查 `init()` 是否调用，必填参数是否完整：

- clientToken
- service
- env
- site (仅 RUM)
- applicationId (仅 RUM)

#### 2. 数据未上报

1. 检查 `sessionSampleRate` 是否设置过低
2. 检查 `beforeSend` 是否返回 false
3. 检查网络请求是否被拦截

### CLI 问题

#### 1. 环境变量未设置

```
Error: OCTOPUS_APP_ID or OCTOPUS_APP_SECRET env is not set
```

**解决**：设置环境变量或在命令前临时设置：

```bash
OCTOPUS_APP_ID="xxx" OCTOPUS_APP_SECRET="yyy" octopus-cli sourcemaps upload ...
```

#### 2. REPORT_KEY 未设置

```
OCTOPUS_REPORT_KEY is not set
```

**解决**：设置环境变量或使用 `--reportKey` 参数。

#### 3. 路径配置错误

**问题**：`--deploy-path-prefix` 与文件路径重复

```bash
# ❌ 错误：如果 dist 下已有 js 目录
--deploy-path-prefix "https://cdn.example.com/static/js"

# ✅ 正确
--deploy-path-prefix "https://cdn.example.com/static"
```

#### 4. 测试配置

使用 `--dry-run` 测试配置是否正确：

```bash
octopus-cli sourcemaps upload ./dist \
  --service "test" \
  --release-version "1.0.0" \
  --deploy-path-prefix "https://example.com" \
  --dry-run
```

### 需要深入源码

使用上方的 GitLab API 命令获取最新代码进行分析。
