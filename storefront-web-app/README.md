# Storefront Web Application

Public-facing storefront application with CIAM authentication integration.

## 🚀 Features

- **Public Storefront**: Non-secure route accessible to all visitors
- **CIAM Integration**: Login/logout functionality in navigation
- **Account Access**: Direct link to Account Servicing after login
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Material-UI**: Modern, accessible user interface
- **TypeScript**: Full type safety

## 📦 Installation

```bash
npm install
```

## 🎯 Development

```bash
npm run dev
```

Application starts on `http://localhost:3000`

## 🔧 Configuration

### Environment Variables (.env.local)

```bash
VITE_CIAM_BACKEND_URL=http://localhost:8080
VITE_ACCOUNT_SERVICING_URL=http://localhost:3001
```

## 🧪 User Flow Testing

### 1. Anonymous User (Not Logged In)
- Visit `http://localhost:3000`
- See storefront page with login form in navigation
- Enter credentials to log in

### 2. Authentication Flow
- Enter `testuser` / `password`
- Complete MFA with OTP `1234`
- User stays on storefront page
- Navigation shows user info and logout button
- **"View My Account" button** appears for authenticated users

### 3. Account Access
- Click "View My Account" button
- Redirects to `http://localhost:3001` (Account Servicing)
- User is already authenticated, so loads immediately

## 📋 Test Credentials

| Username | Password | Expected Behavior |
|----------|----------|------------------|
| `testuser` | `password` | ✅ Login → MFA → Success |
| `userlockeduser` | `password` | ❌ Account locked error |
| `mfalockeduser` | `password` | ✅ Login → ❌ MFA locked |

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Navigation.tsx   # Main navigation with CIAM login
│   ├── StorefrontHero.tsx # Hero section
│   └── ProductGrid.tsx  # Mock product display
├── pages/              # Page components
│   └── StorefrontPage.tsx # Main storefront page
├── App.tsx             # Main application component
├── main.tsx            # Application entry point
└── vite-env.d.ts       # Vite type definitions
```

## 🎨 Components

### Navigation
- Responsive navigation bar
- CIAM login component integration
- User info display when authenticated
- "View My Account" button for logged-in users

### StorefrontHero
- Welcome message and branding
- Call-to-action buttons
- Responsive layout

### ProductGrid
- Mock product listings
- Grid layout with Material-UI cards
- Placeholder for actual e-commerce integration

## 🔒 Security Features

- **No Sensitive Routes**: All content is public
- **Secure Authentication**: Uses CIAM UI SDK
- **CORS Configured**: Works with CIAM backend
- **XSS Protection**: React's built-in protections
- **Type Safety**: TypeScript prevents runtime errors

## 📱 Responsive Design

### Breakpoints
- **Mobile**: < 600px
- **Tablet**: 600px - 960px
- **Desktop**: > 960px

### Features
- Responsive navigation (hamburger menu on mobile)
- Flexible grid layouts
- Touch-friendly buttons and forms
- Optimized typography scaling

## 🚀 Build & Deploy

### Development
```bash
npm run dev          # Start development server
npm run test         # Run unit tests
npm run lint         # Run ESLint
npm run type-check   # TypeScript checking
```

### Production
```bash
npm run build        # Build for production
npm run preview      # Preview production build
```

### Docker
```bash
# From project root
docker-compose up storefront-web-app
```

## 🧪 Testing

### Unit Tests
```bash
npm run test
npm run test:coverage
```

### Manual Testing Scenarios

#### 1. Anonymous Browsing
- [ ] Page loads without authentication
- [ ] Navigation shows login form
- [ ] Products/content visible to all users

#### 2. Login Flow
- [ ] Enter valid credentials (testuser/password)
- [ ] MFA challenge appears
- [ ] Enter OTP (1234)
- [ ] Login successful, navigation updates

#### 3. Authenticated State
- [ ] User info displayed in navigation
- [ ] "View My Account" button visible
- [ ] Logout functionality works

#### 4. Account Access
- [ ] Click "View My Account"
- [ ] Redirects to Account Servicing app
- [ ] Authentication state maintained

#### 5. Error Scenarios
- [ ] Invalid credentials show error
- [ ] Account locked scenario
- [ ] MFA locked scenario
- [ ] Network errors handled gracefully

## 🔧 Development Notes

### CIAM UI SDK Integration
```tsx
import { CiamProvider, CiamLoginComponent } from 'ciam-ui';

// Wrap app with provider
<CiamProvider backendUrl={import.meta.env.VITE_CIAM_BACKEND_URL}>
  <App />
</CiamProvider>

// Use login component in navigation
<CiamLoginComponent
  variant="inline"
  showUserInfo={true}
  onLoginSuccess={handleLoginSuccess}
/>
```

### Environment Configuration
- Uses Vite environment variables
- Supports different configurations per environment
- CORS URLs must match backend configuration

### State Management
- Uses CIAM UI SDK for authentication state
- Local component state for UI interactions
- React Context through CIAM provider

## 🆘 Troubleshooting

### Common Issues

**Login not working**:
- Check CIAM backend is running on port 8080
- Verify CORS origins include localhost:3000
- Check browser network tab for API calls

**CIAM UI not found**:
- Run `npm install` to link local CIAM UI package
- Check that `ciam-ui` package builds successfully

**Styles not loading**:
- Ensure Material-UI dependencies are installed
- Check that Emotion CSS-in-JS is working

**Redirect not working**:
- Verify Account Servicing app URL in environment
- Check that target application is running

### Debug Mode
Set environment variable:
```bash
VITE_DEBUG_CIAM=true
```

### Production Checklist
- [ ] Update CIAM backend URL for production
- [ ] Configure proper CORS origins
- [ ] Update Account Servicing URL
- [ ] Test authentication flows
- [ ] Verify responsive design
- [ ] Check accessibility compliance
- [ ] Run security audit

## 📚 Integration Examples

### Custom Styling
```tsx
<CiamLoginComponent
  customStyles={{
    maxWidth: 300,
    backgroundColor: '#f5f5f5'
  }}
/>
```

### Event Handling
```tsx
<CiamLoginComponent
  onLoginSuccess={(user) => {
    console.log('User logged in:', user);
    // Custom success logic
  }}
  onLoginError={(error) => {
    console.error('Login failed:', error);
    // Custom error handling
  }}
/>
```

---

**🛒 Ready for production e-commerce with secure authentication!**