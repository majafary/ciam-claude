# Executive Summary

We are actively exploring the use of Claude within the Shield project, with encouraging early results. Together with Claude, we have developed a fully functional CIAM-UI component in an open-source sandbox environment. Work that might traditionally take weeks or months was completed in just hours and days.

We are now assessing how this AI-generated code can be applied to Shield's production release. Along the way, we have gained valuable insights into how agentic AI can streamline development, increase efficiency, and signal an important shift in how software is created.

In this deck, we will share:

- Early learnings from our work with Claude
- Perspectives on how agentic AI can reshape the software development lifecycle
- Opportunities for evolving our development ecosystem with this technology

Agentic AI represents a promising inflection point, and by learning together, we can shape how it best supports our projects and future growth.

---

# Claude Usage Patterns

Developers interact with LLMs in different ways:

- **Basic prompting** - Simple request and response
- **Creating and running workflows** - A manually created orchestration of predefined steps (using your homegrown or open source / third party framework e.g. LangChain)
- **Agentic Prompting** - Goal + tools + freedom to plan steps and execute steps not predefined

---

# How is Claude Different

- Claude's power lies in the **Agentic Prompting** technique as it decides on its own the next set of steps based on the situation
- Claude is also optimized for coding. The LLMs are fine tuned to understand code flow and logs better
- Claude can simulate workflow and agent-like behavior using its own reasoning process. This is where your prompt matters
- Claude's coding style exhibits human-like behavior. When it runs into tricky situations, it may decide to:
  - Turn on verbose logs
  - Add debug logs temporarily to detect the issue
  - Create a utility to help debug
  - Act as a pair programmer and may ask you to take action (e.g. running a functional test, copying a log from the console it may not have access to)

**Example:** Encounters error → adds debug logs → creates test utility → identifies root cause

---

# A Paradigm Shift

AI has already changed the way we build software but Vibe Coding is just the start.

**"We are entering a new era where software delivery is an ongoing, adaptive, intelligent process — powered by agentic AI, guided by humans, spanning the entire lifecycle."**

## From CI/CD to Continuous Intelligence

- **Not just automation added to CI/CD — this is a new operating model**
- Agentic AI augments every stage of the Software Development and DevOps lifecycle and it will transform the way we work even further
- Claude's architecture and new open source toolsets are evolving at a rapid pace. These patterns and tools include:
  - **Workflows** = the predefined steps that control how prompts and responses flow
  - **Agents** = the brain that decides what to do to achieve a goal
  - **Commands** = the deterministic actions the brain can choose to take (e.g. a build command)
  - **Hooks** = the places in the flow to inject custom behavior or intercept things
  - **MCP and Integrations** = adapters for Claude to integrate with tools, data, and systems in a standardized way

This isn't about picking another LLM or AI tool — it's about a cultural shift: adopting agentic AI patterns, practices and infusing them into the very core of how we plan, build, and deliver software.

---

# Vision: Continuous Intelligence Pipeline

## The Destination

**"CIDP is not just automation added to CI/CD — it is a new operating model. Imagine AI agents that plan sprints, scaffold code, generate tests, run performance and security scans, orchestrate canaries, and then feed every outcome back to improve the next cycle — all under developer control and policy. We make every action a typed, versioned command, enforce validators at hooks, and keep humans as the final governors. The result: deterministic, repeatable delivery with consistent quality, and developers freed to design and govern the process rather than babysit it."**

## Core Principles

- **Continuous Intelligence, not automation** → AI infuses planning, coding, testing, security, and operations
- **Agentic workflows, not static pipelines** → AI agents plan, execute, and adapt within governed workflows
- **Human-guided, AI-augmented** → Developers design and steer; AI accelerates execution
- **Hooks, commands, and integrations** → Standardized contracts ensure predictable, deterministic results
- **Learning systems, not one-offs** → Every cycle feeds insights back, making the pipeline smarter

## Visual Metaphor

- **Center:** "CIP Platform" (with orchestrator, agent manager, governance, observability)
- **Circle around it:** Plan → Design → Implement → Build/CI → Integration Testing → Performance & Security → Release & Rollout → Operate & Learn → back to Plan
- **At each phase:** AI Agent + Workflow icons
- **Between phases:** Hooks
- **Outside connections:** Integrations (Jira, Git, CI, Security Scanners, Monitoring)
- **Footer line:** "Workflows + Agents + Hooks + Commands + Integrations = deterministic, repeatable software delivery"

## The Evolution: Six-Phase Journey

**Phase 1 (Now - Current):** Experimental

- Select approved teams, open source/greenfield projects only
- Claude used for new capabilities, proof of concepts

**Phase 2 (Q1-Q2):** Expanded Access

- Claude available on Ally machines
- Teams analyze and update existing code
- Mostly basic prompting level, learning patterns

**Phase 3 (Q3-Q4):** Pattern Emergence

- Teams build project/org/BU-level patterns
- Development of custom agents, commands, hooks, integrations
- Moving beyond basic prompting

**Phase 4 (Year 2):** Standardization

- Common patterns rolled out across organization
- Reduced duplicative work
- Teams adopting proven patterns

**Phase 5 (Year 2-3):** CIP Emergence

- Continuous Intelligence Pipeline takes shape
- Intelligent workflows across full SDLC
- AI-infused planning, testing, security, operations

**Phase 6 (Year 3+):** Mature CIP

- Pipelines fully mature
- "Warp speed" with advanced Agentic AI
- Self-improving, learning systems

**The Constant Across All Phases:** Humans remain the final governors at every phase. Every action is typed, versioned, validated. Developers design and steer; AI accelerates execution.

_Timeline is illustrative and will evolve based on organizational readiness and learnings_

---

# What Does This Look Like In Practice

## Engineered Deterministic Prompts

- Prompts seem like natural English but there is a science
- Identify frequently used prompts, and refined over-time to direct Claude's behavior
- Templatize prompts for fixed and variable content

## Real Example: Database Promotion Workflow

**The Agent (`/sc:promote-db`):**

```
Promote {{DB_NAME}} in {{REGION}} to standalone:
- Retrieve DB credentials from secrets manager {{SECRETS_MANAGER_ARN}}
- Verify current DB configuration via AWS CLI
- Execute standalone conversion using AWS Cloud Console
- Update infrastructure documentation in {{CONFIG_REPO}}
- Run post-promotion validation tests
- Document changes in {{CHANGE_LOG}}
```

**What's Actually Happening:**

- **MCP Integration:** Connects to AWS Secrets Manager for credentials, interacts with AWS Console/APIs
- **Commands:** Execute AWS CLI commands, run validation tests
- **Hooks:** Pre-promotion checks (validate backup exists), post-promotion validation
- **Integrations:** Updates Git repos, JIRA tickets, change logs

**How It Becomes Deterministic & An Organizational Asset:**

- **Version Evolution:**
  - v1.0: Basic promotion steps
  - v1.5: Added rollback capability, enhanced error handling
  - v2.0: Added compliance checks, automated documentation
- **Version Controlled:** Every refinement tracked like code
- **Organizational Benefit:** Everyone uses the safe, approved method. No manual errors. Patterns improve over time.

## The .claude Ecosystem

**$PROJECT_ROOT/.claude.md** - A special file that Claude automatically pulls into context and includes in Claude's prompts

Example content:

- **Bash commands:**
  - `npm run build`: Build the project
  - `npm run typecheck`: Run the typechecker
- **Code style:**
  - Use ES modules (import/export) syntax, not CommonJS (require)
  - Destructure imports when possible (e.g. import { foo } from 'bar')
- **Workflow:**
  - Be sure to typecheck when you're done making a series of code changes
  - Prefer running single tests, and not the whole test suite, for performance

**$USER_HOME/.claude folder** - This is where your Org/BU/Team level agents, commands, hooks and integrations are stored

**$PROJECT_ROOT/.claude folder** - This is where your project level agents, commands, hooks and integrations are stored

- Core files and utility functions
- Code style guidelines
- Testing instructions
- Repository etiquette (e.g., branch naming, merge vs. rebase, etc.)
- Developer environment setup (e.g., pyenv use, which compilers work)
- Any unexpected behaviors or warnings particular to the project
- Other information you want Claude to remember

## Agents, Commands, Hooks, and Integrations

**Agents** = Collections of optimized prompts + template prompts (version controlled)

- Template prompts use variables: `"Promote {{DATABASE}} in {{REGION}} using {{ORG_TERRAFORM_MODULES}}"`
- Invoked via slash commands (e.g., `/sc:brainstorming`, `/sc:promote-db`)
- Currently using open source agents from SuperClaude (like `/sc:brainstorming` for requirements refinement)
- Vision: Build Ally-specific custom agents for organizational workflows

**Example Hierarchy:**

- **Enterprise Level** (`/org/.claude/`): `/sc:deploy-to-prod`, `/sc:security-scan`, `/sc:promote-db`
- **BU/Team Level** (`/team/.claude/`): `/sc:ciam-integration`, `/sc:api-gateway-setup`
- **Project Level** (`/project/.claude/`): `/sc:shield-architecture`, project-specific patterns

**Commands** = Deterministic actions defined in frameworks (build, test, deploy)

**Hooks** = Trigger points for custom behavior (pre-commit, post-build, on-error, etc.)

**MCP Integrations** = Standardized connectors to tools, data, and systems

## Human Oversight Evolution

As patterns mature and systems become more deterministic, human oversight reduces:

**Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6**
**Very High Oversight ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━→ Governed/Minimal**

Think of it as autonomous with human on the steering wheel. Not about removing humans - about elevating their role from execution to governance. This is an evolutionary process. More human oversight is needed in the near term as we refine and version control Claude docs, templates, agent configurations, command and integration configurations to make it more deterministic.

## Open Source Ecosystem

Open source collection of Claude code patterns that enable using Claude in more advanced ways:

- **SuperClaude** - https://github.com/SuperClaude-Org/SuperClaude_Framework
- **Anthropic-on-AWS Advanced Claude Code Patterns** - https://github.com/aws-samples/anthropic-on-aws/tree/main/advanced-claude-code-patterns

---

# Using Claude on Shield Project

- Using Claude we were able to develop a piece of software in days vs what would have taken many weeks
- My learning with Claude is that the combination of models optimized for software development with Agentic tooling is very powerful
- Claude can interact with other services, tail outputs, loop through issues to resolve then progressively improve implementation
- It is a leap from hand coding and basic prompting. Claude enables developers to feel more empowered. Challenges are easier to overcome. Cognitive burden of learning new tech or treading unfamiliar waters is reduced. Barrier to entry is significantly reduced. It's easier to make progress quickly. But you need to know the code it is developing. It will be important to run detailed regression tests. How do you ensure your application is not breaking? Claude can help create, and it can run regression suites.

## The Process

- I started with creating an SRS document. I drafted my business requirements in a list and my expectation of how my user and system flow will work
- I researched the architectural and design concerns upfront using Ally AI and Claude.ai and captured into a laundry list of requirements
- I even used AI tools to beef up the requirement set
- I tried to define everything upfront trying to leave less for Claude to assume and hallucinate about
- There were areas where I myself wasn't sure so I left those to Claude to get its approach and then retroactively course correct. I had to do that a lot
- I had to tweak the implementation through prompts to match my specific architectural requirements
- I can reuse a lot of the developed code components
- Being detailed upfront helped ensure Claude understood my constraints and largely produced what I was looking for in the first pass

## Architecture Built

Using Claude I am able to experiment with implementing new patterns and implement proofs of concepts much faster. Because generating code using Claude is fast and easy, I am able to simulate the constraints that apply at my organization outside of the environment (again being very cautious about keeping it non org contextual and purely at a technical problem level) and build code in that environment.

As an example, one of our project requirements is to develop a close to Production CIAM UI SDK. Claude helped me develop this code and also standup stub applications that interact with the SDK. In a sandbox environment Claude has been creating and updating code across 4 applications:

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

## Best Practices Discovered

- Got Claude to summarize its changes and keep them with the code... have Claude develop change logs. Creating a custom agent that will create a change log can help
- Structure information for Claude to easily pickup context
- Use `.claude.md` and `.claude/` folders to maintain project knowledge
- Version control all agent configurations, prompts, and templates as organizational assets

---

# Enabling the Organization

## Cultural Evolution Needed

- **Evangelization and upskilling:** Help teams understand agentic patterns and build capability, not just provide tools
- **Encouraging and incentivizing:** Reward pattern creation and sharing, celebrate learning and experimentation
- **Helping teams see the vision:** Share learnings, document success patterns, make the abstract concrete through examples
- **Recognition:** This is a journey, evolutionary process, not a switch-flip

## Developer Empowerment Model

The vision we are painting is a point of arrival target state. This paradigm shift will be an evolutionary process and the catalyst has to be there.

- **Individual access enables learning:** Developers build capability by using tools directly. Maintains context, preserves velocity. Creates organizational knowledge, not bottlenecks
- **Governance through standards, not gatekeeping:** Approved patterns, version-controlled agents, code review gates. Enable and encourage more than govern - it's a fine balance
- **Building organizational capability:** This is about elevating developers to solve harder problems faster, not about doing more with fewer people (though that may be a side effect)

## Implementation Considerations

- **Platform evaluation needed:** Bedrock vs. external Claude - feature parity assessment critical. Developer experience must not be compromised. Need to ensure MCP support, Claude Code equivalence, API capabilities
- **Governance patterns to establish:** Approved use cases, standardized configs. PII/IP safeguards through tooling and prompts, not prohibition. Review gates at appropriate points

## The Path Forward (Crawl → Walk → Run)

**Crawl (Current):**

- Sandbox projects, pattern documentation
- Learning from open source frameworks
- Individual experimentation with approved teams

**Walk (Near-term):**

- Controlled rollout, governance framework
- Building custom organizational patterns
- Broader access with established guardrails

**Run (Future):**

- Broad adoption with standardized practices
- Mature CIP implementation
- Self-improving, intelligent delivery systems

## What to Measure

Focus on capability enhancement, not cost reduction:

- Velocity improvements (time to delivery)
- Quality metrics (defect rates, test coverage)
- Developer satisfaction and capability growth
- Pattern adoption and reuse rates

**Not:** Headcount reduction

## The Opportunity

This represents an inflection point for the industry. Organizations need to explore how these toolsets can be made available to engineering teams. Those that enable agentic AI safely with appropriate governance will build significant competitive advantage.

---

# What I Am Not Going to Do

Many of you are already familiar with prompt engineering and are regularly using Ally's AI Tools (Ally Code Assist). What I want to talk about is not just another tool - it's about introducing you to the paradigm shift and helping crystalize this vision so we can evolve our development ecosystem together.
