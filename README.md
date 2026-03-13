# claude-templates

A portable library of Claude Code skills and project configuration templates.

Start new projects with battle-tested conventions and Claude Code skill files instead of building project context from scratch every time.

## Usage

### Project configuration

1. Copy `CLAUDE.template.md` into your new project root as `CLAUDE.md`
2. Fill in the blanks — each section has inline comments explaining what to provide
3. Claude Code reads `CLAUDE.md` automatically at session start

### Skills

1. Browse `skills/` for relevant skill categories
2. Copy the ones you need into your project's `.claude/skills/` directory
3. Customize any project-specific details (the templates are intentionally generic)

## Folder Structure

```
claude-templates/
├── CLAUDE.template.md              # Project configuration template
├── skills/
│   ├── ai-integration/             # LLM APIs, MCP servers, prompt engineering
│   │   ├── anthropic-api.md
│   │   ├── mcp-development.md
│   │   ├── model-abstraction.md
│   │   └── prompt-engineering.md
│   ├── backend/                    # APIs, databases, server patterns
│   │   ├── database-patterns.md
│   │   ├── python-api.md
│   │   └── supabase.md
│   ├── design/                     # UI/UX, responsive design, writing
│   │   ├── responsive-design.md
│   │   ├── ui-patterns.md
│   │   └── ux-writing.md
│   ├── devops/                     # CI/CD, deployment, environments
│   │   ├── ci-cd.md
│   │   ├── environment-management.md
│   │   └── vercel-deployment.md
│   ├── frontend/                   # React, Next.js, Tailwind, a11y
│   │   ├── nextjs.md
│   │   ├── react-patterns.md
│   │   ├── tailwind.md
│   │   └── web-accessibility.md
│   ├── product-ops/                # Analytics, cost tracking, observability
│   │   ├── analytics.md
│   │   ├── cost-tracking.md
│   │   ├── eval-framework.md
│   │   └── observability.md
│   └── security/                   # API, backend, DB, frontend, infra security
│       ├── api-security.md
│       ├── backend-security.md
│       ├── database-security.md
│       ├── frontend-security.md
│       └── infra-security.md
└── README.md
```

## Skill Template Sync Convention

These templates are living documents. At the end of every phase of every project:

1. **Review** project-specific skill files that were referenced or updated
2. **Extract** generalized lessons — strip project-specific details, keep the universal best practice
3. **Update** the corresponding portable template in this repo
4. **Create** new templates when a project produces a skill with no existing counterpart
5. **Version bump** — update the version and "Last updated" date on any modified skill file

This keeps the templates continuously improving across all projects.

## License

Private. Do not distribute without permission.
