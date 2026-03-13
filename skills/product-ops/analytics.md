# Privacy-Preserving Analytics

| Field | Value |
|---|---|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-03-06 |
| **Applicability** | Web apps, mobile apps, SaaS products, AI-powered products |
| **Dependencies** | None (standalone reference) |

---

## Core Principle

Analytics serve the product team, not advertisers. Never store PII in analytics events. Prefer self-hosted solutions that keep data under your control. Design for actionable insight, not data hoarding.

---

## Event Taxonomy Design

### Naming Convention

Use `object.action` format with snake_case. Be specific, consistent, and past-tense for completed actions.

```
# Good
page.viewed
button.clicked
form.submitted
subscription.created
search.performed
onboarding.step_completed

# Bad
click
pageView
user_did_thing
trackEvent
```

### Event Structure

Every event should include a standard envelope:

```json
{
  "event": "feature.activated",
  "timestamp": "2026-03-06T12:00:00Z",
  "session_id": "anonymous-session-hash",
  "properties": {
    "feature_name": "dark_mode",
    "source": "settings_page",
    "plan_tier": "pro"
  },
  "context": {
    "app_version": "2.4.1",
    "platform": "web",
    "locale": "en-US"
  }
}
```

### Taxonomy Layers

| Layer | Purpose | Examples |
|---|---|---|
| **Acquisition** | How users arrive | `referral.landed`, `campaign.clicked` |
| **Activation** | First-value moments | `onboarding.completed`, `first_project.created` |
| **Engagement** | Core usage patterns | `feature.used`, `search.performed` |
| **Revenue** | Monetization events | `subscription.started`, `plan.upgraded` |
| **Retention** | Return signals | `session.started`, `notification.opened` |

### PII Rules

- **Never track**: email, name, IP address, phone, physical address, government IDs
- **Use instead**: anonymous session hashes, plan tier, account age bucket, org size bucket
- **Aggregate, don't individuate**: track counts and distributions, not individual journeys where possible
- **Scrub on ingest**: if PII accidentally enters the pipeline, have a deletion mechanism

---

## Self-Hosted vs. Third-Party

### Recommended: Self-Hosted / Privacy-First

| Tool | Strengths | Weaknesses | Best For |
|---|---|---|---|
| **Plausible** | Lightweight (<1KB script), no cookies, GDPR-compliant by default, simple dashboard | Limited custom events, no cohort analysis | Marketing sites, content sites, simple SaaS |
| **PostHog** | Full product analytics suite, session replay, feature flags, self-hostable, generous free tier | Resource-heavy self-hosted, complex setup | SaaS products needing full analytics stack |
| **Umami** | Minimal, fast, easy self-hosting, open source | Fewer features than PostHog | Small to mid-size projects, privacy-focused teams |

### Avoid Unless Required

| Tool | Why to Avoid |
|---|---|
| **Google Analytics (GA4)** | Sends data to Google, GDPR compliance burden, complex event model, data used for ad targeting |
| **Mixpanel / Amplitude (cloud)** | Data leaves your infrastructure, vendor lock-in, expensive at scale |

### Decision Framework

```
Need feature flags + analytics + session replay?  --> PostHog (self-hosted)
Need simple page/event analytics, minimal JS?     --> Plausible or Umami
Need deep funnel/cohort analysis, budget allows?   --> PostHog
Regulatory constraint (HIPAA, GDPR strict)?        --> Self-hosted PostHog or Umami
```

---

## Server-Side Event Tracking

Prefer server-side tracking for critical business events. Client-side tracking is lossy (ad blockers, JS errors, tab closes).

### Implementation Pattern

```typescript
// Server-side analytics service
interface AnalyticsEvent {
  event: string;
  sessionId: string;       // anonymized
  properties: Record<string, string | number | boolean>;
  timestamp: Date;
}

class AnalyticsService {
  async track(event: AnalyticsEvent): Promise<void> {
    // 1. Validate event against taxonomy schema
    // 2. Strip any PII (defense in depth)
    // 3. Enqueue to buffer/queue (not inline to request)
    // 4. Flush buffer periodically or at threshold
  }
}
```

### When to Use Server-Side vs. Client-Side

| Server-Side | Client-Side |
|---|---|
| Purchases, subscription changes | Page views, scroll depth |
| API usage, rate limit hits | UI interactions, clicks |
| Background job completions | Feature discovery moments |
| Auth events (login, signup) | Client performance metrics |

### Hybrid Approach

Track user interactions client-side, business events server-side. Use a shared session ID (anonymous, hashed) to correlate.

---

## Funnel Analysis

### Design Principles

- Define funnels around **user goals**, not UI flows
- Include time constraints (e.g., "completed within 7 days")
- Track both **entry rate** and **completion rate**
- Segment by cohort, plan, platform

### Standard Funnels

```
Signup Funnel:
  landing_page.viewed
  → signup.started
  → email.verified
  → onboarding.completed
  → first_value_action.performed

Conversion Funnel:
  pricing_page.viewed
  → plan.selected
  → checkout.started
  → subscription.created

Feature Adoption Funnel:
  feature.discovered (saw UI element)
  → feature.tried (first use)
  → feature.adopted (used 3+ times in 7 days)
```

### Drop-Off Analysis

For each funnel step, track:
- Conversion rate (step N to step N+1)
- Median time between steps
- Top exit pages/actions at each drop-off point

---

## Cohort Analysis

### Cohort Definitions

| Cohort Type | Grouped By | Answers |
|---|---|---|
| **Acquisition** | Signup week/month | "Are newer users retaining better?" |
| **Behavioral** | First action taken | "Do users who try feature X retain better?" |
| **Plan-based** | Subscription tier | "Which plan has best engagement?" |

### Retention Table Format

```
Week    | W0   | W1   | W2   | W3   | W4
--------|------|------|------|------|------
Jan W1  | 100% | 45%  | 32%  | 28%  | 25%
Jan W2  | 100% | 48%  | 35%  | 30%  | --
Jan W3  | 100% | 50%  | 38%  | --   | --
```

Track: DAU/MAU ratio, L7 (days active in last 7), resurrection rate (returned after 30+ day absence).

---

## A/B Testing

### Prerequisites

- Sufficient traffic (calculate sample size before starting)
- Clear primary metric and guardrail metrics
- Randomization unit (user, session, org)
- Feature flag infrastructure

### Framework

```
1. Hypothesis: "Changing X will improve metric Y by Z%"
2. Sample size calculation: use power analysis (80% power, 5% significance)
3. Run duration: minimum 1-2 full business cycles (typically 2 weeks)
4. Analysis: check statistical significance AND practical significance
5. Decision: ship, iterate, or kill
```

### Guardrail Metrics

Always monitor alongside the primary metric:
- Page load time (don't degrade performance)
- Error rate (don't break things)
- Other key business metrics (don't cannibalize)

### Common Pitfalls

- Peeking at results before adequate sample size (inflates false positive rate)
- Running too many simultaneous tests on overlapping populations
- Not accounting for novelty effects (new UI gets clicks just because it's new)
- Testing on too small a segment to reach significance

---

## Dashboard Design

### Hierarchy

```
Level 1 — Executive Dashboard (1 screen)
  ├── Active users (DAU/WAU/MAU)
  ├── Revenue metrics (MRR, churn rate)
  ├── Signup → Activation rate
  └── System health (uptime, error rate)

Level 2 — Product Dashboards (per feature area)
  ├── Feature adoption rates
  ├── Funnel conversion rates
  ├── User satisfaction signals
  └── Performance metrics

Level 3 — Exploration (ad-hoc queries)
  └── Self-serve query tools for product team
```

### Dashboard Rules

- Every chart must answer a specific question (stated in the title)
- Default to line charts for trends, bar charts for comparisons, tables for details
- Show comparisons: vs. previous period, vs. target, vs. cohort
- Include data freshness indicator ("Last updated: 5 min ago")
- Limit to 6-8 visualizations per dashboard — if more are needed, split into sub-dashboards
- Alert thresholds should be visible on charts where applicable

---

## Implementation Checklist

- [ ] Event taxonomy documented and version-controlled
- [ ] PII scrubbing enforced at ingest layer
- [ ] Server-side tracking for business-critical events
- [ ] Client-side tracking for interaction events
- [ ] Core funnels defined and monitored
- [ ] Retention cohorts running weekly
- [ ] Executive dashboard built and shared
- [ ] Data retention policy defined (typically 12-24 months for event data)
- [ ] Analytics reviewed in weekly product meetings
