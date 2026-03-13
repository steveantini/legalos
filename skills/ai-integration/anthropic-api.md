# Anthropic Claude API Patterns

```
Version:        1.0.0
Last Updated:   2026-03-06
Applicability:  Any project integrating the Anthropic Messages API (Python SDK, TypeScript SDK, or raw HTTP)
Dependencies:   anthropic Python SDK >=0.40.0 | @anthropic-ai/sdk >=0.30.0
```

---

## Model Selection

| Model | ID | Best For | Context | Max Output |
|---|---|---|---|---|
| Opus 4 | `claude-opus-4-0520` | Complex reasoning, multi-step analysis, coding | 200K | 32K |
| Sonnet 4 | `claude-sonnet-4-20250514` | Balanced speed/quality, general tasks | 200K | 16K |
| Haiku 3.5 | `claude-3-5-haiku-20241022` | High throughput, low latency, simple tasks | 200K | 8K |

**Selection heuristic:** Start with Sonnet. Upgrade to Opus for tasks requiring deep reasoning, nuanced judgment, or high-stakes accuracy. Downgrade to Haiku for classification, extraction, routing, or latency-sensitive paths.

---

## Message Construction

### Basic Request

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system="You are a code review assistant. Be concise and specific.",
    messages=[
        {"role": "user", "content": "Review this function for bugs."},
    ],
)
print(response.content[0].text)
```

### TypeScript Equivalent

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: "You are a code review assistant. Be concise and specific.",
  messages: [
    { role: "user", content: "Review this function for bugs." },
  ],
});
console.log(response.content[0].text);
```

### Multi-Turn Conversation

Messages alternate `user` and `assistant`. You must maintain the full history yourself — the API is stateless.

```python
conversation = [
    {"role": "user", "content": "Summarize this document: ..."},
    {"role": "assistant", "content": "The document covers..."},
    {"role": "user", "content": "What are the key risks mentioned?"},
]

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=2048,
    messages=conversation,
)

# Append the response to continue the conversation
conversation.append({"role": "assistant", "content": response.content[0].text})
```

**Conversation management patterns:**
- Truncate or summarize older messages when approaching context limits.
- Use a sliding window: keep the system prompt + last N turns.
- For long sessions, periodically inject a summary message as a user turn.

---

## System Prompt Architecture

System prompts set persistent context. They are more strongly followed than user messages.

```python
system = """You are a senior backend engineer reviewing Python code.

<rules>
- Flag security vulnerabilities with severity ratings (critical/high/medium/low).
- Suggest fixes with code snippets.
- Ignore stylistic preferences unless they impact readability.
- Respond in structured JSON when the user requests it.
</rules>

<context>
Project: FastAPI microservice
Python version: 3.12
Key dependencies: SQLAlchemy 2.0, Pydantic v2
</context>"""
```

**Best practices:**
- Place role definition first, constraints second, context third.
- Use XML tags to delineate sections — Claude parses these reliably.
- Keep system prompts under ~1500 tokens for Haiku; Sonnet/Opus handle longer prompts well.

---

## Tool Use / Function Calling

### Defining Tools

```python
tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a city. Use when the user asks about weather conditions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, e.g. 'San Francisco'",
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature unit. Default: fahrenheit.",
                },
            },
            "required": ["city"],
        },
    }
]
```

### Tool Use Loop

```python
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    tools=tools,
    messages=messages,
)

while response.stop_reason == "tool_use":
    tool_blocks = [b for b in response.content if b.type == "tool_use"]

    # Append assistant's response (contains tool_use blocks)
    messages.append({"role": "assistant", "content": response.content})

    # Execute each tool call and build tool_result blocks
    tool_results = []
    for block in tool_blocks:
        result = execute_tool(block.name, block.input)  # your dispatch function
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": str(result),
        })

    messages.append({"role": "user", "content": tool_results})

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

# Final text response
print(response.content[0].text)
```

**Tool design guidelines:**
- Write descriptions as if instructing the model when to use the tool.
- Keep input schemas simple — flat objects with clear descriptions.
- Return structured data (JSON strings) from tool results, not prose.
- Limit to 20 or fewer tools for best performance; use routing for more.

---

## Streaming Responses

```python
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    messages=messages,
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

# Access full response after stream completes
final_message = stream.get_final_message()
```

### TypeScript Streaming

```typescript
const stream = await client.messages.stream({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  messages,
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}

const finalMessage = await stream.finalMessage();
```

**Streaming with tool use:** Tool use blocks arrive as `content_block_start` (type `tool_use`) followed by `input_json_delta` events. Accumulate the JSON string and parse after `content_block_stop`.

---

## Extended Thinking

For complex reasoning tasks, enable extended thinking to let the model reason before responding.

```python
response = client.messages.create(
    model="claude-opus-4-0520",
    max_tokens=16384,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000,  # max tokens for internal reasoning
    },
    messages=[{"role": "user", "content": "Prove that sqrt(2) is irrational."}],
)

# Response contains thinking blocks (redacted) and text blocks
for block in response.content:
    if block.type == "thinking":
        print(f"[Thinking used {len(block.thinking)} chars]")
    elif block.type == "text":
        print(block.text)
```

**When to use:** Mathematical proofs, multi-step logic, complex code generation, ambiguous problems. Budget 5K-20K thinking tokens depending on complexity. Thinking tokens are billed as output tokens.

---

## Structured Output

### JSON Mode

```python
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system="Respond only with valid JSON. No markdown, no explanation.",
    messages=[{"role": "user", "content": "Extract entities from: 'John Smith works at Acme Corp in NYC.'"}],
)
```

### Prefilled Assistant Response (Guarantees JSON Start)

```python
messages = [
    {"role": "user", "content": "Extract entities as JSON."},
    {"role": "assistant", "content": "{"},  # prefill forces JSON output
]
# Parse: "{" + response.content[0].text
```

### XML-Structured Output

```python
system = """Return results in this format:
<analysis>
  <summary>One-line summary</summary>
  <findings>
    <finding severity="high">Description</finding>
  </findings>
  <recommendation>Action to take</recommendation>
</analysis>"""
```

XML tags are more reliable than JSON for longer, nested outputs. Parse with a lightweight XML parser or regex extraction.

---

## Token Counting and Cost Estimation

### Count Tokens Before Sending

```python
count = client.messages.count_tokens(
    model="claude-sonnet-4-20250514",
    system="Your system prompt.",
    messages=[{"role": "user", "content": "Your message here."}],
    tools=tools,  # optional
)
print(f"Input tokens: {count.input_tokens}")
```

### Cost Calculation (per 1M tokens, as of early 2026)

| Model | Input | Output |
|---|---|---|
| Opus 4 | $15.00 | $75.00 |
| Sonnet 4 | $3.00 | $15.00 |
| Haiku 3.5 | $0.80 | $4.00 |

```python
def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    rates = {
        "claude-opus-4-0520":          (15.0, 75.0),
        "claude-sonnet-4-20250514":    (3.0, 15.0),
        "claude-3-5-haiku-20241022":   (0.80, 4.0),
    }
    input_rate, output_rate = rates[model]
    return (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000
```

**Prompt caching:** Repeated prefixes (system prompt, large context) can be cached. Cached input tokens cost 90% less. Use `cache_control` blocks with `{"type": "ephemeral"}` on content blocks to enable.

```python
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": large_document,
                "cache_control": {"type": "ephemeral"},
            },
            {"type": "text", "text": "Summarize the above document."},
        ],
    }
]
```

---

## Rate Limits and Retries

### Default Rate Limits (vary by tier)

- **Requests per minute (RPM):** 50-4,000 depending on tier and model.
- **Tokens per minute (TPM):** 40K-400K input, 8K-80K output.
- **Tokens per day (TPD):** Varies by tier.

Check response headers: `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `retry-after`.

### Retry Strategy

```python
from anthropic import Anthropic, RateLimitError, APIStatusError
import time

client = Anthropic()

# The SDK has built-in retries (default: 2 retries with exponential backoff).
# Configure:
client = Anthropic(max_retries=3)

# Manual retry for more control:
def call_with_retry(messages, max_retries=3):
    for attempt in range(max_retries + 1):
        try:
            return client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=messages,
            )
        except RateLimitError as e:
            if attempt == max_retries:
                raise
            wait = float(e.response.headers.get("retry-after", 2 ** attempt))
            time.sleep(wait)
        except APIStatusError as e:
            if e.status_code >= 500 and attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
```

### Error Types

| Error | Code | Action |
|---|---|---|
| `RateLimitError` | 429 | Backoff and retry. Respect `retry-after` header. |
| `OverloadedError` | 529 | API overloaded. Retry with longer backoff. |
| `APIStatusError` (500+) | 5xx | Transient. Retry with exponential backoff. |
| `AuthenticationError` | 401 | Invalid API key. Do not retry. |
| `BadRequestError` | 400 | Malformed request. Fix payload. |
| `APIConnectionError` | — | Network issue. Retry after checking connectivity. |

---

## Batches API (Async Bulk Processing)

For non-latency-sensitive workloads (evaluations, data processing), use the Batches API for 50% cost reduction.

```python
batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": f"item-{i}",
            "params": {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": text}],
            },
        }
        for i, text in enumerate(texts)
    ]
)

# Poll for completion
while True:
    status = client.messages.batches.retrieve(batch.id)
    if status.processing_status == "ended":
        break
    time.sleep(30)

# Stream results
for result in client.messages.batches.results(batch.id):
    print(result.custom_id, result.result.message.content[0].text)
```

---

## Key Patterns Summary

1. **Always set `max_tokens` explicitly** — there is no default that maximizes output.
2. **Use system prompts for persistent instructions**, user messages for per-request context.
3. **Prefer streaming** for any user-facing response to improve perceived latency.
4. **Use prompt caching** for repeated large contexts (documents, codebases).
5. **Count tokens before sending** to avoid truncation and estimate cost.
6. **Handle tool use in a loop** — the model may call multiple tools or chain calls.
7. **Use extended thinking for hard problems** — it measurably improves accuracy on reasoning tasks.
8. **Use the Batches API** for offline workloads to halve costs.
