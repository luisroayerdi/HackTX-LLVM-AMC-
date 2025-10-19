#!/usr/bin/env python3
"""
Simple test script to debug the analyzer without Node.js
"""
import json
import sys
import os

# Add the current directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from analyzer_main import analyze_code

# Simple test C++ code WITHOUT headers (to avoid include issues)
test_code = """
int main() {
    int sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += i;
    }
    return sum;
}
"""

# Alternative test with headers if you want to try that
test_code_with_headers = """
#include <iostream>

int main() {
    int sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += i;
    }
    return sum;
}
"""

print("=" * 60)
print("TESTING ANALYZER")
print("=" * 60)

print("\n1. Testing with CortexA target...")
result = analyze_code(test_code, "cortex-a76")
print("\nResult:")
print(result)

# Try to parse as JSON
try:
    parsed = json.loads(result)
    if "error" in parsed:
        print(f"\n⚠️  ERROR FOUND: {parsed['error']}")
        if "details" in parsed:
            print(f"Details: {parsed['details']}")
    else:
        print("\n✅ SUCCESS! Analysis completed.")
        print(f"Efficiency Score: {parsed['visualization_data']['scorecard']['efficiency_score']}%")
        print(f"IPC: {parsed['mca_raw_data']['IPC']}")
except json.JSONDecodeError as e:
    print(f"\n❌ JSON PARSE ERROR: {e}")
    print("Raw output was:")
    print(result)

print("\n" + "=" * 60)