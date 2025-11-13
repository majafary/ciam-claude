# Overview

The CIAM Integration Suite provides customer identity and access management capabilities for web applications.

## Purpose

The CIAM platform delivers:

- **Authentication & Authorization**: Secure user login and access control
- **Multi-Factor Authentication (MFA)**: OTP and Push notification support
- **Device Trust**: Integration with Transmit DRS for device risk scoring
- **Session Management**: Secure session lifecycle with JWT token rotation
- **Electronic Signatures**: eSign acceptance and verification

## Architecture Levels

This documentation follows the C4 model with three levels:

1. **System Context** - High-level view of users, CIAM suite, and external systems
2. **Containers** - Applications, databases, and their interactions
3. **Components** - Internal structure of backend API and UI SDK

## Quick Navigation

- Use the diagram dropdown to navigate between views
- Click on boxes in diagrams to drill down to more detail
- Explore the Components view to see internal structure

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18.2, TypeScript 5.2, Material-UI 5.14 | Web UIs and SDK |
| Backend | Node.js 22+, Express 4.18, TypeScript | REST API |
| Database | PostgreSQL 14+ | Data persistence |
| Build | Vite 4.5, npm workspaces | Development & bundling |
| Deployment | Docker, Docker Compose | Containerization |
| Testing | Jest, React Testing Library | Unit & integration tests |
