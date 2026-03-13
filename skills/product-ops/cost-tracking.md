# AI and Infrastructure Cost Management

| Field | Value |
|---|---|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-03-06 |
| **Applicability** | AI-powered products, SaaS, API services, cloud infrastructure |
| **Dependencies** | observability.md (for metrics/logging integration) |

---

## Core Principle

Every request has a cost. Know it, attribute it, and optimize it. Cost visibility is a prerequisite for sustainable unit economics. Track cost as a first-class metric alongside latency and error rate.

---

## Per-Request Cost Calculation

### AI/LLM Cost Components

```
Total cost per AI request =
    Input tokens  x  input price per token
  + Output tokens x  output price per token
  + Embedding cost (if applicable)
  + Tool/function call overhead
  + Infrastructure cost (compute time, memory)
```

### Cost Tracking Implementation

```typescript
interface RequestCost {
  request_id: string;
  timestamp: Date;
  user_id_hash: string;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  model_cost_usd: number;        // LLM API cost
  compute_cost_usd: number;      // server time
  total_cost_usd: number;
  latency_ms: number;
  cached: boolean;
}

// Log cost with every AI request
async function trackRequestCost(req: RequestCost): Promise<void> {
  // 1. Calculate cost from token counts and model pricing
  // 2. Add compute cost (request duration x cost-per-ms)
  // 3. Write to cost tracking table/stream
  // 4. Emit metric for real-time dashboards
}
```

### Model Pricing Reference Table

Maintain a version-controlled pricing table. Update when providers change prices.

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Prices per 1M tokens — update as pricing changes
  "claude-sonnet-4-20250514":  { input: 3.00,  output: 15.00  },
  "claude-haiku-3.5":         { input: 0.80,  output: 4.00   },
  "gpt-4o":                   { input: 2.50,  output: 10.00  },
  "gpt-4o-mini":              { input: 0.15,  output: 0.60   },
  // ... add models as used
};
```

---

## Cost Attribution

### Attribution Dimensions

Track cost along multiple axes to answer different business questions.

| Dimension | Question Answered | Example Values |
|---|---|---|
| **User / Account** | Who is expensive to serve? | user hash, org ID |
| **Feature** | Which features cost the most? | `chat`, `search`, `summarize`, `code_gen` |
| **Model** | What's our model mix cost? | `claude-sonnet`, `gpt-4o-mini` |
| **Plan Tier** | Are we margin-positive per tier? | `free`, `pro`, `enterprise` |
| **Endpoint** | Which APIs are cost-heavy? | `/api/chat`, `/api/analyze` |
| **Environment** | Dev/staging cost leakage? | `production`, `staging`, `development` |

### Cost Attribution Schema

```sql
CREATE TABLE request_costs (
  id              UUID PRIMARY KEY,
  timestamp       TIMESTAMPTZ NOT NULL,
  user_id_hash    TEXT NOT NULL,
  org_id          TEXT,
  feature         TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  model           TEXT,
  plan_tier       TEXT NOT NULL,
  environment     TEXT NOT NULL DEFAULT 'production',
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  model_cost_usd  DECIMAL(10, 6) NOT NULL,
  compute_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  total_cost_usd  DECIMAL(10, 6) NOT NULL,
  cached          BOOLEAN DEFAULT FALSE,
  latency_ms      INTEGER
);

-- Indexes for common queries
CREATE INDEX idx_costs_timestamp ON request_costs (timestamp);
CREATE INDEX idx_costs_feature ON request_costs (feature, timestamp);
CREATE INDEX idx_costs_user ON request_costs (user_id_hash, timestamp);
CREATE INDEX idx_costs_plan ON request_costs (plan_tier, timestamp);
```

### Key Queries

```sql
-- Daily cost by feature (last 30 days)
SELECT feature, DATE(timestamp) as day, SUM(total_cost_usd) as daily_cost
FROM request_costs
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY feature, day ORDER BY day, daily_cost DESC;

-- Cost per user percentiles
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY user_cost) as p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY user_cost) as p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY user_cost) as p99
FROM (
  SELECT user_id_hash, SUM(total_cost_usd) as user_cost
  FROM request_costs
  WHERE timestamp > NOW() - INTERVAL '30 days'
  GROUP BY user_id_hash
) user_costs;

-- Margin analysis by plan tier
SELECT plan_tier,
  COUNT(DISTINCT user_id_hash) as users,
  SUM(total_cost_usd) as total_cost,
  SUM(total_cost_usd) / COUNT(DISTINCT user_id_hash) as cost_per_user
FROM request_costs
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY plan_tier;
```

---

## Budget Alerts

### Alert Tiers

| Alert | Threshold | Action |
|---|---|---|
| **Daily spend warning** | >120% of daily average | Slack notification to engineering |
| **Daily spend critical** | >200% of daily average | Slack + PagerDuty, investigate immediately |
| **Monthly budget warning** | >80% of monthly budget consumed | Slack notification to eng + product |
| **Monthly budget critical** | >95% of monthly budget consumed | Escalate to leadership, consider rate limiting |
| **Per-user anomaly** | Single user >10x median cost | Investigate for abuse or bug |
| **Per-feature spike** | Feature cost >3x 7-day average | Investigate regression or usage surge |

### Budget Enforcement

```
Soft limits:
  - Alert and log, but don't block
  - Appropriate for paying customers

Hard limits:
  - Rate limit or degrade gracefully
  - Appropriate for free tier, trial accounts
  - Return 429 with Retry-After header and clear messaging

Circuit breaker:
  - If total spend exceeds 5x daily budget, pause non-critical AI features
  - Keep critical paths (auth, core reads) always available
```

---

## Cost Optimization Strategies

### 1. Semantic Caching

Cache AI responses for semantically similar inputs.

```
Cache hit rate target: 20-40% for conversational AI, 60-80% for search/FAQ

Implementation:
  1. Generate embedding of input
  2. Search vector cache for similar inputs (cosine similarity > 0.95)
  3. If hit: return cached response (cost = embedding only)
  4. If miss: call model, cache response with embedding

Cost savings: proportional to hit rate x (model_cost - embedding_cost)
```

### 2. Prompt Compression

Reduce input tokens without losing quality.

| Technique | Token Reduction | Trade-off |
|---|---|---|
| **System prompt optimization** | 20-50% | One-time effort, no quality loss |
| **Context window pruning** | 30-60% | May lose relevant context |
| **Summary-based context** | 50-70% | Slight quality reduction for long conversations |
| **Structured output schemas** | 10-20% | Reduces output tokens via constrained generation |

### 3. Model Routing

Use the cheapest model that meets quality requirements for each request type.

```
Router logic:
  Simple classification/extraction → small model (Haiku, GPT-4o-mini)
  Standard conversation/analysis   → mid model (Sonnet, GPT-4o)
  Complex reasoning/code gen       → large model (Opus, o1)

Implementation:
  1. Classify request complexity (can use small model or heuristics)
  2. Route to appropriate model
  3. Track quality metrics per route to validate routing decisions
  4. Adjust thresholds based on quality/cost trade-off data

Typical savings: 40-70% vs. always using the largest model
```

### 4. Request Optimization

| Strategy | Description | Savings |
|---|---|---|
| **Batch requests** | Combine multiple small requests into one | 20-40% overhead reduction |
| **Streaming with early termination** | Stop generation when answer is sufficient | Variable |
| **Max token limits** | Set reasonable `max_tokens` per use case | Prevents runaway responses |
| **Deduplication** | Detect and merge duplicate in-flight requests | Proportional to duplication rate |

### 5. Infrastructure Cost Optimization

| Strategy | Description |
|---|---|
| **Right-size compute** | Match instance types to actual CPU/memory usage |
| **Autoscaling** | Scale down during low-traffic periods |
| **Spot/preemptible instances** | Use for non-critical batch workloads (60-90% savings) |
| **Reserved capacity** | Commit to 1-year reservations for baseline load (30-50% savings) |
| **Region optimization** | Deploy in regions with lower pricing where latency allows |
| **CDN/edge caching** | Offload static and semi-static content |

---

## Infrastructure Cost Monitoring

### Cloud Cost Breakdown

Track monthly by category:

```
Compute (VMs, containers, serverless)     $___
Database (RDS, managed DB, storage)       $___
AI/ML APIs (OpenAI, Anthropic, etc.)      $___
Storage (S3, blob, CDN)                   $___
Network (egress, load balancers)          $___
Monitoring/logging (Datadog, etc.)        $___
Third-party SaaS (auth, email, etc.)      $___
──────────────────────────────────────────
Total                                     $___
```

### Cost Per Environment

Track and alert on non-production cost creep:

```
Production:  should be majority of spend
Staging:     target <10% of production cost
Development: target <5% of production cost
CI/CD:       track and optimize (cache dependencies, right-size runners)
```

---

## Unit Economics

### Key Metrics

| Metric | Formula | Target |
|---|---|---|
| **Cost per request** | Total AI cost / total requests | Track trend, minimize |
| **Cost per user/month** | Total cost / active users | Must be < ARPU |
| **Gross margin** | (Revenue - COGS) / Revenue | >70% for SaaS |
| **LTV:CAC ratio** | Lifetime value / acquisition cost | >3:1 |
| **Cost per feature** | Attributed cost / feature usage | Justify feature investment |

### Margin Analysis by Tier

```
For each pricing tier, calculate:

Revenue per user (monthly)           $X.XX
  - AI API cost per user             $X.XX
  - Infrastructure cost per user     $X.XX
  - Third-party service cost/user    $X.XX
  ────────────────────────────────────
  = Gross margin per user            $X.XX  (target: positive)
  = Gross margin %                   XX%    (target: >60%)
```

If any tier is margin-negative, either:
1. Increase price
2. Reduce cost (model routing, caching, usage limits)
3. Accept as acquisition strategy with clear path to positive margin

---

## Cost Dashboard

### Required Visualizations

```
1. Daily total spend (line chart, with budget line overlay)
2. Cost breakdown by category (stacked area chart)
3. Cost per request trend (line chart, p50/p95)
4. Cost by feature (bar chart, sorted descending)
5. Cost per user distribution (histogram)
6. Cache hit rate and savings (line chart)
7. Model mix over time (stacked area, shows routing effectiveness)
8. Margin by plan tier (bar chart)
```

---

## Implementation Checklist

- [ ] Per-request cost tracking in place for all AI calls
- [ ] Cost attribution by user, feature, model, and plan tier
- [ ] Model pricing table maintained and version-controlled
- [ ] Daily and monthly budget alerts configured
- [ ] Per-user anomaly detection active
- [ ] Semantic caching evaluated and implemented where beneficial
- [ ] Model routing implemented (small/mid/large model tiers)
- [ ] Prompt token counts optimized for high-volume endpoints
- [ ] Infrastructure cost tracked by category and environment
- [ ] Unit economics calculated monthly (cost per user vs. ARPU)
- [ ] Cost dashboard reviewed weekly in product/eng sync
- [ ] Non-production environment costs monitored and capped
