workspace "PROJECT_NAME" "PROJECT_DESCRIPTION" {

    model {
        # ============================================
        # PEOPLE (External Actors)
        # ============================================
        # Replace with your actual user personas
        user = person "End User" "Description of your primary user"
        admin = person "Administrator" "Description of admin users" {
            tags "Admin"
        }

        # ============================================
        # SOFTWARE SYSTEMS
        # ============================================
        yourSystem = softwareSystem "PROJECT_NAME" "PROJECT_DESCRIPTION" {

            # ============================================
            # CONTAINERS (Applications & Databases)
            # ============================================

            # Example: Web Application
            webapp = container "Web Application" "Description" "Technology stack (e.g., React, Node.js)" {
                tags "Frontend" "WebApp"

                # ============================================
                # COMPONENTS (Optional - Level 3)
                # ============================================
                # Add components if you want to show internal structure

                # Example components:
                # controller = component "Controller" "Handles HTTP requests" "Express Controller"
                # service = component "Service" "Business logic" "Service Class"
            }

            # Example: Backend API
            api = container "API Server" "Description" "Technology stack (e.g., Node.js, Express)" {
                tags "Backend" "API"
            }

            # Example: Database
            database = container "Database" "Description" "Technology (e.g., PostgreSQL, MongoDB)" {
                tags "Database"
            }
        }

        # ============================================
        # EXTERNAL SYSTEMS
        # ============================================
        # Add external systems your application integrates with
        # externalSystem = softwareSystem "External System Name" "Description" {
        #     tags "External"
        # }

        # ============================================
        # RELATIONSHIPS
        # ============================================
        # Define how people and systems interact

        # People to containers
        user -> webapp "Uses"
        admin -> webapp "Administers"

        # Container relationships
        webapp -> api "Makes API calls" "HTTPS/JSON"
        api -> database "Reads from and writes to" "SQL"

        # External system relationships
        # api -> externalSystem "Integrates with" "HTTPS/REST"
    }

    views {
        # ============================================
        # SYSTEM CONTEXT DIAGRAM (Level 1)
        # ============================================
        systemContext yourSystem "SystemContext" {
            include *
            autoLayout lr
            title "[System Context] PROJECT_NAME"
            description "High-level view of the system and its users"
        }

        # ============================================
        # CONTAINER DIAGRAM (Level 2)
        # ============================================
        container yourSystem "Containers" {
            include *
            autoLayout lr
            title "[Container] PROJECT_NAME - Applications"
            description "Applications, services, and databases within the system"
        }

        # ============================================
        # COMPONENT DIAGRAM (Level 3) - Optional
        # ============================================
        # Uncomment if you defined components above
        # component api "ApiComponents" {
        #     include *
        #     autoLayout tb
        #     title "[Component] API Server - Internal Structure"
        #     description "Components within the API server"
        # }

        # ============================================
        # STYLES
        # ============================================
        styles {
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

            element "Frontend" {
                shape WebBrowser
                background #85BBF0
                color #000000
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

            element "Component" {
                background #85BBF0
                color #000000
            }
        }

        theme default
    }

    configuration {
        scope softwaresystem
    }
}
