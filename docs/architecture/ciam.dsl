workspace "CIAM Integration Suite" "Customer Identity and Access Management platform with multi-factor authentication, device trust, and electronic signatures" {

    model {
        # ============================================
        # PEOPLE (External Actors)
        # ============================================
        customer = person "Customer" "End user accessing secure webapp"

        # ============================================
        # SOFTWARE SYSTEMS
        # ============================================
        ciamSuite = softwareSystem "CIAM Integration Suite" "Customer identity and access management platform providing authentication, MFA, device trust, and session management" {

            # ============================================
            # CONTAINERS (Applications & Databases)
            # ============================================

            # Backend API
            backend = container "CIAM Backend" "REST API providing authentication and authorization services" "Node.js 22+, Express 4.18, TypeScript 5.2" {
                tags "Backend" "API"

                # Controllers Layer
                authController = component "AuthController" "Handles login, logout, token refresh operations" "Express Controller" {
                    tags "Controller"
                }
                mfaController = component "MfaController" "Manages multi-factor authentication flows (OTP, Push)" "Express Controller" {
                    tags "Controller"
                }
                deviceController = component "DeviceController" "Manages trusted device binding and verification" "Express Controller" {
                    tags "Controller"
                }
                sessionController = component "SessionController" "Handles session lifecycle management" "Express Controller" {
                    tags "Controller"
                }
                userController = component "UserController" "Provides user profile information" "Express Controller" {
                    tags "Controller"
                }
                oidcController = component "OIDCController" "Provides OpenID Connect discovery endpoints" "Express Controller" {
                    tags "Controller"
                }

                # Services Layer
                tokenService = component "TokenService" "Generates, validates, and rotates JWT tokens" "Service" {
                    tags "Service"
                }
                mfaService = component "MfaService" "Orchestrates multi-factor authentication logic" "Service" {
                    tags "Service"
                }
                deviceService = component "DeviceService" "Manages device fingerprinting and trust evaluation" "Service" {
                    tags "Service"
                }
                sessionService = component "SessionService" "Manages user session lifecycle and validation" "Service" {
                    tags "Service"
                }
                esignService = component "ESignService" "Handles electronic signature acceptance and verification" "Service" {
                    tags "Service"
                }
                userService = component "UserService" "Provides user data access and management" "Service" {
                    tags "Service"
                }

                # Data Access Layer
                repositories = component "Repositories" "Data access layer for database operations" "Repository Pattern" {
                    tags "Repository"
                    description "AuthContext, Session, Token, TrustedDevice, DrsEvaluation, AuditLog, AuthTransaction repositories"
                }

                # Middleware
                authMiddleware = component "Auth Middleware" "JWT token validation and route protection" "Express Middleware" {
                    tags "Middleware"
                }
                rateLimiter = component "Rate Limiter" "API rate limiting and DDoS protection" "Express Middleware" {
                    tags "Middleware"
                }
            }

            # UI SDK Library
            uiSdk = container "CIAM UI SDK" "Reusable React components and hooks for authentication flows" "React 18.2, TypeScript 5.2, Material-UI 5.14" {
                tags "Frontend" "Library"

                # Context & Providers
                ciamProvider = component "CiamProvider" "React context provider for authentication state management" "React Context" {
                    tags "Context"
                }

                # UI Components
                loginComponent = component "CiamLoginComponent" "Login form with username/password authentication" "React Component" {
                    tags "Component"
                }
                mfaDialog = component "MfaMethodSelectionDialog" "MFA method selection (OTP, Push)" "React Component" {
                    tags "Component"
                }
                deviceBindDialog = component "DeviceBindDialog" "Device trust consent and binding UI" "React Component" {
                    tags "Component"
                }
                esignDialog = component "ESignDialog" "Electronic signature acceptance dialog" "React Component" {
                    tags "Component"
                }
                protectedRoute = component "ProtectedRoute" "Route guard component for authenticated pages" "React Component" {
                    tags "Component"
                }
                protectedApp = component "CiamProtectedApp" "Wrapper component for entire authenticated application" "React Component" {
                    tags "Component"
                }

                # Hooks
                useAuthHook = component "useAuth Hook" "Custom hook for authentication state and user info" "React Hook" {
                    tags "Hook"
                }
                useMfaHook = component "useMfa Hook" "Custom hook for MFA operations" "React Hook" {
                    tags "Hook"
                }

                # Services
                authService = component "AuthService" "HTTP client for CIAM Backend API calls" "API Client" {
                    tags "Service"
                }
            }

            # Storefront Web Application
            storefront = container "Storefront Web App" "Public-facing e-commerce website" "React 18.2, Vite 4.5, Port 3000" {
                tags "Frontend" "WebApp"
                description "Public storefront with product browsing and shopping cart, uses CIAM UI SDK for authentication"
            }

            # Account Servicing Web Application
            accountApp = container "Account Servicing Web App" "Secure customer account management portal" "React 18.2, Vite 4.5, Port 3001" {
                tags "Frontend" "WebApp"
                description "Authenticated account management interface for customers and support agents, uses CIAM UI SDK"
            }

            # Database
            database = container "PostgreSQL Database" "Stores user sessions, tokens, devices, and audit logs" "PostgreSQL 14+" {
                tags "Database"
                description "7 core tables: auth_contexts, auth_transactions, sessions, tokens, trusted_devices, drs_evaluations, audit_logs"
            }       
        }

        # ============================================
        # EXTERNAL SYSTEMS
        # ============================================
        ldap = softwareSystem "LDAP Directory" "Corporate user directory for credential validation" {
            tags "External"
        }

        drs = softwareSystem "Transmit DRS" "Device Risk Scoring service for fraud prevention" {
            tags "External"
        }        

        # ============================================
        # RELATIONSHIPS - People to Systems
        # ============================================
        customer -> storefront "Non-secure Landing Page"
        customer -> accountApp "Account servicing"

        # ============================================
        # RELATIONSHIPS - Container Level
        # ============================================
        storefront -> uiSdk "Imports authentication components"
        accountApp -> uiSdk "Imports authentication components"

        uiSdk -> backend "Makes API calls for authentication" "HTTPS/JSON (Port 8080)"

        backend -> database "Reads from and writes to" "SQL via Kysely"
        backend -> ldap "Validates user credentials" "LDAPS"
        backend -> drs "Requests device risk scores" "HTTPS/REST"

        # ============================================
        # RELATIONSHIPS - Component Level (Backend)
        # ============================================

        # Controllers to Services
        authController -> tokenService "Generates and validates tokens"
        authController -> sessionService "Creates and manages sessions"
        authController -> userService "Retrieves user information"
        authController -> deviceService "Evaluates device trust"

        mfaController -> mfaService "Orchestrates MFA flows"
        mfaController -> tokenService "Validates authentication state"
        mfaController -> sessionService "Updates session MFA status"

        deviceController -> deviceService "Binds trusted devices"
        deviceController -> sessionService "Associates devices with sessions"

        sessionController -> sessionService "Manages session lifecycle"
        sessionController -> tokenService "Revokes tokens on logout"

        userController -> userService "Retrieves user profile data"

        # Services to Repositories
        tokenService -> repositories "CRUD operations on tokens"
        sessionService -> repositories "CRUD operations on sessions"
        deviceService -> repositories "CRUD operations on trusted devices and DRS evaluations"
        mfaService -> repositories "Logs MFA transactions"
        userService -> repositories "Retrieves user data"
        esignService -> repositories "Records e-signature acceptance"

        # Repositories to Database
        repositories -> database "Executes SQL queries"

        # Middleware
        authMiddleware -> tokenService "Validates JWT tokens"
        rateLimiter -> authController "Rate limits authentication attempts"
        rateLimiter -> mfaController "Rate limits MFA attempts"

        # External Integration
        deviceService -> drs "Submits device fingerprints for risk scoring"
        userService -> ldap "Validates credentials"

        # ============================================
        # RELATIONSHIPS - Component Level (UI SDK)
        # ============================================

        # Components to Context
        loginComponent -> ciamProvider "Accesses auth context"
        mfaDialog -> ciamProvider "Accesses auth context"
        deviceBindDialog -> ciamProvider "Accesses auth context"
        esignDialog -> ciamProvider "Accesses auth context"
        protectedRoute -> ciamProvider "Checks authentication state"
        protectedApp -> ciamProvider "Provides auth context to app"

        # Hooks to Context
        useAuthHook -> ciamProvider "Reads authentication state"
        useMfaHook -> ciamProvider "Reads MFA state"

        # Hooks to Services
        useAuthHook -> authService "Makes API calls"
        useMfaHook -> authService "Makes API calls"

        # Components to Hooks
        loginComponent -> useAuthHook "Uses authentication logic"
        mfaDialog -> useMfaHook "Uses MFA logic"

        # Service to Backend
        authService -> backend "HTTP requests for auth operations"

        # ============================================
        # DEPLOYMENT (Optional - for future)
        # ============================================
        # Uncomment when deploying to cloud
        # deploymentEnvironment "Production" {
        #     deploymentNode "AWS" {
        #         deploymentNode "ECS Cluster" {
        #             containerInstance backend
        #         }
        #         deploymentNode "CloudFront" {
        #             containerInstance storefront
        #             containerInstance accountApp
        #         }
        #         deploymentNode "RDS" {
        #             containerInstance database
        #         }
        #     }
        # }
    }

    views {
        # ============================================
        # SYSTEM CONTEXT DIAGRAM (Level 1)
        # ============================================
        systemContext ciamSuite "SystemContext" {
            include *
            autoLayout lr
            title "[System Context] CIAM Integration Suite1"
            description "High-level view showing users, the CIAM platform, and external systems"
        }
        
        # ============================================
        # CONTAINER DIAGRAM (Level 2)
        # ============================================
        container ciamSuite "Containers" {
            include *
            autoLayout lr
            title "[Container] CIAM Integration Suite - Applications and Databases"
            description "Shows the applications, databases, and their interactions within the CIAM platform"
        }

        # ============================================
        # COMPONENT DIAGRAM - Backend (Level 3)
        # ============================================
        component backend "BackendComponents" {
            include *
            autoLayout tb
            title "[Component] CIAM Backend - Internal Structure"
            description "Controllers, Services, and Repositories within the authentication API"
        }

        # ============================================
        # COMPONENT DIAGRAM - UI SDK (Level 3)
        # ============================================
        component uiSdk "UiSdkComponents" {
            include *
            autoLayout tb
            title "[Component] CIAM UI SDK - React Components and Hooks"
            description "Reusable authentication components, hooks, and services for web applications"
        }

        # ============================================
        # STYLES
        # ============================================
        styles {
            # Element Styles
            element "Person" {
                shape Person
                background #08427B
                color #ffffff
            }

            element "Software System" {
                background #1168BD
                color #ffffff
            }

            element "External" {
                background #999999
                color #ffffff
            }

            element "Container" {
                background #438DD5
                color #ffffff
            }

            element "Backend" {
                shape RoundedBox
                background #438DD5
                color #ffffff
            }

            element "Frontend" {
                shape WebBrowser
                background #85BBF0
                color #000000
            }

            element "Library" {
                shape Component
                background #85BBF0
                color #000000
            }

            element "Database" {
                shape Cylinder
                background #438DD5
                color #ffffff
            }

            element "Component" {
                background #85BBF0
                color #000000
            }

            element "Controller" {
                background #5A9FD4
                color #ffffff
            }

            element "Service" {
                background #7CAFDD
                color #000000
            }

            element "Repository" {
                background #A1C5E7
                color #000000
            }

            element "Middleware" {
                background #CCDBEF
                color #000000
            }

            element "Context" {
                background #D4A5A5
                color #000000
            }

            element "Hook" {
                background #A8D8EA
                color #000000
            }

            # Relationship Styles
            relationship "Relationship" {
                thickness 2
                color #707070
                style solid
            }

            relationship "Reads from and writes to" {
                thickness 4
            }

            relationship "Makes API calls" {
                style dashed
            }
        }

        # ============================================
        # THEME
        # ============================================
        theme default
    }

    # ============================================
    # CONFIGURATION
    # ============================================
    configuration {
        scope softwaresystem
    }
}