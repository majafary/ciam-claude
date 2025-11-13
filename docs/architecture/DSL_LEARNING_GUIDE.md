# Structurizr DSL Learning Guide

## 🎯 Big Picture

Structurizr DSL files have **3 main sections**:

```
workspace "Name" "Description" {

    model {
        # WHAT exists (people, systems, containers, components)
    }

    views {
        # HOW to visualize the model (which diagrams to show)
    }

    configuration {
        # Settings and options
    }
}
```

Think of it like:
- **model** = Your architecture data (the "what")
- **views** = Your diagrams (the "how to display it")
- **configuration** = Display settings

---

## 📦 Part 1: The MODEL Section

The model defines **what exists** in your architecture. It follows the **C4 Model hierarchy**:

```
Level 0: People (users)
    ↓
Level 1: Software Systems (big boxes)
    ↓
Level 2: Containers (applications, databases)
    ↓
Level 3: Components (internal parts of containers)
```

### People (External Actors)

**Syntax**:
```dsl
variableName = person "Display Name" "Description"
```

**Your example** (from `ciam.dsl` lines 7-8):
```dsl
customer = person "Customer" "End user accessing web applications for shopping and account management"
supportAgent = person "Support Agent" "Customer service representative helping users with account issues"
```

**What this means**:
- `customer` = variable you can reference later
- `"Customer"` = what shows on the diagram
- `"End user accessing..."` = tooltip/description

### Software Systems (Level 1)

**Syntax**:
```dsl
systemVar = softwareSystem "System Name" "Description" {
    # containers go here
}
```

**Your example** (line 13):
```dsl
ciamSuite = softwareSystem "CIAM Integration Suite" "Customer identity and access management platform..." {
    # All your containers are inside here
}
```

**External systems** (systems you don't control):
```dsl
ldap = softwareSystem "LDAP Directory" "Corporate user directory" {
    tags "External"
}
```

The `tags "External"` makes it display differently (usually gray).

### Containers (Level 2)

Containers = **separately deployable units** (web apps, APIs, databases).

**Syntax**:
```dsl
containerVar = container "Container Name" "Description" "Technology" {
    tags "TagName"
    # components go here (optional)
}
```

**Your backend API example** (lines 20-21):
```dsl
backend = container "CIAM Backend" "REST API providing authentication and authorization services" "Node.js 22+, Express 4.18, TypeScript 5.2" {
    tags "Backend" "API"
    # components inside...
}
```

Breaking it down:
- `backend` = variable
- `"CIAM Backend"` = diagram label
- `"REST API providing..."` = description
- `"Node.js 22+..."` = technology (shows what it's built with)
- `tags "Backend" "API"` = tags for styling

**Database example** (lines 134-137):
```dsl
database = container "PostgreSQL Database" "Stores user sessions, tokens, devices, and audit logs" "PostgreSQL 14+" {
    tags "Database"
    description "7 core tables: auth_contexts, auth_transactions, sessions, tokens, trusted_devices, drs_evaluations, audit_logs"
}
```

### Components (Level 3)

Components = **internal parts** of a container (classes, modules, services).

**Syntax**:
```dsl
componentVar = component "Component Name" "Description" "Type" {
    tags "TagName"
}
```

**Your controller example** (lines 24-26):
```dsl
authController = component "AuthController" "Handles login, logout, token refresh operations" "Express Controller" {
    tags "Controller"
}
```

**Your service example** (lines 44-46):
```dsl
tokenService = component "TokenService" "Generates, validates, and rotates JWT tokens" "Service" {
    tags "Service"
}
```

### Relationships (How Things Connect)

**Syntax**:
```dsl
source -> destination "Description" "Protocol/Technology"
```

**Your examples**:

**Person → System** (line 154):
```dsl
customer -> storefront "Browses products, makes purchases"
```

**Container → Container** (line 164):
```dsl
uiSdk -> backend "Makes API calls for authentication" "HTTPS/JSON (Port 8080)"
```

**Component → Component** (line 177):
```dsl
authController -> tokenService "Generates and validates tokens"
```

**Component → External** (line 211):
```dsl
deviceService -> drs "Submits device fingerprints for risk scoring"
```

---

## 🎨 Part 2: The VIEWS Section

Views define **which diagrams to create** from your model.

### System Context View (Level 1)

Shows the **big picture** - your system and its environment.

**Syntax**:
```dsl
systemContext softwareSystemVariable "ViewKey" {
    include *              # Include everything related to this system
    autoLayout lr          # Auto-arrange (lr = left-right)
    title "Diagram Title"
    description "What this diagram shows"
}
```

**Your example** (lines 265-270):
```dsl
systemContext ciamSuite "SystemContext" {
    include *
    autoLayout lr
    title "[System Context] CIAM Integration Suite"
    description "High-level view showing users, the CIAM platform, and external systems"
}
```

**What this creates**: A diagram showing Customer/Support Agent → CIAM Suite → LDAP/DRS/PostgreSQL

### Container View (Level 2)

Shows **applications and databases** inside a system.

**Syntax**:
```dsl
container softwareSystemVariable "ViewKey" {
    include *
    autoLayout lr
    title "Diagram Title"
    description "What this diagram shows"
}
```

**Your example** (lines 276-280):
```dsl
container ciamSuite "Containers" {
    include *
    autoLayout lr
    title "[Container] CIAM Integration Suite - Applications and Databases"
    description "Shows the applications, databases, and their interactions within the CIAM platform"
}
```

**What this creates**: Diagram showing Backend, UI SDK, Storefront, Account App, Database

### Component View (Level 3)

Shows **internal structure** of ONE container.

**Syntax**:
```dsl
component containerVariable "ViewKey" {
    include *
    autoLayout tb          # tb = top-bottom
    title "Diagram Title"
    description "What this diagram shows"
}
```

**Your backend example** (lines 285-290):
```dsl
component backend "BackendComponents" {
    include *
    autoLayout tb
    title "[Component] CIAM Backend - Internal Structure"
    description "Controllers, Services, and Repositories within the authentication API"
}
```

**What this creates**: Diagram showing AuthController, TokenService, Repositories, etc.

### AutoLayout Options

- `lr` = left-to-right
- `rl` = right-to-left
- `tb` = top-to-bottom
- `bt` = bottom-to-top

### Include Options

Instead of `include *` (include everything), you can be selective:

```dsl
include customer          # Include specific element
include customer backend  # Include multiple elements
include element.type==Container  # Include all containers
```

---

## 🎨 Part 3: STYLES Section

Styles control **how things look** (colors, shapes).

**Your styles** (lines 321-417):

```dsl
styles {
    # Element styles
    element "Person" {
        shape Person
        background #08427B
        color #ffffff
    }

    element "Backend" {
        shape RoundedBox
        background #438DD5
        color #ffffff
    }

    element "Database" {
        shape Cylinder
        background #438DD5
        color #ffffff
    }

    # Relationship styles
    relationship "Relationship" {
        thickness 2
        color #707070
        style solid
    }
}
```

**How it works**:
- `element "TagName"` = style for elements with this tag
- `shape` = Person, RoundedBox, Cylinder, Component, WebBrowser, etc.
- `background` = fill color (hex code)
- `color` = text color
- For relationships: `thickness`, `color`, `style` (solid/dashed/dotted)

---

## 🔧 Part 4: How to Make Changes

### Example 1: Add a New External System

**Task**: Add "Email Service" for sending notifications.

**In MODEL section**, add:
```dsl
# After line 149 (after drs definition)
emailService = softwareSystem "Email Service" "Sends notification emails to users" {
    tags "External"
}
```

**Add relationship**:
```dsl
# After line 170
backend -> emailService "Sends email notifications" "SMTP"
```

**Result**: Email Service will appear in:
- System Context diagram (automatically)
- Container diagram (automatically)

### Example 2: Add a New Container

**Task**: Add a "Notification Service" to CIAM Suite.

**In MODEL section**, inside `ciamSuite` block:
```dsl
# After database definition (line 137)
notificationService = container "Notification Service" "Handles email and push notifications" "Node.js, Bull Queue" {
    tags "Backend" "Service"
}
```

**Add relationships**:
```dsl
# In relationships section
backend -> notificationService "Sends notification requests" "HTTP/REST"
notificationService -> emailService "Sends emails" "SMTP"
```

**To see it**, you don't need to change views - it auto-appears in Container diagram!

### Example 3: Add a New Component to Backend

**Task**: Add "AuditController" to handle audit log queries.

**In MODEL section**, inside `backend` container:
```dsl
# After oidcController (line 41)
auditController = component "AuditController" "Provides audit log query endpoints" "Express Controller" {
    tags "Controller"
}
```

**Add relationship**:
```dsl
# In component relationships section
auditController -> repositories "Queries audit logs"
```

**Result**: Appears in Backend Components diagram automatically.

### Example 4: Create a New Component View

**Task**: Show components inside the Storefront app.

**In MODEL section**, first define components inside storefront container:
```dsl
# Inside storefront container definition (around line 122)
storefront = container "Storefront Web App" "Public-facing e-commerce website" "React 18.2, Vite 4.5, Port 3000" {
    tags "Frontend" "WebApp"

    # Add components
    productCatalog = component "Product Catalog" "Displays products" "React Component"
    shoppingCart = component "Shopping Cart" "Manages cart" "React Component"
    checkoutFlow = component "Checkout Flow" "Handles checkout" "React Component"
}
```

**In VIEWS section**, add new view:
```dsl
# After UiSdkComponents view
component storefront "StorefrontComponents" {
    include *
    autoLayout tb
    title "[Component] Storefront - Internal Structure"
    description "Product catalog, shopping cart, and checkout components"
}
```

---

## 🔍 Understanding Your File Structure

Your `ciam.dsl` is organized like this:

```
workspace "CIAM Integration Suite" {

    model {
        # PEOPLE (lines 7-8)
        customer, supportAgent

        # SOFTWARE SYSTEMS (lines 13-149)
        ciamSuite {
            # CONTAINERS (lines 20-137)
            backend {
                # COMPONENTS (lines 24-75)
                controllers, services, repositories, middleware
            }
            uiSdk {
                # COMPONENTS (lines 83-119)
                provider, components, hooks, services
            }
            storefront (no components)
            accountApp (no components)
            database (no components)
        }
        ldap (external)
        drs (external)

        # RELATIONSHIPS (lines 152-239)
        - People → Systems
        - Containers → Containers
        - Components → Components
        - Components → External
    }

    views {
        # 1 System Context view (lines 265-270)
        # 1 Container view (lines 276-280)
        # 2 Component views (lines 285-300)
        # 2 Filtered views (lines 307-316)
        # Styles (lines 321-417)
    }

    configuration {
        scope softwaresystem
    }
}
```

---

## 📝 Quick Reference

### Common Patterns

**Define a person**:
```dsl
user = person "Name" "Description"
```

**Define a system**:
```dsl
sys = softwareSystem "Name" "Description" { }
```

**Define a container**:
```dsl
app = container "Name" "Description" "Tech" {
    tags "Tag"
}
```

**Define a component**:
```dsl
comp = component "Name" "Description" "Type" {
    tags "Tag"
}
```

**Create relationship**:
```dsl
source -> destination "Description" "Protocol"
```

**Create view**:
```dsl
systemContext system "Key" {
    include *
    autoLayout lr
}
```

---

## 🎓 Learning Exercise

Try this to learn:

1. **Add a caching layer**:
   - Add Redis container to model
   - Add relationship: backend → redis
   - It will auto-appear in Container view!

2. **Add a new controller**:
   - Add AnalyticsController to backend components
   - Add relationship to repositories
   - It will auto-appear in Backend Components view!

3. **Experiment with layout**:
   - Change `autoLayout lr` to `autoLayout tb` in Container view
   - Restart Structurizr and see the difference

---

## 🔗 Official Resources

- **C4 Model**: https://c4model.com/
- **Structurizr DSL Syntax**: https://docs.structurizr.com/dsl
- **DSL Cookbook**: https://docs.structurizr.com/dsl/cookbook
- **Online Editor**: https://structurizr.com/dsl (test your DSL here!)

---

## ✅ Key Takeaways

1. **model** = Define architecture (what exists)
2. **views** = Define diagrams (how to show it)
3. **Variables** = Let you reference elements in relationships
4. **Tags** = Control styling (colors, shapes)
5. **Auto-layout** = Structurizr arranges boxes automatically
6. **include *** = Show everything related to that element

**Most important**: When you add things to the model, they automatically appear in the relevant views. You rarely need to change the views section!
