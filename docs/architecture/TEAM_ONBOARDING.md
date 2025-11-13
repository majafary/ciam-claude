# Team Onboarding Guide: C4 Architecture Diagrams

This guide helps your team adopt C4 architecture diagrams using Structurizr.

## 📋 Prerequisites

- Git repository for your project
- Docker installed (for local diagram viewing)
- GitHub Actions enabled (for CI/CD automation)
- 30-60 minutes for initial setup

---

## 🚀 Quick Start (5 Steps)

### Step 1: Copy Template Files

Copy these files from the CIAM project to your repository:

```bash
# From CIAM repository
cp -r docs/architecture/ your-project/docs/
cp docker-compose.structurizr.yml your-project/
cp .github/workflows/publish-architecture.yml your-project/.github/workflows/
```

**Files you'll have:**
```
your-project/
├── docs/
│   └── architecture/
│       ├── workspace.dsl           # Your C4 diagrams (edit this!)
│       ├── TEMPLATE.dsl            # Reference template
│       └── TEAM_ONBOARDING.md      # This guide
├── docker-compose.structurizr.yml  # Local viewer
└── .github/workflows/
    └── publish-architecture.yml    # CI/CD automation
```

---

### Step 2: Customize workspace.dsl

Open `docs/architecture/workspace.dsl` and replace placeholders:

**Find & Replace:**
1. `PROJECT_NAME` → Your project name (e.g., "Payment Processing System")
2. `PROJECT_DESCRIPTION` → Brief description (e.g., "Handles credit card transactions")

**Add Your Architecture:**
1. **People**: Who are your users? (customers, admins, support agents)
2. **Containers**: What apps/services do you have? (web app, API, database)
3. **Relationships**: How do they connect? (webapp → API → database)

**Example:**
```dsl
workspace "Payment System" "Processes credit card transactions" {
    model {
        customer = person "Customer" "Makes purchases"

        system = softwareSystem "Payment System" {
            webapp = container "Payment UI" "Checkout interface" "React"
            api = container "Payment API" "Transaction processing" "Node.js"
            database = container "Transaction DB" "Payment records" "PostgreSQL"
        }

        customer -> webapp "Makes payments"
        webapp -> api "Submits transactions" "HTTPS"
        api -> database "Stores" "SQL"
    }

    views {
        systemContext system "SystemContext" {
            include *
            autoLayout
        }

        container system "Containers" {
            include *
            autoLayout
        }

        styles {
            element "Person" {
                shape Person
                background #08427B
                color #ffffff
            }
            element "Container" {
                background #438DD5
                color #ffffff
            }
        }

        theme default
    }
}
```

**Tip**: Start simple with System Context (Level 1) and Container (Level 2) diagrams. Add Component diagrams (Level 3) later if needed.

---

### Step 3: View Diagrams Locally

Test your diagrams before committing:

```bash
# Start Structurizr Lite
docker-compose -f docker-compose.structurizr.yml up

# Open browser
open http://localhost:8081
```

**What you'll see:**
- Interactive diagram viewer
- Click elements to navigate between levels
- Zoom in/out between Context → Containers → Components
- Automatic layout and styling

**If diagrams don't appear:**
1. Check `workspace.dsl` syntax (look for error messages in browser)
2. Verify file path in docker-compose.structurizr.yml
3. Check Docker logs: `docker logs ciam-structurizr`

**Stop the server:**
```bash
docker-compose -f docker-compose.structurizr.yml down
```

---

### Step 4: Commit and Push

Once diagrams look good locally:

```bash
git add docs/architecture/ docker-compose.structurizr.yml .github/workflows/
git commit -m "Add C4 architecture diagrams"
git push origin main
```

**GitHub Actions will automatically:**
1. Validate your workspace.dsl syntax
2. Generate preview diagrams
3. Show results in Pull Request checks

---

### Step 5: Share with Team

**For viewing diagrams:**

**Option A: Local viewing (developers)**
```bash
docker-compose -f docker-compose.structurizr.yml up
open http://localhost:8081
```

**Option B: Screenshots for presentations**
1. Open diagrams locally
2. Take screenshots of specific views
3. Use in PowerPoint, Confluence, or documentation

**Option C: Central server (when available)**
- Platform team will provide URL
- All teams' diagrams in one place
- No local Docker needed

---

## 📖 Understanding C4 Levels

### Level 1: System Context
**Purpose**: Show the big picture - your system and its external dependencies

**Who needs this**: Everyone (executives, product, engineering)

**What to include:**
- Your system (1 box)
- Users/actors (people shapes)
- External systems (other boxes)
- High-level relationships

**Example use cases:**
- Onboarding new team members
- Explaining system to stakeholders
- Architecture reviews

---

### Level 2: Container Diagram
**Purpose**: Show applications, databases, and technology choices

**Who needs this**: Technical teams, architects, platform engineers

**What to include:**
- Web applications
- Backend APIs
- Databases
- Message queues
- Technology stack labels

**Example use cases:**
- Deployment planning
- Technology decisions
- Capacity planning
- Security reviews

---

### Level 3: Component Diagram
**Purpose**: Show internal structure of a container (optional, for complex services)

**Who needs this**: Developers working on specific services

**What to include:**
- Controllers/Handlers
- Services/Business Logic
- Repositories/Data Access
- Internal dependencies

**Example use cases:**
- Refactoring planning
- Code reviews
- Understanding service internals

**When to skip:** If your container is simple (< 5 major components), Level 2 is enough.

---

### Level 4: Code Diagrams
**Purpose**: Class diagrams, sequence diagrams (optional, rarely needed)

**When to use:** Very complex algorithms or data structures requiring detailed documentation

**Most teams don't need Level 4** - code itself is the documentation at this level.

---

## 🛠️ Maintenance Guide

### When to Update Diagrams

**Update workspace.dsl when:**
- ✅ Adding new service/application
- ✅ Changing technology stack
- ✅ Adding external integration
- ✅ Major refactoring of components
- ✅ Removing deprecated services

**Don't update for:**
- ❌ Small bug fixes
- ❌ Adding individual functions/methods
- ❌ Code-level changes
- ❌ UI styling updates

**Rule of thumb**: If it changes deployment or integration, update diagrams.

---

### How to Update

1. **Edit workspace.dsl locally**
   ```bash
   # Open in your editor
   code docs/architecture/workspace.dsl
   ```

2. **Test changes locally**
   ```bash
   docker-compose -f docker-compose.structurizr.yml up
   # View at http://localhost:8081
   ```

3. **Commit and push**
   ```bash
   git add docs/architecture/workspace.dsl
   git commit -m "Update architecture: add payment gateway integration"
   git push
   ```

4. **GitHub Actions validates automatically**
   - Check the Actions tab for results
   - Fix any syntax errors if validation fails

---

### Estimated Maintenance Time

- **Initial setup**: 1-3 hours (one-time)
- **Monthly updates**: 15-30 minutes
- **Major refactoring**: 1-2 hours

---

## 🎯 Best Practices

### DO:
✅ Keep diagrams at appropriate abstraction level (hide implementation details)
✅ Use consistent naming with your codebase
✅ Add descriptions to clarify purpose
✅ Update diagrams when architecture changes
✅ Review diagrams in pull requests
✅ Use diagrams in onboarding and design reviews

### DON'T:
❌ Show every class/function (too detailed)
❌ Let diagrams diverge from reality
❌ Create diagrams and never update them
❌ Skip relationships between components
❌ Use vague names like "Service1", "Database1"

---

## 🆘 Troubleshooting

### Problem: Diagrams don't render in browser

**Solution:**
```bash
# Check Docker logs
docker logs ciam-structurizr

# Common issues:
# 1. Syntax error in workspace.dsl
#    → Check browser console for error messages
#    → Validate syntax: structurizr-cli validate workspace.dsl

# 2. Volume mount incorrect
#    → Verify docker-compose.structurizr.yml volumes path

# 3. Port conflict
#    → Change port in docker-compose.structurizr.yml if 8081 is taken
```

---

### Problem: GitHub Actions workflow fails

**Solution:**
```bash
# View workflow logs in GitHub Actions tab

# Common issues:
# 1. workspace.dsl syntax error
#    → Fix syntax, commit, push again

# 2. Missing @structurizr/cli package
#    → Workflow installs automatically, check npm registry access

# 3. Permission denied
#    → Check repository settings → Actions → General → Workflow permissions
```

---

### Problem: Want to add more detailed diagrams

**Solution:**
1. Start with Container diagram (Level 2)
2. If a container is complex, add Component diagram (Level 3)
3. Refer to CIAM project's workspace.dsl for examples
4. Component diagram template:
```dsl
component myContainer "MyContainerComponents" {
    include *
    autoLayout tb
    title "[Component] My Container - Internal Structure"
}
```

---

## 📚 Resources

### Internal Resources
- **Example**: `ciam-claude/docs/architecture/workspace.dsl` (reference implementation)
- **Template**: `docs/architecture/TEMPLATE.dsl` (starting point)
- **Support**: Contact Platform/Architecture team

### External Resources
- **Structurizr DSL Guide**: https://docs.structurizr.com/dsl
- **C4 Model**: https://c4model.com/
- **Structurizr Lite**: https://structurizr.com/help/lite
- **Examples**: https://structurizr.com/help/examples

---

## 🤝 Getting Help

**For questions or issues:**

1. **Check CIAM project's diagrams**: Real working example in this repo
2. **Read Structurizr docs**: https://docs.structurizr.com/
3. **Ask in Slack**: #architecture-guild or #platform-engineering
4. **Open GitHub issue**: For tool/process problems
5. **Request pair programming**: Schedule time with someone who's done this

---

## 🎉 Success Checklist

After completing setup, you should have:

- [ ] `workspace.dsl` file customized for your project
- [ ] Diagrams visible locally via Docker (http://localhost:8081)
- [ ] System Context and Container diagrams created
- [ ] GitHub Actions workflow passing validation
- [ ] Diagrams committed to main branch
- [ ] Team knows how to view diagrams
- [ ] Process for updating diagrams established

**Congratulations! You now have living architecture documentation!** 🚀

---

## 📝 Next Steps (Optional)

### When to Add Component Diagrams

Add Component diagrams (Level 3) if:
- Service has >10 files or >1000 lines of code
- Multiple teams work on the same service
- New team members struggle to understand structure
- Planning major refactoring

### When to Deploy Central Server

Deploy central Structurizr server when:
- 3+ teams have adopted C4 diagrams
- Need cross-project architecture views
- Want single URL for all diagrams
- Platform team ready to maintain infrastructure

### Advanced Features to Explore

- **Dynamic views**: Show runtime behavior (sequence diagrams)
- **Deployment views**: Show production infrastructure
- **Filtered views**: Create focused views for specific audiences
- **Themes**: Custom color schemes and styling
- **ADRs**: Link Architecture Decision Records to diagrams

---

## 🔄 Feedback

This is a living guide! If you have suggestions or find issues:

1. Create PR to improve this guide
2. Share learnings in #architecture-guild
3. Help other teams with their setup

**Remember**: Perfect is the enemy of done. Start simple, iterate based on feedback!
