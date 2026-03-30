---
name: octopus-llm-trace
description: Octopus LLM 观测接入指南，涵盖 LLM Trace 核心概念（LLM Span/Span Kind/LLM Trace）、Java SDK（opentelemetry-kanyun-api）完整接入（traceAgent/traceLLM/traceTool/traceFluxWorkflow）、TypeScript SDK（opentelemetry-kanyun-extension）接入、Python SDK 接入、LLM 成本配置、查询语法。用于指导 LLM 应用接入 Octopus 可观测追踪。
version: 1.0.0
tags:
  - octopus
  - llm
  - trace
  - observability
  - opentelemetry
  - java
  - typescript
  - python
---

# Octopus LLM 观测接入指南

## 概述

Octopus LLM 观测为 LLM 应用提供：
- **全链路追踪**：完整记录从用户请求到 LLM 响应全过程
- **关键指标监控**：实时监控延迟、错误、token 消耗等核心指标
- **问题诊断**：快速定位异常请求，分析失败原因和性能瓶颈

---

## 一、核心概念

### 1.1 LLM Span

LLM Span 是 LLM 观测的核心元素，表示一个 AI 相关的过程。

#### 基本信息

| 字段 | 说明 |
|------|------|
| `status` | ok 或 error |
| `span.name` | 建议给业务相关名字，如 planning、code_generation |
| `duration` | 执行耗时 |
| `errorStack` | 异常栈 |
| `llm.application.name` | AI 服务名称 |
| `llm.span.kind` | Span 类型 |
| `input` / `output` | 输入和输出 |

#### Model 信息

| 字段 | 说明 | 示例 |
|------|------|------|
| `llm.model.name` | 模型名称 | gpt-4o, deepseek-r1 |
| `llm.model.provider` | 模型提供商 | OpenAI, Aliyun, azure |

#### Session 信息

| 字段 | 说明 |
|------|------|
| `llm.session.id` | 会话唯一 ID |
| `llm.session.chat_id` | 当前消息唯一 ID（高级选项） |
| `llm.session.parent_chat_id` | 上一条消息 ID（高级选项） |

#### Measure 指标

| 字段 | 说明 |
|------|------|
| `llm.measure.input_tokens` | prompt token 数 |
| `llm.measure.output_tokens` | 输出 token 数 |
| `llm.measure.total_tokens` | 总 token 数 |
| `llm.measure.time_to_first_token` | 流式首 token 耗时 |
| `llm.measure.time_per_output_token` | 平均每 token 输出时间 |
| `llm.measure.cache_hit_input_token` | 命中缓存的 input token 数 |
| `llm.measure.cache_miss_input_token` | 未命中缓存的 input token 数 |

### 1.2 Span Kind（九种类型）

| Kind | 说明 |
|------|------|
| **LLM** | 一次大模型推理接口调用 |
| **Embedding** | 通过 Embedding 模型进行向量转化 |
| **Retrieval** | RAG 检索过程，如查询向量数据库 |
| **Agent** | 基于 LLM 推断决定调用 LLM/Tool 完成复杂任务 |
| **Workflow** | 静态编排的一系列操作，固定顺序组织 |
| **Tool** | LLM 对环境感知，如 Function Calling、MCP tools |
| **Task** | 静态数据处理，不涉及对外调用 |
| **Guardrail** | 安全检验 |
| **Custom** | 其他场景，如缓存、ASR |

### 1.3 LLM Trace

LLM Trace 表示用户触发的一次 AI 业务。**根 Span 只能是 LLM、Workflow、Agent 三种类型**，其他类型作为根 Span 将被视为非法。

---

## 二、Java SDK 接入

### 前置条件

- 已接入 octopus-otel-javaagent
- Java 8 或更高版本

### 2.1 添加依赖

Maven：

```xml
<dependency>
    <groupId>com.kanyun.opentelemetry</groupId>
    <artifactId>opentelemetry-kanyun-api</artifactId>
    <version>${opentelemetry.kanyun.api.version}</version>
</dependency>
```

Gradle：

```kotlin
implementation("com.kanyun.opentelemetry:opentelemetry-kanyun-api:${opentelemetry.kanyun.api.version}")
```

### 2.2 全局初始化 SDK

```java
public class ObserverHolder {
    public static final LLMTracer LLM_TRACER = DefaultLLMTracer.init("llm-examples");
}
```

### 2.3 Agent 调用多个 Tool

#### Agent Span

```java
public String generationByAgent(String text) {
    Message inputMessage = Message.builder().addContent(text).build();
    return ObserverHolder.LLM_TRACER.traceAgent("generate_article",
            agentSpan -> {
                String result = agent.chat(text);
                IO output = IO.builder()
                        .addMessage(
                            Message.builder().addContent(result).build()
                        ).build();
                agentSpan.setOutput(output);
                return result;
            },
            inputMessage
    );
}
```

#### Tool Span

```java
final Object execute(Map<String, Object> parameters) {
    return ObserverHolder.LLM_TRACER.traceTool("article_content_generator",
            toolSpan -> {
                Object res = executeInternal(parameters);
                toolSpan.setOutput(IO.builder()
                        .setValue(JsonUtils.writeValue(res))
                        .build()
                );
                return res;
            }, JsonUtils.writeValue(parameters));
}
```

#### LLM Span（Tool 内部调用大模型）

```java
public static ChatCompletions chatCompletions(ChatCompletionsOptions options) {
    Model model = buildModel(options);
    List<Message> inputMessages = buildInputMessages(options);
    Meta meta = buildMeta(options);

    return ObserverHolder.LLM_TRACER.traceLLM(
            "article_content_generator_with_llm",
            span -> {
                ChatCompletions chatCompletions =
                        client.getChatCompletions("gpt-4o", options).block();
                if (chatCompletions != null) {
                    Measure measure = buildMeasure(chatCompletions);
                    span.setMeasure(measure);
                    ChatChoice chatChoice = chatCompletions.getChoices().get(0);
                    IO output = buildOutput(chatChoice);
                    span.setOutput(output);
                    span.finishReason(chatChoice.getFinishReason().toString());
                }
                return chatCompletions;
            },
            model, meta, inputMessages);
}
```

### 2.4 Stream（Flux 流式）

```java
public Flux<String> translateParallel(String text) {
    return ObserverHolder.LLM_TRACER.traceFluxWorkflow("translate",
        workflowSpan -> {
            List<CompletableFuture<String>> futures = Stream.of(1, 2, 3)
                    .map(i -> CompletableFuture.supplyAsync(
                        () -> translateOnce(text), executorService))
                    .collect(Collectors.toList());

            String translateResults = futures.stream()
                    .map(future -> {
                        try { return future.get(); }
                        catch (Exception e) { return ""; }
                    })
                    .collect(Collectors.joining("\n\n"));

            StringBuilder contentBuilder = new StringBuilder();
            return AzureClient.chatCompletionStream(/* ... */)
                   .map(/* extract content */)
                   .doOnNext(contentBuilder::append)
                   .doOnComplete(() ->
                        workflowSpan.setOutput(IO.builder()
                            .addMessage(Message.builder()
                                .addContent(contentBuilder.toString()).build())
                            .build())
                   );
        }, Message.builder().addContent(text).build());
}
```

### 2.5 SDK API 设计

- **"高级" API**（推荐）：`traceAgent`、`traceLLM`、`traceTool`、`traceFluxWorkflow` 等，封装了 Span 创建/关闭/异常处理/Context 传递
- **"基础" API**：手动管理 Span，灵活度更高

使用高级 API 时无需手动调用 `span.recordException`，内部已处理异常。

---

## 三、TypeScript SDK 接入

### 3.1 添加依赖

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@yuanfudao/opentelemetry-kanyun-extension": "0.0.2"
  }
}
```

### 3.2 初始化

```typescript
import { initKanyunNodeTracing } from '@yuanfudao/opentelemetry-kanyun-extension';
initKanyunNodeTracing();
```

### 3.3 全局初始化 LLM Tracer

```typescript
import { DefaultLLMTracer } from '@yuanfudao/opentelemetry-kanyun-extension';

export const llmTracer = new DefaultLLMTracer();
llmTracer.getLLMTracer().setApplicationName('typescript-llm-example');
```

### 3.4 traceStreamWorkflow

```typescript
const overall = llmTracer.traceStreamWorkflow('translate',
    async function* (_workflowSpan) {
        // ... business logic ...
        try {
            for await (const upChunk of upperIt) {
                upperBuf += upChunk;
                yield upChunk;
            }
        } finally {
            _workflowSpan.setOutput({
                messages: [{
                    payloads: [{ type: PayloadType.TEXT, content: upperBuf }]
                }]
            });
        }
    },
    { payloads: [{ type: PayloadType.TEXT, content: text }] }
);
```

### 3.5 traceLLM

```typescript
return await llmTracer.traceLLM('spanish_translate',
    async (span: LLMSpan) => {
        const completion = await client.chat.completions.create({
            model: MODEL,
            messages: [...],
            temperature: 0.2
        });
        const content = completion.choices?.[0]?.message?.content || '';
        span.setMeasure({
            inputTokens: usage?.prompt_tokens,
            outputTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens
        });
        span.setOutput({
            messages: [{
                role: RoleType.ASSISTANT,
                payloads: [{ type: PayloadType.TEXT, content }]
            }]
        });
        return content;
    },
    model, { temperature: 0.2 }, inputMessages
);
```

### 3.6 traceStreamLLM

流式 LLM 调用，含 `time_to_first_token` 等指标自动采集。

示例工程：https://gitlab-ee.zhenguanyu.com/yuanli/typescript-llm-example

---

## 四、Python SDK 接入

### 4.1 添加依赖

```
opentelemetry-api==1.35.0
opentelemetry-sdk==1.35.0
opentelemetry-exporter-otlp==1.35.0
opentelemetry-instrumentation==0.56b0
opentelemetry-distro==0.56b0
opentelemetry-kanyun-extension @ git+https://gitlab-ee.zhenguanyu.com/data-ingestion/opentelemetry-python.git@v0.0.1#subdirectory=opentelemetry-kanyun-extension
```

### 4.2 启动方式

```bash
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT=http://${NODE_IP}:14318
export OTEL_SERVICE_NAME="llm-python-example"

opentelemetry-instrument uvicorn app:asgi_app --host 0.0.0.0 --port 8080
```

### 4.3 全局初始化

```python
from opentelemetry.kanyun.impl.default_llm_tracer import DefaultLLMTracer

llm_tracer = DefaultLLMTracer.init("TranslationService")
```

### 4.4 trace_stream_workflow

```python
async def producer(workflow_span):
    try:
        async for up_chunk in upper_it:
            upper_buf += up_chunk
            yield up_chunk
    finally:
        workflow_span.set_output(IO(
            messages=[Message(
                payloads=[Payload(type=PayloadType.TEXT, content=upper_buf)]
            )]
        ))

overall = llm_tracer.trace_stream_workflow("translate", producer, input_message)
```

### 4.5 trace_llm_async

```python
return await llm_tracer.trace_llm_async(
    "spanish_translate", operation,
    model_obj, {"temperature": 0.2}, input_messages
)
```

示例工程：https://gitlab-ee.zhenguanyu.com/yuanli/python-llm-example

---

## 五、LLM 成本配置

### 成本字段

CSV 表头：`llm.application.name, model, input_tokens_unit.price, cache_hit_input_tokens_unit.price, cache_miss_input_tokens_unit.price, output_tokens_unit.price`

单价采用**百万级别 token**设置，单位为**元**。

### 方式一：CSV 文件上传至关联表

关联表表名模板：`llm_span_unit_price_xx`

### 方式二：通过 OSS 上传

```java
private static final String[] HEADERS = {
    "llm.application.name", "model",
    "input_tokens_unit.price", "cache_hit_input_tokens_unit.price",
    "cache_miss_input_tokens_unit.price", "output_tokens_unit.price"
};

simpleFenbiOssClient.put(OSS_PATH + FILENAME, inputStream);
```

### 方式三：SDK 直接上报

```java
Measure measure = Measure.builder()
        .setInputTokens(usage.getPromptTokens())
        .setCacheHitInputTokens(usage.getPromptTokensDetails().getCachedTokens())
        .setOutputTokens(usage.getCompletionTokens())
        .setTotalTokens(usage.getTotalTokens())
        .setEstimatedTotalCost(100.0)
        .setEstimatedInputCost(60.0)
        .setEstimatedOutputCost(40.0)
        .setEstimatedCacheHitInputCost(10.0)
        .setEstimatedCacheMissInputCost(50.0)
        .build();
```

成本关系：`estimatedTotalCost = estimatedInputCost + estimatedOutputCost`，`estimatedInputCost = estimatedCacheHitInputCost + estimatedCacheMissInputCost`

**注意**：SDK 填写 Cost 字段后，Octopus 不再根据 Token 消耗量计算成本。

---

## 六、LLM Trace 查询语法

支持字段搜索和全文搜索（INPUT & OUTPUT），逻辑运算（NOT > AND > OR），模糊匹配。

- `llm.span.kind` 和 `只看根请求` 支持快捷筛选
- key 和 value **严格区分大小写**
- 全文搜索**大小写敏感**

---

## FAQ

**Q: 根 span 必须是 LLM/Workflow/Agent 吗？**
A: 是的，其它类型被视为非法 Span。

**Q: 应用涉及多次 LLM 调用，需要手动打 Workflow/Agent 吗？**
A: 需要。没有 Workflow/Agent 包裹，独立的 LLM 调用之间无法自动聚合，会变成多个独立 LLM Trace。

**Q: 使用 traceAgent 等高级 API，失败时需要手动 recordException 吗？**
A: 不需要，高级 API 内部已处理异常。
