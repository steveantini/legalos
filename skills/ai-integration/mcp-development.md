# MCP Server Development

```
Version:        1.0.0
Last Updated:   2026-03-06
Applicability:  Building MCP (Model Context Protocol) servers for Claude Code, Claude Desktop, or other MCP-compatible clients
Dependencies:   Python: mcp[cli] >=1.0.0 (FastMCP) | TypeScript: @modelcontextprotocol/sdk >=1.0.0
```

---

## When to Build an MCP Server

**Build an MCP server when:**
- You want Claude to interact with an external system (database, API, file system, SaaS tool).
- You need to expose domain-specific data as context that Claude can query on demand.
- You have an internal tool that multiple Claude users/agents should access.
- You want to replace a custom tool-use loop with a standardized protocol.

**Don't build an MCP server when:**
- A simple function call in your application code suffices (no need for inter-process protocol).
- The integration is a one-off script, not a reusable capability.
- An existing MCP server already covers your use case (check the MCP server registry).

**MCP vs. direct tool use:** MCP is a protocol for tool/resource discovery and invocation between processes. Direct tool use (Anthropic API `tools` parameter) runs within your application. Use MCP when the tool provider and the AI client are separate concerns.

---

## MCP Core Concepts

| Concept | Description |
|---|---|
| **Server** | Process that exposes tools, resources, and prompts over the MCP protocol |
| **Tool** | A function the model can invoke with arguments, returns a result |
| **Resource** | Read-only data the model can access (like a file or database record) |
| **Prompt** | A reusable prompt template the server can offer to clients |
| **Transport** | Communication layer: `stdio` (default for local), `SSE` (HTTP streaming), `streamable-http` |

---

## Python: FastMCP

FastMCP is the high-level Python framework for building MCP servers.

### Minimal Server

```python
# server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-tools")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers together."""
    return a + b

@mcp.tool()
def search_users(query: str, limit: int = 10) -> list[dict]:
    """Search for users by name or email.

    Args:
        query: Search term to match against user name or email.
        limit: Maximum number of results to return. Default: 10.
    """
    # Your database logic here
    return db.search_users(query, limit=limit)
```

### Running the Server

```bash
# Stdio transport (for Claude Code / Claude Desktop)
python server.py

# Or with the MCP CLI
mcp run server.py

# SSE transport (for remote/HTTP access)
mcp run server.py --transport sse --port 8080

# Development mode (inspector UI for testing)
mcp dev server.py
```

### Tools with Complex Types

```python
from pydantic import BaseModel, Field

class CreateTicketInput(BaseModel):
    title: str = Field(description="Short title for the ticket")
    description: str = Field(description="Detailed description of the issue")
    priority: str = Field(
        description="Priority level",
        enum=["low", "medium", "high", "critical"],
    )
    assignee: str | None = Field(default=None, description="Username to assign to")

@mcp.tool()
def create_ticket(input: CreateTicketInput) -> dict:
    """Create a new support ticket in the issue tracker."""
    ticket = ticket_system.create(
        title=input.title,
        description=input.description,
        priority=input.priority,
        assignee=input.assignee,
    )
    return {"id": ticket.id, "url": ticket.url, "status": "created"}
```

### Resources

Resources expose read-only data that Claude can pull into context.

```python
@mcp.resource("config://app")
def get_app_config() -> str:
    """Return the current application configuration."""
    return json.dumps(load_config(), indent=2)

@mcp.resource("users://{user_id}/profile")
def get_user_profile(user_id: str) -> str:
    """Return a user's profile data."""
    user = db.get_user(user_id)
    return json.dumps(user.to_dict())

# Dynamic resource listing
@mcp.resource("docs://{path}")
def get_document(path: str) -> str:
    """Read a document from the knowledge base."""
    return knowledge_base.read(path)
```

### Prompts

```python
@mcp.prompt()
def review_code(language: str, code: str) -> str:
    """Generate a code review prompt."""
    return f"""Review the following {language} code for:
- Security vulnerabilities
- Performance issues
- Best practice violations

```{language}
{code}
```"""
```

### Context and Lifespan

```python
from contextlib import asynccontextmanager
from mcp.server.fastmcp import FastMCP, Context

@asynccontextmanager
async def app_lifespan(server: FastMCP):
    """Initialize and clean up shared resources."""
    db = await Database.connect(os.environ["DATABASE_URL"])
    try:
        yield {"db": db}
    finally:
        await db.disconnect()

mcp = FastMCP("my-tools", lifespan=app_lifespan)

@mcp.tool()
async def query_data(ctx: Context, sql: str) -> str:
    """Run a read-only SQL query."""
    db = ctx.request_context.lifespan_context["db"]
    results = await db.fetch(sql)
    return json.dumps(results)
```

### Error Handling

```python
from mcp.server.fastmcp import Context

@mcp.tool()
async def deploy_service(ctx: Context, service_name: str, version: str) -> str:
    """Deploy a service to the staging environment."""
    try:
        result = await deployment.deploy(service_name, version)
        return json.dumps({"status": "success", "deploy_id": result.id})
    except deployment.ServiceNotFoundError:
        # Return error as content — the model sees this and can respond to the user
        return json.dumps({"status": "error", "message": f"Service '{service_name}' not found"})
    except deployment.DeploymentError as e:
        # For tool execution errors, raise or return descriptive error
        ctx.error(f"Deployment failed: {e}")
        return json.dumps({"status": "error", "message": str(e)})
```

---

## TypeScript: MCP SDK

### Minimal Server

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-tools",
  version: "1.0.0",
});

server.tool(
  "search_users",
  "Search for users by name or email",
  {
    query: z.string().describe("Search term"),
    limit: z.number().default(10).describe("Max results"),
  },
  async ({ query, limit }) => {
    const users = await db.searchUsers(query, limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(users, null, 2),
        },
      ],
    };
  }
);

server.resource(
  "config://app",
  "Application configuration",
  async () => ({
    contents: [
      {
        uri: "config://app",
        text: JSON.stringify(getConfig(), null, 2),
        mimeType: "application/json",
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

### Project Setup

```json
// package.json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "bin": { "my-mcp-server": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.0.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

### SSE / HTTP Transport (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const server = new McpServer({ name: "my-tools", version: "1.0.0" });

// ... register tools ...

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  // Handle incoming messages from client
  await transport.handlePostMessage(req, res);
});

app.listen(8080);
```

---

## Tool Design Principles

### Naming

- Use `snake_case` for tool names.
- Verb-noun pattern: `search_users`, `create_ticket`, `get_config`.
- Be specific: `search_jira_issues` not `search`.

### Descriptions

The description is what the model uses to decide when to call the tool. Write it as an instruction.

```
Good:  "Search the company's Jira instance for issues matching a query. Use when the user asks about bugs, tickets, or tasks."
Bad:   "Jira search function"
```

### Input Schema

- Use clear `description` fields on every parameter.
- Set sensible defaults for optional parameters.
- Use `enum` for constrained string values.
- Keep the schema flat when possible — nested objects are harder for models.

### Output Format

- Return structured JSON strings.
- Include enough context for the model to form a useful response.
- For errors, return descriptive messages the model can relay to the user.
- For large results, paginate or summarize — don't return unbounded data.

```python
# Good: structured, bounded
@mcp.tool()
def search_logs(query: str, limit: int = 20) -> str:
    """Search application logs. Returns matching log entries."""
    results = log_store.search(query, limit=limit)
    return json.dumps({
        "count": len(results),
        "total_matches": log_store.count(query),
        "entries": [
            {"timestamp": r.ts, "level": r.level, "message": r.message}
            for r in results
        ],
    })
```

### Tool Count Guidelines

- **1-10 tools:** Ideal. Models handle these reliably.
- **10-20 tools:** Fine with good descriptions. Group related tools logically.
- **20+ tools:** Consider splitting into multiple MCP servers, or use a routing/dispatch tool.

---

## Testing Locally

### MCP Inspector

The inspector provides a web UI for testing your server interactively.

```bash
# Python
mcp dev server.py

# TypeScript
npx @modelcontextprotocol/inspector node dist/index.js
```

Opens a browser UI where you can:
- See all registered tools, resources, and prompts.
- Invoke tools with test arguments.
- Inspect request/response payloads.

### Programmatic Testing

```python
# test_server.py
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

@pytest.fixture
async def client():
    server_params = StdioServerParameters(
        command="python",
        args=["server.py"],
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session

@pytest.mark.asyncio
async def test_search_users(client):
    result = await client.call_tool("search_users", {"query": "alice", "limit": 5})
    data = json.loads(result.content[0].text)
    assert len(data) <= 5
    assert all("alice" in u["name"].lower() for u in data)

@pytest.mark.asyncio
async def test_list_tools(client):
    tools = await client.list_tools()
    tool_names = [t.name for t in tools.tools]
    assert "search_users" in tool_names
    assert "create_ticket" in tool_names
```

---

## Integrating with Claude Code

### Configuration

Add to your project's `.mcp.json` (project-scoped) or `~/.claude/claude_code_config.json` (global):

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "python",
      "args": ["/absolute/path/to/server.py"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "API_KEY": "..."
      }
    }
  }
}
```

For TypeScript:
```json
{
  "mcpServers": {
    "my-tools": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

For remote servers (SSE):
```json
{
  "mcpServers": {
    "my-tools": {
      "url": "http://localhost:8080/sse"
    }
  }
}
```

### Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "python",
      "args": ["/absolute/path/to/server.py"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

---

## Deploying MCP Servers

### As a Standalone Process (Stdio)

For local use with Claude Code/Desktop. The client manages the server process lifecycle.

```bash
# Ensure dependencies are installed
pip install -e /path/to/my-mcp-server
# or
npm install -g /path/to/my-mcp-server
```

### As an HTTP Service (SSE / Streamable HTTP)

For shared/remote access. Deploy as any web service.

```dockerfile
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["python", "server.py", "--transport", "sse", "--port", "8080"]
```

**Security considerations for remote MCP servers:**
- Always run behind authentication (API key, OAuth).
- Use HTTPS in production.
- Validate and sanitize all tool inputs.
- Apply rate limiting.
- Log all tool invocations for audit.

### As an npm / PyPI Package

Distribute your MCP server as an installable package so users can run it directly.

```bash
# Users install and configure
pip install my-mcp-tools
# Then reference in config:
# "command": "my-mcp-tools"
```

---

## Common Patterns

### Database Explorer

```python
@mcp.tool()
def list_tables() -> str:
    """List all tables in the database."""
    tables = db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    return json.dumps([r["table_name"] for r in tables])

@mcp.tool()
def describe_table(table_name: str) -> str:
    """Get the schema of a database table."""
    # Sanitize table name to prevent injection
    if not table_name.isidentifier():
        return json.dumps({"error": "Invalid table name"})
    columns = db.execute(f"""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '{table_name}'
    """)
    return json.dumps(columns)

@mcp.tool()
def query(sql: str) -> str:
    """Execute a read-only SQL query. Only SELECT statements are allowed."""
    sql_stripped = sql.strip().upper()
    if not sql_stripped.startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed"})
    results = db.execute(sql)
    return json.dumps(results[:100])  # Cap results
```

### API Wrapper

```python
import httpx

@mcp.tool()
async def github_search_issues(repo: str, query: str, state: str = "open") -> str:
    """Search GitHub issues in a repository.

    Args:
        repo: Repository in 'owner/name' format.
        query: Search query for issue title/body.
        state: Filter by state: 'open', 'closed', or 'all'.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/search/issues",
            params={
                "q": f"{query} repo:{repo} state:{state} type:issue",
                "per_page": 10,
            },
            headers={"Authorization": f"token {os.environ['GITHUB_TOKEN']}"},
        )
        resp.raise_for_status()
        items = resp.json()["items"]
        return json.dumps([
            {"number": i["number"], "title": i["title"], "state": i["state"], "url": i["html_url"]}
            for i in items
        ])
```

### File System Access (Scoped)

```python
from pathlib import Path

ALLOWED_ROOT = Path("/data/project")

@mcp.tool()
def read_file(path: str) -> str:
    """Read a file from the project directory."""
    target = (ALLOWED_ROOT / path).resolve()
    if not target.is_relative_to(ALLOWED_ROOT):
        return json.dumps({"error": "Access denied: path outside project directory"})
    if not target.exists():
        return json.dumps({"error": f"File not found: {path}"})
    return target.read_text()

@mcp.tool()
def list_files(directory: str = ".") -> str:
    """List files in a project directory."""
    target = (ALLOWED_ROOT / directory).resolve()
    if not target.is_relative_to(ALLOWED_ROOT):
        return json.dumps({"error": "Access denied"})
    files = [
        {"name": f.name, "type": "dir" if f.is_dir() else "file", "size": f.stat().st_size}
        for f in sorted(target.iterdir())
        if not f.name.startswith(".")
    ]
    return json.dumps(files)
```

---

## Debugging Tips

1. **Check stderr** — MCP servers communicate over stdout (stdio transport). All logging must go to stderr.
   ```python
   import sys
   print("Debug info", file=sys.stderr)
   ```

2. **Use the inspector** — `mcp dev server.py` gives you a UI to test tools interactively.

3. **Validate JSON schemas** — Malformed input schemas cause silent failures. Test tool registration with `list_tools`.

4. **Check transport compatibility** — Claude Code uses stdio by default. Claude Desktop also uses stdio. Remote clients use SSE.

5. **Environment variables** — Ensure env vars are passed through the MCP config. They don't inherit from your shell by default.

6. **Restart after changes** — Claude Code caches the MCP server connection. Restart the server (or Claude Code) after code changes.
