#!/bin/bash

echo "🧪 Testing MFA Dialog Fix"
echo "========================="

echo "1. Testing backend connectivity..."
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mfauser","password":"password"}' \
  -s -w "\nHTTP Status: %{http_code}\n" \
  | grep -E "(responseTypeCode|available_methods|HTTP Status)"

echo ""
echo "2. Testing both applications are running..."
echo "Storefront (port 3000):"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000

echo "Account Servicing (port 3001):"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3001

echo ""
echo "3. Manual Test Instructions:"
echo "📱 Storefront Test (INLINE variant - was broken, now fixed):"
echo "   1. Go to http://localhost:3000"
echo "   2. In navigation bar, enter: mfauser / password"
echo "   3. ✅ MFA method selection dialog should appear"
echo "   4. Select OTP method"
echo "   5. Enter code: 1234"
echo "   6. ✅ Authentication should complete"
echo ""
echo "🖥️  Account Servicing Test (FORM variant - should still work):"
echo "   1. Go to http://localhost:3001"
echo "   2. In login form, enter: mfauser / password"
echo "   3. ✅ MFA method selection dialog should appear"
echo "   4. Select OTP method"
echo "   5. Enter code: 1234"
echo "   6. ✅ Authentication should complete"
echo ""
echo "🔧 Technical Fix Applied:"
echo "   - AuthService now passes 'available_methods' field from backend"
echo "   - MfaMethodSelectionDialog moved outside variant-specific returns"
echo "   - Dialog now renders for ALL variants (form, inline, button)"
echo ""
echo "✅ Expected Result: Both applications show MFA dialog identically"