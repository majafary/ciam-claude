# Agentic AI & Software Delivery: Learnings from Shield

## Technology Leadership Team Presentation

---

## SLIDE 1: Title Slide

# Agentic AI & Software Delivery

## Learnings from Shield

### Executive Summary

We are actively exploring the use of Claude within the Shield project, with encouraging early results. Together with Claude, we have developed a fully functional CIAM-UI component in an open-source sandbox environment. Work that might traditionally take weeks or months was completed in just hours and days.

We are now assessing how this AI-generated code can be applied to Shield's production release. Along the way, we have gained valuable insights into how agentic AI can streamline development, increase efficiency, and signal an important shift in how software is created.

**In this deck, we will share:**

- Early learnings from our work with Claude
- Perspectives on how agentic AI can reshape the software development lifecycle
- Opportunities for evolving our development ecosystem with this technology

Agentic AI represents a promising inflection point, and by learning together, we can shape how it best supports our projects and future growth.

---

## SLIDE 2: What Makes Claude Different

### Three Development Paradigms

| Basic Prompting             | →   | Workflows                     | →   | Agentic AI                                 |
| --------------------------- | --- | ----------------------------- | --- | ------------------------------------------ |
| "Generate a login function" |     | Orchestrated predefined steps |     | Goal + Tools + Freedom to plan and execute |
| Simple request/response     |     | LangChain, frameworks         |     | Claude decides next steps                  |

### Key Differentiator

- **Claude decides next steps** based on situation, not predefined scripts
- Optimized for coding - understands code flow and logs better than general LLMs

### Human-like Problem Solving

**Example behavior:** Encounters error → adds debug logs → creates test utility → identifies root cause

- Turns on verbose logs when debugging
- Adds temporary debug statements to detect issues
- Creates utilities to help investigate
- Acts as pair programmer, may ask developer to run tests or check logs

---

## SLIDE 3: The Paradigm Shift

### We're at an inflection point

**Moving from CI/CD automation to Continuous Intelligence**

### The Core Shift

- **CI/CD:** Automation of predefined steps
- **Continuous Intelligence:** AI infuses planning, coding, testing, security, operations
- **Not automation added to CI/CD — this is a new operating model**

### Five Foundational Elements

1. **Workflows:** Predefined steps controlling how prompts/responses flow
2. **Agents:** The brain deciding what to do to achieve goals
3. **Commands:** Deterministic actions the brain chooses (build, test, deploy)
4. **Hooks:** Injection points for custom behavior (pre-commit, post-build, etc.)
5. **MCP/Integrations:** Standardized adapters to tools, data, systems

**What This Enables:** These elements combine to create self-improving systems that get smarter with each cycle

---

## SLIDE 4: The Vision - Continuous Intelligence Pipeline

### The Destination

> "Imagine AI agents that plan sprints, scaffold code, generate tests, run performance and security scans, orchestrate canaries, and feed every outcome back to improve the next cycle — all under developer control and policy."

### The Evolution

**Phase 1 (Now):** Experimental - select teams, greenfield/open source projects

**Phase 2 (Q1-Q2):** Expanded access - Ally machines, existing code, basic prompting

**Phase 3 (Q3-Q4):** Pattern emergence - project/org/BU-level patterns (agents, commands, hooks, integrations)

**Phase 4 (Year 2):** Standardization - common patterns rollout, reduced duplication

**Phase 5 (Year 2-3):** CIP emergence - intelligent workflows across SDLC

**Phase 6 (Year 3+):** Mature CIP - warp speed, advanced agentic AI

### The Constant

Humans remain the final governors at every phase. Developers design and steer; AI accelerates execution.

_Timeline is illustrative and will evolve based on organizational readiness and learnings_

---

## SLIDE 5: What This Looks Like in Practice

### Real Example: Database Promotion Workflow

```
Agent: /sc:promote-db

Promote {{DB_NAME}} in {{REGION}} to standalone:
- Retrieve DB credentials from secrets manager {{SECRETS_MANAGER_ARN}}
- Verify current DB configuration via AWS CLI
- Execute standalone conversion using AWS Cloud Console
- Update infrastructure documentation in {{CONFIG_REPO}}
- Run post-promotion validation tests
- Document changes in {{CHANGE_LOG}}
```

**What's Actually Happening:**

- **MCP Integration:** AWS Secrets Manager, Console/APIs
- **Commands:** AWS CLI execution, validation tests
- **Hooks:** Pre-promotion checks, post-promotion validation
- **Integrations:** Git repos, JIRA, change logs

### How It Becomes an Organizational Asset

- **v1.0:** Basic promotion steps
- **v1.5:** Added rollback, enhanced error handling
- **v2.0:** Compliance checks, automated documentation
- **Version controlled** - everyone uses safe, approved method

### Human Oversight Evolution

**Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6**

**Very High Oversight ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━→ Governed/Minimal**

_Autonomous with human on the steering wheel - oversight reduces as patterns mature_

---

## SLIDE 6: Enabling the Organization

### Cultural Evolution Needed

- **Evangelization & Upskilling:** Help teams understand agentic patterns, build capability
- **Encouraging & Incentivizing:** Reward pattern creation and sharing
- **Helping Teams See the Vision:** Share learnings, document success patterns
- **Recognition:** This is a journey, evolutionary process, not a switch-flip

### Developer Empowerment Model

- **Individual Access Enables Learning:** Developers build capability by using tools directly
- **Governance Through Standards, Not Gatekeeping:** Approved patterns, version-controlled agents, code review gates
- **The Balance:** Enable and encourage more than restrict

### The Path Forward

**Crawl (Current):** Sandbox projects, pattern documentation, learning from open source

**Walk (Near-term):** Controlled rollout, governance framework, building custom patterns

**Run (Future):** Broad adoption with standardized practices, mature CIP

### What to Measure

- Velocity improvements (time to delivery)
- Quality metrics (defect rates, test coverage)
- Developer satisfaction and capability growth
- **Not:** Headcount reduction

---

## APPENDIX A1: Shield Project Deep Dive

### Architecture

```
┌─────────────────────┐    ┌─────────────────────┐
│   Storefront Web    │    │Account Servicing    │
│     (Port 3000)     │    │   Web (Port 3001)   │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          │    ┌─────────────────┐   │
          └────│   CIAM UI SDK   │───┘
               │  (npm package)  │
               └─────────┬───────┘
                         │
                ┌────────▼─────────┐
                │   CIAM Backend   │
                │   (Port 8080)    │
                └──────────────────┘
```

### Development Process

- Started with detailed SRS document
- Defined business requirements, user/system flows upfront
- Researched architectural constraints using AI tools
- Left minimal room for hallucination by being detailed
- Iteratively course-corrected through prompts
- Claude orchestrated development across all 4 applications

### Key Results

- Detailed requirements upfront = Claude produces desired output in first pass
- Components developed are reusable across projects
- Weeks/months of work compressed to hours/days
- Currently evaluating generated code for Shield production release

---

## APPENDIX A2: Technical Patterns & Ecosystem

### The .claude Ecosystem

**Enterprise Level (/org/.claude/):**

- /sc:deploy-to-prod - Standard production deployment with Ally governance
- /sc:security-scan - OWASP + Ally-specific security policies
- /sc:promote-db - Database promotion using Metronome SDK, Ally Terraform modules

**BU/Team Level (/team/.claude/):**

- /sc:ciam-integration - CIAM-specific patterns
- /sc:api-gateway-setup - Team's API gateway patterns

**Project Level (/project/.claude/):**

- /sc:shield-architecture - Shield-specific architectural patterns
- Project-specific test patterns, deployment configs

### Agents & Template Prompts

- **Agents = Collections of optimized + template prompts**
- Template example: "Promote {{DB}} in {{REGION}} using {{ORG_TERRAFORM_MODULES}}"
- Version controlled as organizational assets
- Invoked via slash commands in Claude sessions

### Open Source Patterns

- SuperClaude Framework
- AWS Advanced Claude Code Patterns
- Community learnings and enterprise templates

---

## APPENDIX A3: Considerations & Open Questions

### Platform Integration

- Bedrock feature parity with external Claude
- MCP support availability and capabilities
- Claude Code equivalence on Bedrock
- Microsoft AI, Bedrock, Claude - coexistence strategy (TBD)

### Governance & Security

- PII and IP protection mechanisms
- Code ownership and licensing implications
- Audit trail and provenance tracking
- Compliance frameworks for banking environment

### Organizational Readiness

- Skill gaps and training needs
- Cultural barriers to adoption
- Integration with existing tooling
- Change management approach

### Risk Mitigation

- Course correction approaches when Claude gets it wrong
- Failure modes and recovery patterns
- Human oversight requirements at each phase
- Rollback and version control strategies for AI patterns

---

## Instructions for Google Slides Import

1. **Create new Google Slides presentation**
2. **Use "Import slides" or copy/paste this content**
3. **Apply formatting:**

   - Use title slides for each "SLIDE X" section
   - Use bullet points for lists
   - Use text boxes for quotes and code blocks
   - Apply consistent color scheme (suggest purple/blue gradient for headers)

4. **Add visuals:**

   - Slide 2: Create 3-box diagram showing paradigm progression
   - Slide 3: Create interconnected diagram of 5 foundational elements
   - Slide 4: Create circular lifecycle diagram (see planning doc for details)
   - Slide 5: Use gradient arrow for oversight evolution
   - Appendix A1: Keep architecture as monospaced text or create proper diagram

5. **Design tips:**

   - Use slide master for consistent headers
   - Purple (#667eea) and darker purple (#764ba2) for accent colors
   - Keep backgrounds clean (white or light gray)
   - Use icons for agents, workflows, integrations where appropriate

6. **Export to PowerPoint:**
   - File → Download → Microsoft PowerPoint (.pptx)
