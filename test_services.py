#!/usr/bin/env python3
"""
PDF Translator Service Test Suite

This script tests both frontend and backend services.
"""

import os
import sys
import json
import time
import subprocess
import requests
from pathlib import Path
from typing import Dict, List, Optional


class TestRunner:
    def __init__(self, backend_url: str = "http://localhost/api"):
        self.backend_url = backend_url
        self.passed = 0
        self.failed = 0
        self.api_key = os.getenv("SILICONFLOW_API_KEY", "")
    
    def log_pass(self, msg: str):
        print(f"\033[92m[PASS]\033[0m {msg}")
        self.passed += 1
    
    def log_fail(self, msg: str):
        print(f"\033[91m[FAIL]\033[0m {msg}")
        self.failed += 1
    
    def log_info(self, msg: str):
        print(f"\033[93m[INFO]\033[0m {msg}")
    
    def test_backend_health(self) -> bool:
        """Test backend health endpoint"""
        self.log_info("Testing backend health...")
        try:
            response = requests.get(f"{self.backend_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log_pass("Backend health check passed")
                    return True
            self.log_fail(f"Health check failed: {response.status_code}")
            return False
        except Exception as e:
            self.log_fail(f"Backend not reachable: {e}")
            return False
    
    def test_cors(self) -> bool:
        """Test CORS configuration"""
        self.log_info("Testing CORS...")
        try:
            response = requests.options(
                f"{self.backend_url}/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET"
                }
            )
            if "access-control-allow-origin" in response.headers:
                self.log_pass("CORS is configured")
                return True
            self.log_fail("CORS not configured")
            return False
        except Exception as e:
            self.log_fail(f"CORS test failed: {e}")
            return False
    
    def test_upload_endpoint(self) -> bool:
        """Test PDF upload endpoint"""
        self.log_info("Testing upload endpoint...")
        try:
            response = requests.post(f"{self.backend_url}/api/upload")
            if response.status_code == 422:
                self.log_pass("Upload endpoint accepts POST (needs file)")
                return True
            self.log_fail(f"Unexpected status: {response.status_code}")
            return False
        except Exception as e:
            self.log_fail(f"Upload test failed: {e}")
            return False
    
    def test_invalid_file(self) -> bool:
        """Test invalid file rejection"""
        self.log_info("Testing invalid file rejection...")
        try:
            files = {"file": ("test.txt", b"test", "text/plain")}
            response = requests.post(f"{self.backend_url}/api/upload", files=files)
            if response.status_code == 400:
                self.log_pass("Invalid file correctly rejected")
                return True
            self.log_fail(f"Expected 400, got {response.status_code}")
            return False
        except Exception as e:
            self.log_fail(f"Invalid file test failed: {e}")
            return False
    
    def test_task_status(self) -> bool:
        """Test task status endpoint"""
        self.log_info("Testing task status...")
        try:
            response = requests.get(f"{self.backend_url}/api/tasks/test-123")
            if response.status_code == 404:
                self.log_pass("Task status returns 404 for unknown task")
                return True
            self.log_fail(f"Unexpected status: {response.status_code}")
            return False
        except Exception as e:
            self.log_fail(f"Task status test failed: {e}")
            return False
    
    def test_translation_api(self) -> bool:
        """Test translation API with SiliconFlow"""
        if not self.api_key:
            self.log_info("Skipping translation test (no API key)")
            return True
        
        self.log_info("Testing translation API...")
        try:
            payload = {
                "text": "Hello, this is a test.",
                "source_lang": "en",
                "target_lang": "zh"
            }
            response = requests.post(
                f"{self.backend_url}/api/translate",
                json=payload,
                timeout=60
            )
            if response.status_code == 200:
                data = response.json()
                if "translation" in data:
                    self.log_pass(f"Translation works: {data['translation'][:50]}...")
                    return True
            self.log_fail(f"Translation failed: {response.status_code} - {response.text}")
            return False
        except requests.exceptions.Timeout:
            self.log_fail("Translation API timeout")
            return False
        except Exception as e:
            self.log_fail(f"Translation test failed: {e}")
            return False
    
    def test_pdf_type_detection(self) -> bool:
        """Test PDF type detection"""
        self.log_info("Testing PDF type detection...")
        
        try:
            from app.services.pdf_service import PDFService
            pdf_service = PDFService()
            
            test_file = "/tmp/test_detection.pdf"
            if not os.path.exists(test_file):
                import fitz
                doc = fitz.open()
                page = doc.new_page()
                page.insert_text((100, 100), "Test content")
                doc.save(test_file)
                doc.close()
            
            pdf_type = pdf_service.detect_pdf_type(test_file)
            
            if pdf_type in ["text", "image", "mixed"]:
                self.log_pass(f"PDF type detection works: {pdf_type}")
                return True
            
            self.log_fail(f"Unexpected PDF type: {pdf_type}")
            return False
        except Exception as e:
            self.log_fail(f"PDF detection test failed: {e}")
            return False
    
    def test_layout_detection(self) -> bool:
        """Test layout detection"""
        self.log_info("Testing layout detection...")
        
        try:
            from app.services.pdf_service import PDFService
            pdf_service = PDFService()
            
            test_file = "/tmp/test_layout.pdf"
            if not os.path.exists(test_file):
                import fitz
                doc = fitz.open()
                page = doc.new_page()
                page.insert_text((100, 100), "Test content")
                doc.save(test_file)
                doc.close()
            
            layout = pdf_service.detect_layout(test_file)
            
            self.log_pass(f"Layout detection works: {len(layout)} elements found")
            return True
        except Exception as e:
            self.log_fail(f"Layout detection test failed: {e}")
            return False
    
    def print_summary(self):
        print("\n" + "=" * 50)
        print("Test Summary")
        print("=" * 50)
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print("=" * 50)
        
        return self.failed == 0


def main():
    backend_url = os.getenv("BACKEND_URL", "http://localhost/api")
    
    print("=" * 50)
    print("PDF Translator Service Tests")
    print("=" * 50)
    print(f"Backend URL: {backend_url}")
    print()
    
    runner = TestRunner(backend_url)
    
    # Run all tests
    runner.test_backend_health()
    runner.test_cors()
    runner.test_upload_endpoint()
    runner.test_invalid_file()
    runner.test_task_status()
    runner.test_translation_api()
    
    # Test internal services
    print("\n--- Internal Service Tests ---")
    runner.test_pdf_type_detection()
    runner.test_layout_detection()
    
    # Print summary
    success = runner.print_summary()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
