# CIO Presentation: Agentic AI & Claude - Detailed Planning Document

## Context & Background

### Organizational Situation

- **Organization**: Large bank evaluating Claude for developer productivity
- **Role**: Technical lead using Claude on Shield project, tasked with steering learnings for Claude adoption
- **Leadership Expectations**:
  - Provide developer POV on Claude's value
  - Address reality vs. hype
  - Guide on safe rollout to developers
  - Represent efficiency gains and practical implementation

### Key Organizational Considerations

- **Privacy & Security**: Bank has concerns about PII, intellectual property, and opening code to external AI tools
- **Platform Questions**:
  - Bedrock deployment vs. external Claude
  - Will Bedrock provide same developer experience or diminish it?
  - Microsoft AI already in use, exploring Bedrock
- **Rollout Strategy Debate**:
  - Some suggest centralized team to generate code for developers (user opposes this)
  - Others suggest individual developer access
  - User believes centralization kills the value
- **Political Dynamics**:
  - User aware of senior leadership discussions but can't acknowledge this directly
  - One leader creating hype around AI reducing headcount (user wants to reframe this)
  - Need to influence subtly without being prescriptive

### User's Experience with Claude

- **Shield Project Success**:
  - Developed fully functional CIAM-UI component in open-source sandbox
  - Compressed weeks/months of work into hours/days
  - Architecture: CIAM UI SDK + 2 consumer apps (Storefront, Account Servicing) + Backend service
  - Claude orchestrated development across 4 applications simultaneously
- **Process Used**:
  - Created detailed SRS document upfront
  - Defined business requirements, user/system flows
  - Researched architectural concerns using Ally AI and Claude
  - Left minimal room for hallucination
  - Iteratively course-corrected through prompts
  - Generated code as open source on personal laptop, then moved to work environment
- **Key Learning**: Detailed requirements upfront = Claude produces desired output in first pass
- **Current Usage**:
  - Using open source agents from SuperClaude (e.g., `/sc:brainstorming` for requirements refinement)
  - Learning patterns before building custom organizational agents
- **Evaluation Phase**: Assessing AI-generated code for Shield production release

### User's Vision

- **Paradigm Shift**: From CI/CD to Continuous Intelligence Pipeline (CIP)
- **Not about**: Doing more with fewer people (though that's a side effect)
- **About**: What an Agentic AI-infused organization looks like and how to get there
- **Core Belief**: This is an evolutionary process requiring:
  - Evangelization and upskilling
  - Cultural encouragement and incentives
  - Helping others see the vision
  - Building toward a target state progressively

## Presentation Requirements & Constraints

### Audience

- **Who**: Technology Leadership Team (TLT) members - Unit CIO level
- **Knowledge Level**: Already familiar with Claude, having multiple conversations about it
- **Expectations**:
  - Not naive - no dog and pony show needed
  - Want substance without fluff
  - Limited time to read/absorb
  - Need concrete examples to visualize concepts
  - Looking for "aha moment" on paradigm shift

### Tone & Style Requirements

- **Voice**: Terse but meaningful, neutral, less self-referential
- **Avoid**:
  - Nursery rhyme or story-like narrative
  - Overly basic explanations (they already know about Claude)
  - Jarring headers or marketing-speak
  - Statements that could be perceived negatively (e.g., "banks are conservative")
  - Taking strong positions - remain neutral
  - Too much fluff (obvious points like "time to market" or "talent attraction")
- **Include**:
  - Factual, directional POV
  - Concrete examples that help them visualize
  - Subtle influence without being prescriptive
  - Educational content that leads to insights
  - Technical accuracy - examples must be real and valid

### Deck Specifications

- **Length**: 6-8 slides (main deck), appendix allowed
- **Format**: PowerPoint presentation
- **Quality**: Punchy, easy to follow, professional
- **Goal**: Create "aha moment" around paradigm shift while remaining educational and neutral

## Executive Summary (Finalized)

We are actively exploring the use of Claude within the Shield project, with encouraging early results. Together with Claude, we have developed a fully functional CIAM-UI component in an open-source sandbox environment. Work that might traditionally take weeks or months was completed in just hours and days.

We are now assessing how this AI-generated code can be applied to Shield's production release. Along the way, we have gained valuable insights into how agentic AI can streamline development, increase efficiency, and signal an important shift in how software is created.

In this deck, we will share:

- Early learnings from our work with Claude
- Perspectives on how agentic AI can reshape the software development lifecycle
- Opportunities for evolving our development ecosystem with this technology

Agentic AI represents a promising inflection point, and by learning together, we can shape how it best supports our projects and future growth.

## Detailed Slide Plan (6 Slides + Appendix)

### Slide 1: Title + Executive Summary

**Content**:

- Title: "Agentic AI & Software Delivery: Learnings from Shield"
- Executive summary (as finalized above)
- Clean, minimal design

**Design Notes**: Professional, straightforward opening

---

### Slide 2: What Makes Claude Different

**Purpose**: Establish Claude's unique positioning - audience knows LLMs but may not grasp the agentic distinction

**Content**:

- **Three Development Paradigms** (visual progression):

  1. **Basic Prompting**: "Generate a login function" - simple request/response
  2. **Workflows**: Orchestrated predefined steps (LangChain, custom frameworks)
  3. **Agentic AI**: Goal + Tools + Freedom to plan and execute steps not predefined

- **Key Differentiator**:

  - Claude decides next steps based on situation, not predefined scripts
  - Optimized for coding - understands code flow and logs better than general LLMs

- **Developer Behavior Parallels** (human-like problem-solving):

  - Turns on verbose logs when debugging
  - Adds temporary debug statements to detect issues
  - Creates utilities to help investigate
  - Acts as pair programmer, may ask developer to run tests or check logs it doesn't have access to

- **Concrete Example of Human-like Behavior**:
  - "Encounters error → adds debug logs → creates test utility → identifies root cause"
  - Makes the concept tangible vs. abstract

**Visual**: Simple 3-column comparison table or progression arrows showing the three paradigms

**Key Message**: Claude is fundamentally different because of agentic reasoning, not just better prompts

---

### Slide 3: The Paradigm Shift

**Purpose**: Introduce the fundamental change - ease into the vision

**Content**:

- **We're at an inflection point**: Moving from CI/CD automation to Continuous Intelligence

- **The Core Shift**:

  - **CI/CD** = Automation of predefined steps
  - **Continuous Intelligence** = AI infuses planning, coding, testing, security, operations
  - Not automation added to CI/CD — this is a **new operating model**

- **Five Foundational Elements**:

  1. **Workflows**: Predefined steps controlling how prompts/responses flow
  2. **Agents**: The brain deciding what to do to achieve goals
  3. **Commands**: Deterministic actions the brain chooses (build, test, deploy)
  4. **Hooks**: Injection points for custom behavior (pre-commit, post-build, etc.)
  5. **MCP/Integrations**: Standardized adapters to tools, data, systems

- **What This Enables**: "These elements combine to create self-improving systems that get smarter with each cycle"

- **Industry Context** (neutral framing): This represents an inflection point for software development. Organizations need to explore how these toolsets can be made available to engineering teams.

**Visual**: Simple diagram showing the 5 elements and how they interconnect

**Key Message**: Foundational shift in how software is created, not just incremental improvement

---

### Slide 4: The Vision - Continuous Intelligence Pipeline

**Purpose**: The transformational "aha" - show the destination AND the journey

**Content**:

**The Destination**:
"Imagine AI agents that plan sprints, scaffold code, generate tests, run performance and security scans, orchestrate canaries, and feed every outcome back to improve the next cycle — all under developer control and policy."

**The Evolution** (6-Phase Journey):

- **Phase 1** (Now - Current):
  - **Experimental**: Select approved teams, open source/greenfield projects only
  - Claude used for new capabilities, proof of concepts
- **Phase 2** (Q1-Q2 2026):
  - **Expanded Access**: Claude available on Ally machines
  - Teams analyze and update existing code
  - Mostly basic prompting level, learning patterns
- **Phase 3** (Q3-Q4 2026):
  - **Pattern Emergence**: Teams build project/org/BU-level patterns
  - Development of custom agents, commands, hooks, integrations
  - Moving beyond basic prompting
- **Phase 4** (Year 2):
  - **Standardization**: Common patterns rolled out across organization
  - Reduced duplicative work
  - Teams adopting proven patterns
- **Phase 5** (Year 2-3):
  - **CIP Emergence**: Continuous Intelligence Pipeline takes shape
  - Intelligent workflows across full SDLC
  - AI-infused planning, testing, security, operations
- **Phase 6** (Year 3+):
  - **Mature CIP**: Pipelines fully mature
  - "Warp speed" with advanced Agentic AI
  - Self-improving, learning systems

**The Constant Across All Phases**:

- Humans remain the final governors at every phase
- Every action is typed, versioned, validated
- Developers design and steer; AI accelerates execution

**Visual Options**:

1. Horizontal roadmap showing 6 phases with clear progression
2. Ascending staircase visual
3. Circular CIP diagram with phase indicators showing which parts "light up" in each phase

**Preferred**: Circular lifecycle diagram:

- Center: "CIP Platform" (orchestrator, agent manager, governance, observability)
- Circle around it: Plan → Design → Implement → Build/CI → Integration Testing → Performance & Security → Release & Rollout → Operate & Learn → back to Plan
- At each phase: AI Agent + Workflow icons
- Between phases: Hooks
- Outside connections: Integrations (Jira, Git, CI, Security Scanners, Monitoring)

**Footer/Footnote**: _Timeline is illustrative and will evolve based on organizational readiness and learnings_

**Key Message**: This is an evolutionary journey with clear phases, not a magic transformation. Sets realistic expectations while painting aspirational vision.

---

### Slide 5: What This Looks Like in Practice

**Purpose**: Make it concrete - show the ecosystem and how it actually works with real examples

**Content Structure**:

**Part 1: Real Technical Example - Database Promotion Workflow**

_Scenario: Promoting PostgreSQL database to standalone in specific region_

**The Agent** (`/sc:promote-db`):

```
Promote {{DB_NAME}} in {{REGION}} to standalone:
- Retrieve DB credentials from secrets manager {{SECRETS_MANAGER_ARN}}
- Verify current DB configuration via AWS CLI
- Execute standalone conversion using AWS Cloud Console
- Update infrastructure documentation in {{CONFIG_REPO}}
- Run post-promotion validation tests
- Document changes in {{CHANGE_LOG}}
```

**What's Actually Happening**:

- **MCP Integration**: Connects to AWS Secrets Manager for credentials, interacts with AWS Console/APIs
- **Commands**: Execute AWS CLI commands, run validation tests
- **Hooks**: Pre-promotion checks (validate backup exists), post-promotion validation
- **Integrations**: Updates Git repos, JIRA tickets, change logs

**How It Becomes Deterministic & An Organizational Asset**:

- **Version Evolution**:
  - v1.0: Basic promotion steps
  - v1.5: Added rollback capability, enhanced error handling
  - v2.0: Added compliance checks, automated documentation
- **Version Controlled**: Every refinement tracked like code
- **Organizational Benefit**: Everyone uses the safe, approved method. No manual errors. Patterns improve over time.

**Part 2: The Ecosystem Components**

- **Agents = Collections of Optimized + Template Prompts**:

  - Template prompts use variables: `"Promote {{DATABASE}} in {{REGION}} using {{ORG_TERRAFORM_MODULES}}"`
  - Version controlled as organizational assets
  - Example progression: Code review agent v1.0 → v1.5 → v2.0, each iteration more precise

- **Structured Context for Claude**:

  - `.claude.md`: Auto-loaded project context (commands, style, workflow)
    - Example: "Always run security scan before merge, use Jest not Mocha"
  - `.claude/` folder hierarchy:
    - **Enterprise Level** (`/org/.claude/`): `/sc:deploy-to-prod`, `/sc:security-scan`, `/sc:promote-db`
    - **BU/Team Level** (`/team/.claude/`): `/sc:ciam-integration`, `/sc:api-gateway-setup`
    - **Project Level** (`/project/.claude/`): `/sc:shield-architecture`, project-specific patterns

- **What Gets Documented**:

  - Code patterns, style guides, testing approaches
  - Environment setup, project conventions
  - Organizational standards (approved libraries, Terraform modules, SDKs)

- **Custom Agents - Invocation**:

  - Created in `.claude/` folders as behavioral prompt collections
  - Invoked via slash commands: `/sc:brainstorming`, `/sc:code-review`, `/sc:promote-db`
  - Example: User currently uses `/sc:brainstorming` from SuperClaude for requirements refinement

- **Version Control for AI**:

  - Claude configs, templates, agents treated like code
  - Ensures repeatability, allows rollback, enables audit trail

- **Current State**:
  - Using open source agents (SuperClaude, AWS Advanced Claude Patterns) to learn
  - Vision: Build Ally-specific custom agents for organizational workflows

**Part 3: Human Oversight Evolution**

_Visual: Horizontal arrow with color gradient_

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
[Dark Red ████████████░░░░░░░░░░░░░░░░░░ Light Gray]
Very High ─────────────────────────────────────→ Governed/Minimal
```

**Key Insight**:

- Autonomous with human on the steering wheel
- Oversight reduces as patterns mature and systems become more deterministic
- Not about removing humans - about elevating their role from execution to governance

**Visual Considerations**:

- Use gradient arrow to save space
- Database promotion example should be prominent and clear
- Ecosystem components can be bulleted list or simple diagram
- Heat map arrow should be clean and easy to understand

**Key Message**:

- This is real, technical, and achievable
- Version controlling AI patterns creates organizational assets
- Human role evolves from doing to governing

---

### Slide 6: Enabling the Organization

**Purpose**: How we move forward - the catalyst without being prescriptive

**Content**:

**Cultural Evolution Needed**:

- **Evangelization & Upskilling**:
  - Help teams understand agentic patterns
  - Build capability, not just provide tools
- **Encouraging & Incentivizing**:
  - Reward pattern creation and sharing
  - Celebrate learning and experimentation
- **Helping Teams See the Vision**:
  - Share learnings, document success patterns
  - Make the abstract concrete through examples
- **Recognition**: This is a journey, evolutionary process, not a switch-flip

**The Developer Empowerment Model**:

- **Individual Access Enables Learning**:
  - Developers build capability by using tools directly
  - Maintains context, preserves velocity
  - Creates organizational knowledge, not bottlenecks
- **Governance Through Standards, Not Gatekeeping**:
  - Approved patterns, version-controlled agents
  - Code review gates, security validation
  - Enable and encourage more than restrict
- **The Balance**: Find equilibrium between autonomy and governance

**Implementation Considerations** (Neutral, Not Prescriptive):

- **Platform Evaluation Needed**:
  - Bedrock vs. external Claude - feature parity assessment critical
  - Developer experience must not be compromised
  - MCP support, Claude Code equivalence, API capabilities
- **Governance Patterns to Establish**:
  - Approved use cases, standardized configs
  - PII/IP safeguards through tooling and prompts, not prohibition
  - Review gates at appropriate points

**The Path Forward** (Crawl → Walk → Run):

- **Crawl** (Current):
  - Sandbox projects, pattern documentation
  - Learning from open source frameworks
- **Walk** (Near-term):
  - Controlled rollout, governance framework
  - Building custom organizational patterns
- **Run** (Future):
  - Broad adoption with standardized practices
  - Mature CIP implementation

**What to Measure**:

- Velocity improvements (time to delivery)
- Quality metrics (defect rates, test coverage)
- Developer satisfaction and capability growth
- **Not**: Headcount reduction

**The Opportunity** (Neutral Framing):

- Industry is at this inflection point
- Making these toolsets available safely positions organization for this shift
- Organizations that enable agentic AI with appropriate governance will build competitive advantage

**Visual Options**:

- Simple maturity curve
- Capability-building framework diagram
- Timeline showing crawl/walk/run phases

**Key Message**:

- This requires cultural change and systematic enablement
- Balance between empowerment and governance
- Evolutionary approach with measured phases

---

## Appendix Slides

### Appendix 1: Shield Project Deep Dive

**Content**:

- **Architecture Diagram**:

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

- **Development Process**:

  - Started with detailed SRS document
  - Defined business requirements, user/system flows
  - Researched architectural constraints using AI tools
  - Left minimal room for hallucination by being detailed upfront
  - Iteratively course-corrected through prompts
  - Claude orchestrated development across all 4 applications

- **Key Learnings**:

  - Detailed requirements upfront = Claude produces desired output in first pass
  - Components developed are reusable across projects
  - Proof of concepts and pattern experimentation dramatically accelerated
  - Weeks/months of work compressed to hours/days

- **Current Status**:
  - Fully functional CIAM-UI component in open-source sandbox
  - Evaluating generated code for Shield production release

### Appendix 2: Technical Patterns & Tools Deep Dive

**Content**:

- **.claude Folder Structure Details**:

  - `$PROJECT_ROOT/.claude.md` - Auto-loaded context
  - `$USER_HOME/.claude/` - Personal/shared agents
  - `$PROJECT_ROOT/.claude/` - Project-specific patterns
  - What belongs at each level

- **Template Prompts & Variables**:

  - Examples from Anthropic documentation
  - How variables get filled in
  - Version control strategy

- **MCP (Model Context Protocol)**:

  - Standardized integrations to tools
  - How it connects to internal systems
  - Security and compliance considerations

- **Open Source Ecosystem**:
  - SuperClaude Framework: https://github.com/SuperClaude-Org/SuperClaude_Framework
  - AWS Advanced Claude Patterns: https://github.com/aws-samples/anthropic-on-aws/tree/main/advanced-claude-code-patterns
  - Community patterns and learnings

### Appendix 3: Considerations & Open Questions

**Content**:

- **Platform Integration Questions**:

  - Bedrock feature parity with external Claude
  - MCP support availability
  - Claude Code equivalence on Bedrock
  - Microsoft AI, Bedrock, Claude - coexistence strategy (TBD)

- **Governance & Security**:

  - PII and IP protection mechanisms
  - Code ownership and licensing
  - Audit trail and provenance
  - Compliance frameworks for banking

- **Organizational Readiness**:

  - Skill gaps and training needs
  - Cultural barriers to adoption
  - Integration with existing tooling
  - Change management approach

- **Risk Mitigation**:
  - When Claude gets it wrong - course correction approaches
  - Failure modes and recovery patterns
  - Human oversight requirements at each phase
  - Rollback and version control strategies

## Key Technical Validation Points

### What Must Be Technically Accurate

1. **Agents**: Collections of optimized prompts + template prompts (version controlled)
2. **Commands**: Real executable actions defined in frameworks (not conceptual)
3. **Hooks**: Actual trigger points (pre-commit, post-build, etc.)
4. **MCP Integrations**: Standardized connectors to tools/systems
5. **Template Prompts**: Use variable substitution as per Anthropic docs
6. **SuperClaude Usage**: User is USING open source agents (like `/sc:brainstorming`), not building custom ones yet
7. **Vision for Custom Agents**: Organization will build Ally-specific agents (e.g., `/sc:promote-db` with Ally Terraform modules, Metronome SDK)

### Examples Must Be Real

- Database promotion example uses actual technical components:
  - AWS Secrets Manager for credentials
  - AWS CLI commands
  - MCP integrations to AWS
  - Real hooks and validations
- Avoid oversimplification that makes examples technically inaccurate
- Show the actual complexity and orchestration required

### References for Validation

- Anthropic prompt engineering docs: https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables
- SuperClaude Framework: https://github.com/SuperClaude-Org/SuperClaude_Framework
- AWS Advanced Claude Patterns: https://github.com/aws-samples/anthropic-on-aws/tree/main/advanced-claude-code-patterns
- Claude Code docs: https://docs.claude.com/en/docs/claude-code

## Design & Visual Guidelines

### Overall Design Principles

- Clean, professional, minimal
- Avoid clutter and over-formatting
- Use visuals to clarify complex concepts
- Each slide should have clear visual hierarchy
- Consistent color scheme and typography

### Specific Visual Elements

**Slide 2 Visual**:

- 3-column comparison or progression arrows
- Show evolution: Basic → Workflows → Agentic

**Slide 3 Visual**:

- Diagram showing 5 foundational elements (Workflows, Agents, Commands, Hooks, MCP/Integrations)
- How they interconnect
- Simple, not cluttered

**Slide 4 Visual**:

- Circular lifecycle diagram (preferred):
  - Center: CIP Platform components
  - Circle: Full SDLC phases
  - Icons for AI + Workflows at each phase
  - Hooks between phases
  - Integrations on perimeter
- Alternative: Horizontal roadmap with 6 phases clearly marked
- Must include footnote: "Timeline is illustrative and will evolve based on organizational readiness and learnings"

**Slide 5 Visual**:

- Database promotion example prominently displayed
- Gradient arrow for human oversight evolution (saves space vs. full heat map)
- File structure diagram for .claude ecosystem (optional, if space allows)

**Slide 6 Visual**:

- Maturity curve or capability-building framework
- Crawl/Walk/Run timeline
- Simple, aspirational but achievable

## Critical "Do Nots"

### Content

- ❌ Don't make obvious points (time to market, talent attraction)
- ❌ Don't say "banks are conservative, competitors are moving" (sounds critical)
- ❌ Don't talk about reducing headcount (even though it's a side effect)
- ❌ Don't be prescriptive or take strong positions
- ❌ Don't acknowledge knowing about senior leadership discussions
- ❌ Don't go too basic (they already know about Claude)
- ❌ Don't use marketing speak or jarring headers
- ❌ Don't include technically inaccurate examples

### Tone

- ❌ Don't be self-referential ("you asked me to...")
- ❌ Don't make it story-like or nursery rhyme style
- ❌ Don't oversell or create hype
- ❌ Don't fearmonger about competition
- ❌ Don't sound presumptuous about their concerns

## Critical "Do's"

### Content

- ✅ Be neutral and factual
- ✅ Provide directional POV on industry trends
- ✅ Use concrete, technically accurate examples
- ✅ Show the paradigm shift clearly
- ✅ Be honest about current state vs. future state
- ✅ Acknowledge this is evolutionary, not revolutionary
- ✅ Emphasize human governance at all phases
- ✅ Focus on capability building, not cost reduction

### Tone

- ✅ Terse but meaningful
- ✅ Educational without talking down
- ✅ Neutral without being bland
- ✅ Subtle influence without prescription
- ✅ Professional and respectful of audience knowledge

## Success Criteria

### The "Aha Moment" Should Come From:

1. **Clarity on agentic AI**: Understanding what's fundamentally different
2. **Visual of CIP**: Seeing the circular, self-improving system
3. **Evolutionary path**: Recognizing this is achievable in phases
4. **Concrete examples**: Visualizing how it actually works (database promotion)
5. **Organizational assets**: Understanding patterns as versioned, shared resources
6. **Human role evolution**: From execution to governance

### Presentation Should Achieve:

- Leaders understand the paradigm shift (not just faster coding)
- Recognition that centralized code generation misses the point
- Appreciation for developer empowerment with governance
- Understanding of what needs to be in place (ecosystem, patterns, culture)
- Clarity on the evolutionary journey (6 phases)
- Confidence in the technical approach (real, achievable examples)
- Sense of urgency without fearmongering (industry inflection point)

## Next Steps for Implementation

### When Resuming This Work:

1. **Review this entire document** to understand context and decisions made
2. **Validate technical accuracy** of examples against referenced documentation
3. **Create actual PowerPoint slides** following the 6-slide + appendix structure
4. **Ensure visuals are clear and professional**
5. **Maintain the neutral, educational tone** throughout
6. **Get user feedback** on each slide before finalizing
7. **Iterate based on feedback** while preserving core message

### Key Questions to Confirm When Resuming:

- Are the technical examples (database promotion, agents, MCP) accurate per the documentation?
- Does the 6-phase evolution feel realistic for the organization's timeline?
- Are the visuals clear enough to convey complex concepts?
- Is the tone appropriately neutral and educational?
- Does the deck create the intended "aha moment" around the paradigm shift?

---

**Document Status**: Ready for PowerPoint implementation
**Last Updated**: Based on full conversation thread
**Next Action**: Create actual PowerPoint slides following this detailed plan
