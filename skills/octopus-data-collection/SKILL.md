---
name: octopus-data-collection
description: Octopus 可观测平台数据采集指南，涵盖 Log/Trace/Metric 三种数据类型的采集方式。包括 octopus-otel-collector 部署、HTTP 接口上传（curl/Java/JS）、Kafka 接收、Java trace javaagent 接入、手动打点（Skywalking/OpenTelemetry）、Node.js 日志与指标上报、Python 日志与指标上报、低内存场景配置。用于指导各语言服务接入 Octopus 可观测数据采集。
version: 1.0.0
tags:
  - octopus
  - observability
  - opentelemetry
  - log
  - trace
  - metric
  - data-collection
---

# Octopus 数据采集指南

## 概述

Octopus 数据采集支持 Log、Trace、Metric 三种可观测数据类型，支持多机器架构部署，能平滑对接不同数据来源。

### 采集区域域名

| 区域 | Ingest 域名 |
|------|------------|
| 美东 | `https://ingest-us.octopusgateway.com` |
| 新加坡 | `https://ingest-sg.octopusgateway.com` |
| 国内 | `https://octopus-ingest-cn.zhenguanyu.com` |

---

## 一、Log 数据采集

### 1.1 Linux 单机手动安装 octopus-otel-collector

四步流程：

1. **下载** - 在 octopus-otel-collector release note 选择最新版本的 linux 二进制文件（如 `xxx.linux_arm64.tar.gz`），解压后目录结构：

```
./
├── example
│   └── nonk8s
│       └── octopus-otel.yaml.example
└── octopus-otel
```

2. **配置文件调整** - 参照"采集指定文件的agent配置示例"调整必需项和选择性项，放在 configs 目录下命名为 `octopus-otel.yaml`

3. **启动**：

```bash
octopus-otel --config=./configs/octopus-otel.yaml
```

成功标志：`Everything is ready. Begin running and processing data.`

4. **验证** - 访问 https://octopus.zhenguanyu.com/#/logs/search?columns=timestamp&env=online 查看日志

### 1.2 HTTP 接口上传

**URL**: `https://octopus-ingest-cn.zhenguanyu.com/http/v1/log`

支持 JSON 和 Protobuf 格式，推荐 Protobuf（传输效率更高）。压缩方式仅支持 gzip。

#### curl 示例

```bash
curl --location --request POST 'https://octopus-ingest-cn.zhenguanyu.com/http/v1/log' \
 --header 'octopus_api_key: 找octopus申请' \
 --header 'Content-Encoding: none' \
 --header 'Content-Type: application/json' \
--data-raw '{
    "resource_logs": [
        {
            "resource": {
                "attributes": [
                    {"key": "deploy_source", "value": {"string_value": "k8s"}},
                    {"key": "env", "value": {"string_value": "test"}},
                    {"key": "yfd_service", "value": {"string_value": "my_service"}},
                    {"key": "k8s.pod.name", "value": {"string_value": "my_pod"}}
                ]
            },
            "scope_logs": [
                {
                "log_records": [
                    {
                        "body": {"string_value": "testbody123"},
                        "attributes": [
                            {"key": "custom_key", "value": {"string_value": "custom_value"}}
                        ]
                    }
                ]
            }
            ]
        }
    ]
}'
```

#### Java Protobuf 示例

引入依赖：

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>io.opentelemetry</groupId>
            <artifactId>opentelemetry-bom</artifactId>
            <version>1.35.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
<dependencies>
    <dependency>
        <groupId>io.opentelemetry</groupId>
        <artifactId>opentelemetry-sdk</artifactId>
    </dependency>
    <dependency>
        <groupId>io.opentelemetry</groupId>
        <artifactId>opentelemetry-exporter-otlp</artifactId>
    </dependency>
</dependencies>
```

发送日志：

```java
OtlpHttpLogRecordExporter exporter = OtlpHttpLogRecordExporter.builder()
        .addHeader("octopus_api_key", "xxxxx")
        .setCompression("gzip")
        .setEndpoint("http://127.0.0.1:8081/http/v1/log")
        .build();

BatchLogRecordProcessor batchProcessor = BatchLogRecordProcessor.builder(exporter)
        .setMaxExportBatchSize(512)
        .setScheduleDelay(1000, TimeUnit.MILLISECONDS)
        .setMaxQueueSize(2048)
        .build();

SdkLoggerProvider provider = SdkLoggerProvider.builder()
        .addLogRecordProcessor(batchProcessor)
        .addResource(Resource.create(Attributes.of(
            AttributeKey.stringKey("service"), "my-service")))
        .build();

Logger logger = provider.loggerBuilder("my-logger").build();
logger.logRecordBuilder().setBody("test log message").emit();
```

#### JavaScript Protobuf 示例

```javascript
import { SeverityNumber } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

const collectorOptions = {
  url: 'https://octopus-ingest-cn.zhenguanyu.com/http/v1/log',
  headers: {},
  concurrencyLimit: 30,
};
const logExporter = new OTLPLogExporter(collectorOptions);
const loggerProvider = new LoggerProvider();
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

const logger = loggerProvider.getLogger('default', '1.0.0');
logger.emit({
  severityNumber: SeverityNumber.INFO,
  severityText: 'info',
  body: 'this is a log body',
  attributes: { 'log.type': 'custom' },
});
```

#### 批量发送调参

通过环境变量配置：

| 环境变量 | 说明 |
|---------|------|
| `OTEL_BLRP_MAX_EXPORT_BATCH_SIZE` | 一次批量发送最多包含的请求数 |
| `OTEL_BLRP_MAX_QUEUE_SIZE` | 缓存日志的队列 size，满则丢数据 |
| `OTEL_BLRP_SCHEDULE_DELAY` | 每次发送最多等待的时间 |
| `OTEL_BLRP_EXPORT_TIMEOUT` | 一次发送请求的 timeout |

### 1.3 通过 Kafka 从阿里云日志服务接收日志

适用于从 SLS 导入日志到 Octopus（支持版本 >= 0.3.0）。

步骤：
1. 开通阿里云 Kafka 服务，创建主题和消费组
2. 配置事件总线（SLS 为事件源，Kafka 为目标）
3. 在 octopus-otel-collector 中配置 kafka receiver 消费

完整配置示例：

```yaml
exporters:
  otlphttp:
    logs_endpoint: https://octopus-ingest-cn.zhenguanyu.com/octopus/otel/v1/log
extensions:
  memory_ballast:
    size_mib: "256"
processors:
  resource:
    attributes:
      - key: env
        value: "test"
        action: upsert
  batch:
    send_batch_size: 100
    send_batch_max_size: 100
    timeout: 5s
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
receivers:
  kafka:
    protocol_version: 0.10.2.2
    topic: octopus_sls_source_test
    encoding: text
    brokers: example.com:9092
    group_id: test
service:
  extensions:
    - memory_ballast
  pipelines:
    logs:
      exporters:
        - otlphttp
      processors:
        - memory_limiter
        - resource
        - batch
      receivers:
        - kafka
```

### 1.4 Node.js 日志打印

使用 `@yuanfudao/opentelemetry-kanyun-extension` 内置的 pino 日志组件，自动注入 Trace ID。

#### 安装

```bash
npm config set @yuanfudao:registry http://npm.zhenguanyu.com/
npm install @yuanfudao/opentelemetry-kanyun-extension@^0.1.2
```

#### 基础用法

```typescript
import { getLogger } from '@yuanfudao/opentelemetry-kanyun-extension';

const logger = getLogger();
logger.info('Hello, world!');
logger.warn({ userId: 123 }, 'User logged in');
```

#### 指定 Logger 名称

```typescript
const logger = getLogger('MyService');
logger.info('Service started');
```

#### 错误日志

```typescript
try {
  // 危险操作
} catch (err) {
  logger.error(err, 'Something went wrong');
}
```

#### 输出格式

```
YYYY-MM-DD HH:mm:ss.SSS [LEVEL] [LoggerName] @@@traceId=${ctx.traceId}@@@ message
```

示例：`2025-11-24 16:51:24.243 [INFO] [translationRoutes] @@@traceId=d3bac80ca420f2d1c81e977f5912ec6a@@@ In traceWorkflow`

#### 自定义格式

```typescript
const logger = getLogger({
  name: 'CustomLogger',
  formatter: (ctx) => {
    return `[${ctx.level}] ${ctx.message} (trace: ${ctx.traceId})\n`;
  }
});
```

#### console 输出替换

对已有大量 `console.log` 的项目：

```typescript
import { installConsoleHijack } from '@yuanfudao/opentelemetry-kanyun-extension';
installConsoleHijack();
```

映射关系：`log→info, info→info, warn→warn, error→error, debug→debug`

### 1.5 Python 日志打印

使用标准 Python `logging` 模块，通过 `opentelemetry-instrument` 启动后自动注入 traceId。

```python
import logging

logger = logging.getLogger(__name__)

logger.info("普通日志")
logger.warning("警告信息")
logger.error("错误信息")
logger.error("带堆栈的错误", exc_info=True)
```

输出效果：`2025-12-30 16:41:52,426.426 [INFO] [services.translation_service] @@@traceId=3d3d861342e5b80accec2b6a66d1af5f@@@ In traceLLM ...`

#### APM 启用方式

添加依赖：

```
opentelemetry-api==1.35.0
opentelemetry-sdk==1.35.0
opentelemetry-exporter-otlp==1.35.0
opentelemetry-instrumentation==0.56b0
opentelemetry-distro==0.56b0
```

启动：

```bash
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT=http://${NODE_IP}:14318
export OTEL_SERVICE_NAME="my-python-service"
export OTEL_PYTHON_LOG_CORRELATION=true
export OTEL_PYTHON_LOG_FORMAT="%(asctime)s.%(msecs)03d [%(levelname)s] [%(name)s] @@@traceId=%(otelTraceID)s@@@ %(message)s"

opentelemetry-instrument uvicorn app:asgi_app --host 0.0.0.0 --port 8080
```

---

## 二、Trace 数据采集

### 2.1 Linux 单机 Java 应用 Trace

在 octopus-otel-javaagent release note 选择最新 javaagent 版本：

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.service.name=myservice \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=none \
  -Dotel.logs.exporter=none \
  -Dotel.instrumentation.log4j-appender.enabled=false \
  -Dotel.instrumentation.logback-appender.enabled=false \
  -jar my-http-server.jar
```

**注意**：在 log4j 配置的 pattern 中添加 `trace_id=%X{trace_id}`：

```
%d{yyyy-MM-dd HH:mm:ss.SSS} [%p] [%t] [%c] @@@trace_id=%X{trace_id}@@@  %m%n
```

### 2.2 Skywalking 手动打点

使用 opentracing 0.30.0，初始化：

```java
import com.kanyun.opentracing.Tracer;
import org.apache.skywalking.apm.toolkit.opentracing.SkywalkingTracer;

Tracer tracer = new SkywalkingTracer(); // 线程安全，可单例
```

基本打点：

```java
public void callSomeThing(String arg1) {
    Tracer.SpanBuilder spanBuilder = tracer.buildSpan("call some downstream")
            .withTag("arg1", arg1);
    try (ActiveSpan span = spanBuilder.startActive()) {
        try {
            // do something...
        } catch (Exception e) {
            span.setTag(Tags.ERROR.getKey(), true);
            span.log(ImmutableMap.of(
                    "exception.type", e.getClass().getName(),
                    "exception.message", e.getMessage(),
                    "exception.stacktrace", ExceptionUtils.getStackTrace(e)
            ));
        }
    }
}
```

跨线程传递：调用 `ActiveSpan#capture()` 得到 Continuation，在新线程执行 `Continuation#activate()` 沿用上下文。

### 2.3 OpenTelemetry 自定义 Span

适用于使用 OpenTelemetry javaagent 的用户，直接使用 `GlobalOpenTelemetry`：

```java
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Tracer;

Tracer tracer = GlobalOpenTelemetry.getTracer("manual");
```

手动创建 Span：

```java
Span span = GlobalOpenTelemetry.getTracer("manual")
        .spanBuilder("call some downstream")
        .setAttribute("arg1", arg1)
        .startSpan();

try (Scope scope = span.makeCurrent()) {
    // do something...
} catch (Exception e) {
    span.recordException(e);
    if (e instanceof RuntimeException) {
        span.setStatus(StatusCode.ERROR);
    }
} finally {
    span.end();
}
```

跨线程传递：

```java
// 老线程
Context context = span.storeInContext(Context.current());

// 新线程
try (Scope scope = context.makeCurrent()) {
    // 该代码块在老线程的上下文中
}
```

跨进程传递（HTTP/gRPC/Kafka 等 Header 协议）：
- 客户端注入：`GlobalOpenTelemetry.getPropagators().getTextMapPropagator().inject(Context.current(), requestBuilder, carrier)`
- 服务端提取：`Context context = GlobalOpenTelemetry.getPropagators().getTextMapPropagator().extract(Context.current(), headers, carrier)`

---

## 三、Metric 数据采集

### 3.1 Linux 单机 Prometheus Metric

同日志采集四步流程，配置文件参照"采集 Prometheus metric 的配置示例"。

验证：访问 https://octopus.zhenguanyu.com/#/metric/explorer?env=online&time=1d ，输入指标名（如 `system.cpu.time`）。

### 3.2 Node.js 指标上报

使用 `@yuanfudao/kanyun-node-metrics`，基于 prom-client，默认通过 `26666/openMetrics` 暴露指标。

#### 安装

```bash
npm config set @yuanfudao:registry http://npm.zhenguanyu.com/
npm install @yuanfudao/kanyun-node-metrics
```

#### 基础用法

```typescript
import { initMetrics, kanyunMetrics } from '@yuanfudao/kanyun-node-metrics';
initMetrics();

export const llmCallCounter = new kanyunMetrics.client.Counter({
    name: 'llm_call_total',
    help: 'Total number of LLM calls',
    labelNames: ['model', 'status'],
});
```

#### 自定义配置

```javascript
initMetrics({
  port: 3000,
  path: '/metrics',
  collectDefaultMetrics: true,
  defaultMetricsPrefix: 'myapp_'
});
```

#### API 参考

| API | 说明 |
|-----|------|
| `initMetrics(config?)` | 初始化指标服务，返回 KanyunMetrics 单例 |
| `kanyunMetrics.client` | 底层 prom-client 库对象 |
| `kanyunMetrics.register` | 全局 prom-client 注册表 |
| `kanyunMetrics.stopServer()` | 停止 HTTP 服务 |

验证：`curl http://localhost:26666/openMetrics`

---

## 四、低内存场景配置

### 常规低内存（至少 100MB）

```
GOMEMELIMIT=64MB
memory_limiter limit_mib: 64
max_concurent_streams: 1（Skywalking receiver）
不启用 ballast
```

可处理：日志 5 万条/s、指标 5 千时间序列、trace 1 万 Span/s。

### 最低内存（至少 70MB）

```
GOMEMELIMIT=32MB
memory_limiter limit_mib: 32
max_concurent_streams: 1（Skywalking receiver）
不启用 ballast
```

可处理：日志 1 万条/s、指标 1 千时间序列、trace 3000 Span/s。

---

## 相关资料

- 示例工程（TypeScript）：https://gitlab-ee.zhenguanyu.com/yuanli/typescript-llm-example
- 示例工程（Python）：https://gitlab-ee.zhenguanyu.com/yuanli/python-llm-example
- OpenTelemetry 社区文档：https://opentelemetry.io/docs/languages/java/api/
- Octopus 平台：https://octopus.zhenguanyu.com
