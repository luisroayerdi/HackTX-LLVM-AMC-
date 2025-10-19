#!/bin/bash

# Quick test script to see how summaries work
# Run after starting the server with: npm start

echo "Testing AI Summary Endpoint..."
echo ""

# Test data (simulated analysis result)
curl -X POST http://localhost:3000/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "analysisData": {
      "target_cpu": "cortex-a76",
      "mca_raw_data": {
        "IPC": 0.85,
        "Total_Cycles": 150,
        "Instructions": 50,
        "Dispatch_Width": 4
      },
      "visualization_data": {
        "scorecard": {
          "efficiency_score": 35,
          "wasted_potential": 65,
          "cycles_lost": 120,
          "ideal_cycles": 30
        },
        "pipeline": {
          "frontend_status": "Low Pressure",
          "frontend_ratio": "3.2/4",
          "backend_overall_status": "High Pressure",
          "backend_overall_ipc": "0.85",
          "backend_units": {
            "Integer_ALU": {"pressure": "Medium Pressure", "ratio": 0.6},
            "FP_NEON": {"pressure": "Low Pressure", "ratio": 0.3},
            "Load_Store": {"pressure": "High Pressure", "ratio": 0.2},
            "Branch_Control": {"pressure": "Low Pressure", "ratio": 0.8}
          }
        }
      }
    },
    "code": "void array_copy(int* dest, const int* src, int n) { for (int i = 0; i < n; i++) { dest[i] = src[i]; } }"
  }'

echo ""
echo ""
echo "If you see a summary above, AI is working!"
echo "If you see a rule-based summary, Gemini API key is not configured (fallback active)"