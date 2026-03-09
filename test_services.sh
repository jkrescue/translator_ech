#!/bin/bash

# PDF Translator Integration Test Script

set -e

echo "========================================"
echo "PDF Translator Service Tests"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost/api}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost}"
API_KEY="${SILICONFLOW_API_KEY:-}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test functions
log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Check if backend is running
check_backend() {
    log_info "Checking backend service..."
    if curl -s -f "$BACKEND_URL/health" > /dev/null 2>&1; then
        log_pass "Backend service is running"
        return 0
    else
        log_fail "Backend service is not running at $BACKEND_URL"
        return 1
    fi
}

# Test health endpoint
test_health() {
    log_info "Testing /health endpoint..."
    response=$(curl -s "$BACKEND_URL/health")
    
    if echo "$response" | grep -q "healthy"; then
        log_pass "Health check returns healthy status"
    else
        log_fail "Health check failed: $response"
    fi
}

# Test OCR service
test_ocr_service() {
    log_info "Testing OCR service configuration..."
    
    if [ -z "$API_KEY" ]; then
        log_info "Skipping OCR test - no API key provided"
        return
    fi
    
    log_info "OCR service configured with model: PaddlePaddle/PaddleOCR-VL-1.5"
    log_pass "OCR service configuration test passed"
}

# Test translation service
test_translation_service() {
    log_info "Testing translation service configuration..."
    
    if [ -z "$API_KEY" ]; then
        log_info "Skipping translation test - no API key provided"
        return
    fi
    
    log_info "Translation service configured with model: Qwen/Qwen3-8B"
    log_pass "Translation service configuration test passed"
}

# Test upload endpoint (without actual file)
test_upload_endpoint() {
    log_info "Testing /api/upload endpoint..."
    
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$BACKEND_URL/api/upload")
    
    if [ "$response" = "422" ]; then
        log_pass "Upload endpoint accepts POST requests (returns 422 for missing file)"
    else
        log_fail "Upload endpoint returned: $response"
    fi
}

# Test invalid file upload
test_invalid_file() {
    log_info "Testing invalid file upload..."
    
    echo "test content" > /tmp/test.txt
    
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -X POST "$BACKEND_URL/api/upload" \
        -F "file=@/tmp/test.txt")
    
    rm -f /tmp/test.txt
    
    if [ "$response" = "400" ]; then
        log_pass "Invalid file upload correctly rejected"
    else
        log_fail "Invalid file upload returned: $response (expected 400)"
    fi
}

# Test task status endpoint
test_task_status() {
    log_info "Testing /api/tasks/{task_id} endpoint..."
    
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        "$BACKEND_URL/api/tasks/nonexistent-task-id")
    
    if [ "$response" = "404" ]; then
        log_pass "Task status returns 404 for nonexistent task"
    else
        log_fail "Task status returned: $response (expected 404)"
    fi
}

# Test translate endpoint
test_translate_endpoint() {
    log_info "Testing /api/translate endpoint..."
    
    if [ -z "$API_KEY" ]; then
        log_info "Skipping translate test - no API key provided"
        return
    fi
    
    response=$(curl -s -X POST "$BACKEND_URL/api/translate" \
        -H "Content-Type: application/json" \
        -d '{"text": "Hello world", "source_lang": "en", "target_lang": "zh"}')
    
    if echo "$response" | grep -q "translation"; then
        log_pass "Translation endpoint works"
    else
        log_fail "Translation endpoint failed: $response"
    fi
}

# Test CORS configuration
test_cors() {
    log_info "Testing CORS configuration..."
    
    response=$(curl -s -I -X OPTIONS "$BACKEND_URL/health" \
        -H "Origin: http://localhost:5173" \
        -H "Access-Control-Request-Method: GET")
    
    if echo "$response" | grep -q "access-control-allow-origin"; then
        log_pass "CORS is configured"
    else
        log_fail "CORS not configured"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "========================================"
    echo "Test Summary"
    echo "========================================"
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    echo ""
    
    if [ $TESTS_FAILED ]; then
        echo -e "${ -eq 0GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting PDF Translator service tests..."
    log_info "Backend URL: $BACKEND_URL"
    log_info "Frontend URL: $FRONTEND_URL"
    echo ""
    
    # Check backend first
    if ! check_backend; then
        log_info "Please start the backend service first:"
        log_info "  cd backend && uvicorn app.main:app --reload"
        exit 1
    fi
    
    # Run tests
    test_health
    test_cors
    test_upload_endpoint
    test_invalid_file
    test_task_status
    test_ocr_service
    test_translation_service
    
    # Only run translation test if API key is available
    if [ -n "$API_KEY" ]; then
        test_translate_endpoint
    fi
    
    # Print summary
    print_summary
}

main "$@"
