---
name: octopus-metrics
description: Octopus 指标查询指南，涵盖指标类型（Count/Gauge/Histogram）、QL 模式查询语法（时间聚合/空间聚合/as_count/as_rate/表达式）、时间聚合函数（advanced_rollup/rollup/moving_rollup）、Trace Metrics。用于指导在 Octopus 平台进行指标查询和 QL 编写。
version: 1.0.0
tags:
  - octopus
  - metrics
  - query
  - prometheus
  - observability
---

# Octopus 指标查询指南

## 一、指标概述

指标（metric）是记录统计值的时序数据，与日志（log）、链路（trace）并称可观测三大支柱。

### 优势

- 比日志/Trace 提供更长存储时间和更快分析速度
- 作为宏观数据，需结合 log 和 trace 使用

### 指标来源

| 来源 | 说明 |
|------|------|
| 基础设施/中间件 | CPU 负载、网络吞吐、MySQL 集群、JVM 监控等 |
| 自定义指标 | 应用服务自己上报的指标 |
| Trace Metrics | Octopus 根据 Trace 数据自动提取的服务运行指标 |
| 日志生成指标 | 从日志数据中生成的指标 |

### 指标类型

| 类型 | 说明 | 示例 |
|------|------|------|
| **Count** | 每个时间间隔内的事件数（Delta 方式存储） | 请求数、错误次数 |
| **Gauge** | 某个时间点的绝对值 | CPU 使用率、在线人数 |
| **Histogram** | 时间间隔内数值的统计分布（含次数/和/最大最小/分桶） | 请求耗时分布 |

> Octopus 不原生支持 Summary 类型，接入时拆成 Count 和 Gauge。

---

## 二、QL 模式查询语法

### 2.1 整体结构

```
指标filter + 时间聚合 + Inner Function + 空间聚合 + {as_count/as_rate修饰符} + {时间聚合 | 空间聚合 | 其他函数} * N
```

### 2.2 指标过滤 filter

包括"指标名称"和"标签过滤"两部分。

语法：`metric_name{tag1=value1, tag2=value2}`

### 2.3 时间聚合

把时间窗口内的多个点计算为一个点。参数：目标分辨率、时间窗口、聚合算子。

**默认时间聚合**（滚动窗口，最小 10s）：

| 指标类型 | 默认聚合算子 |
|---------|------------|
| Count | sum |
| Gauge | last |
| Histogram | merge（使用 default 表示） |

### 2.4 空间聚合

把多个 TimeSeries 变成一个 TimeSeries。**Octopus 要求必须有一个空间聚合。**

| 指标类型 | 支持算子 |
|---------|---------|
| Count / Gauge | `sum`、`avg`、`max`、`min`、`count` |
| Histogram | `avg`、`sum`、`count`、`max`、`min`、`pxx` |

使用 `by (tag1, tag2)` 按标签分组：

```
sum(metric{}) by (service)
```

### 2.5 as_count / as_rate 修饰符

仅用于 Count 类型或 Histogram 的 `count_values` 之后：

| 修饰符 | 说明 |
|--------|------|
| `as_count` | 时间窗口内的总数量 |
| `as_rate` | 时间窗口内平均每秒数量（= as_count / 时间窗口） |

### 2.6 时间聚合函数

| 函数 | 说明 |
|------|------|
| `advanced_rollup(metric, 算子, 时间窗口, 目标分辨率)` | 完整时间聚合 |
| `rollup(metric, 算子, interval)` | 滚动窗口时间聚合 |
| `moving_rollup(metric, 算子, 时间窗口)` | 不改变分辨率，只能在空间聚合之后使用 |

### 2.7 Inner Function

| 函数 | 说明 |
|------|------|
| `label_replace` | 创建新标签用于空间聚合 |

### 2.8 表达式

使用 `+`、`-`、`*`、`/`、`%` 对多个查询做计算：

规则：
- `A + B` 中某时间点有一个没数据，则结果该时间点没数据
- `A group by (service, host)` 和 `B group by (service)` 可计算，结果含 service, host
- `A group by (service, host)` 和 `B group by (service, status)` **无法计算**

---

## 三、查询示例

### 总 QPS

```
as_rate(sum(trace.service.requests{service=demo-service}))
```

### 单实例 QPS

```
as_rate(sum(trace.service.requests{service=demo-service}) by (service.instance))
```

### 平均单实例 QPS（多次空间聚合）

```
avg(as_rate(sum(trace.service.requests{service=demo-service}) by (service.instance)))
```

### 每分钟请求数（结果间隔自适应）

```
as_count(sum(advanced_rollup(trace.service.requests{service=demo-service}, sum, 1m, auto)))
```

### 每分钟请求数（一分钟一个点）

```
as_count(sum(rollup(trace.service.requests{service=demo-service}, sum, 1m)))
```

### 一天内每分钟请求数的最大值（多次时间聚合）

```
rollup(as_count(sum(rollup(trace.service.requests{service=demo-service}, sum, 1m))), max, 1d)
```

### Histogram 计算 avg

```
avg(trace.service.duration{service=demo-service})
```

### Histogram 计算 p99

```
p99(trace.service.duration{service=demo-service})
```

### Histogram 计算 sum

```
sum(trace.service.duration{service=demo-service})
```

### Histogram 统计次数

```
as_count(count_values(trace.service.duration{service=demo-service}))
```

---

## 四、功能模块

| 模块 | 说明 |
|------|------|
| 指标查询页面 | 时序图可视化 |
| 大盘 | 折线图、柱状图、饼图、单值图等 |
| 指标告警 | 配置告警检测 |
