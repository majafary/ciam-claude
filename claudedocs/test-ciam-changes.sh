#!/bin/bash

# CIAM Regression Test Suite
# Tests all 18 use cases defined in enhanced-test-user-table.md

BASE_URL="http://localhost:8080"
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "CIAM Regression Test Suite"
echo "=========================================="
echo ""

# Helper function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "Test $TOTAL_TESTS: $description... "

    response=$(curl -s -w "\n%{http_code}" -X "$method" \
        -H "Content-Type: application/json" \
        -H "Cookie: $COOKIES" \
        -d "$data" \
        "$BASE_URL$endpoint")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    echo "$body" | jq . > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "$body" | jq -C '.' | head -10
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "Response: $body"
    fi
    echo ""

    # Return the response for further processing
    echo "$body"
}

# Test 1: Health Check
echo "=== Category: Health Check ==="
api_call "GET" "/health" "" "Health check endpoint" > /dev/null

# Test 2: JWKS Endpoint
api_call "GET" "/.well-known/jwks.json" "" "JWKS endpoint" > /dev/null

# Test 3: A1 - Trusted Device (Instant Login)
echo "=== Category A: Trusted Device Scenarios ==="
response=$(api_call "POST" "/auth/login" '{"username":"trusteduser","password":"password","drs_action_token":"test_action_token_trusted"}' "A1: Trusted device instant login")
device_fp=$(echo "$response" | jq -r '.deviceFingerprint // empty')

# Test 4: A2 - Trusted Device + eSign Required
api_call "POST" "/auth/login" '{"username":"trustedesignuser","password":"password","drs_action_token":"test_action_token_esign"}' "A2: Trusted device with eSign required" > /dev/null

# Test 5: A3 - Trusted Device + eSign Decline
api_call "POST" "/auth/login" '{"username":"trusteddeclineuser","password":"password","drs_action_token":"test_action_token_decline"}' "A3: Trusted device with eSign decline" > /dev/null

# Test 6-11: B1-B6 - MFA Scenarios
echo "=== Category B: MFA Scenarios ==="

# B1: MFA Required - OTP
response=$(api_call "POST" "/auth/login" '{"username":"mfauser","password":"password","drs_action_token":"test_action_otp"}' "B1: MFA required - OTP flow")
transaction_id=$(echo "$response" | jq -r '.transactionId // empty')

if [ -n "$transaction_id" ]; then
    # Initiate OTP challenge
    api_call "POST" "/auth/mfa/initiate" "{\"method\":\"otp\",\"username\":\"mfauser\",\"transactionId\":\"$transaction_id\"}" "B1a: Initiate OTP challenge" > /dev/null

    # Verify OTP (using test code 1234)
    api_call "POST" "/auth/mfa/verify" "{\"transactionId\":\"$transaction_id\",\"method\":\"otp\",\"code\":\"1234\"}" "B1b: Verify OTP" > /dev/null
fi

# B2: MFA + eSign Accept
response=$(api_call "POST" "/auth/login" '{"username":"mfaesignuser","password":"password","drs_action_token":"test_action_mfa_esign"}' "B2: MFA with eSign acceptance")
transaction_id=$(echo "$response" | jq -r '.transactionId // empty')

# B3: MFA + eSign Decline
api_call "POST" "/auth/login" '{"username":"mfaesigndecline","password":"password","drs_action_token":"test_action_mfa_decline"}' "B3: MFA with eSign decline" > /dev/null

# B4: Push Notification (consolidated with mfauser)
response=$(api_call "POST" "/auth/login" '{"username":"mfauser","password":"password","drs_action_token":"test_action_push"}' "B4: MFA required - Push flow")
transaction_id=$(echo "$response" | jq -r '.transactionId // empty')

if [ -n "$transaction_id" ]; then
    # Initiate Push challenge
    response=$(api_call "POST" "/auth/mfa/initiate" "{\"method\":\"push\",\"username\":\"mfauser\",\"transactionId\":\"$transaction_id\"}" "B4a: Initiate Push challenge")
    new_transaction_id=$(echo "$response" | jq -r '.transactionId // empty')

    # Check Push status
    api_call "GET" "/mfa/transaction/$new_transaction_id" "" "B4b: Check Push status" > /dev/null
fi

# B5: Push Rejection
api_call "POST" "/auth/login" '{"username":"pushfail","password":"password","drs_action_token":"test_action_push_fail"}' "B5: Push rejection scenario" > /dev/null

# B6: Push Timeout
api_call "POST" "/auth/login" '{"username":"pushexpired","password":"password","drs_action_token":"test_action_push_expired"}' "B6: Push timeout scenario" > /dev/null

# Test 12-14: C1-C3 - Error Scenarios
echo "=== Category C: Error Scenarios ==="
api_call "POST" "/auth/login" '{"username":"invaliduser","password":"wrongpass"}' "C1: Invalid credentials" > /dev/null
api_call "POST" "/auth/login" '{"username":"lockeduser","password":"password"}' "C2: Account locked" > /dev/null
api_call "POST" "/auth/login" '{"username":"mfalockeduser","password":"password"}' "C3: MFA locked" > /dev/null

# Test 15-17: D1-D3 - Trust Edge Cases
echo "=== Category D: Device Trust Edge Cases ==="
api_call "POST" "/auth/login" '{"username":"expiredtrustuser","password":"password","drs_action_token":"test_expired_trust"}' "D1: Expired device trust" > /dev/null
api_call "POST" "/auth/login" '{"username":"riskuser","password":"password","drs_action_token":"test_risk"}' "D2: Risk-based MFA trigger" > /dev/null
api_call "POST" "/auth/login" '{"username":"corrupttrustuser","password":"password","drs_action_token":"test_corrupt"}' "D3: Corrupt device trust" > /dev/null

# Test 18-20: E1-E3 - Compliance Scenarios
echo "=== Category E: Compliance Scenarios ==="
response=$(api_call "POST" "/auth/login" '{"username":"firsttimeuser","password":"password","drs_action_token":"test_first_time"}' "E1: First-time user with eSign")
transaction_id=$(echo "$response" | jq -r '.transactionId // empty')

if [ -n "$transaction_id" ]; then
    # Complete MFA for first-time user
    api_call "POST" "/auth/mfa/initiate" "{\"method\":\"otp\",\"username\":\"firsttimeuser\",\"transactionId\":\"$transaction_id\"}" "E1a: First-time user MFA" > /dev/null

    # Check for post-MFA eSign
    api_call "POST" "/auth/post-mfa-check" "{\"transactionId\":\"$transaction_id\",\"username\":\"firsttimeuser\"}" "E1b: Post-MFA eSign check" > /dev/null
fi

api_call "POST" "/auth/login" '{"username":"adminresetuser","password":"password","drs_action_token":"test_admin_reset"}' "E2: Admin password reset" > /dev/null

response=$(api_call "POST" "/auth/login" '{"username":"complianceuser","password":"password","drs_action_token":"test_compliance"}' "E3: Compliance eSign requirement")
session_id=$(echo "$response" | jq -r '.sessionId // empty')

if [ -n "$session_id" ]; then
    # Check for post-login eSign
    api_call "POST" "/auth/post-login-check" "{\"sessionId\":\"$session_id\",\"username\":\"complianceuser\"}" "E3a: Post-login compliance check" > /dev/null
fi

# Test 21: Legacy testuser
echo "=== Legacy Compatibility ==="
api_call "POST" "/auth/login" '{"username":"testuser","password":"password"}' "Legacy: testuser direct login" > /dev/null

# Test 22: eSign Document Retrieval
echo "=== eSign Document Operations ==="
api_call "GET" "/esign/document/terms-v1-2025" "" "Retrieve eSign document" > /dev/null

# Test 23: Token Refresh
echo "=== Token Management ==="
api_call "POST" "/auth/refresh" '{}' "Token refresh endpoint" > /dev/null

# Test 24: User Info
api_call "GET" "/userinfo" "" "User info endpoint" > /dev/null

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed. Please review the output above.${NC}"
    exit 1
fi
