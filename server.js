const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 3000;

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB-zyIcO_fJMxTCMhns5rSJxmtTODIBMCw';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Helper function to make HTTPS requests (since we can't use fetch in older Node)
function makeGeminiRequest(prompt) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// API endpoint to analyze code
app.post('/analyze', (req, res) => {
    const { code, target } = req.body;

    if (!code || !target) {
        return res.status(400).json({ error: 'Missing code or target parameter' });
    }

    const targetMap = {
        'npu': 'ethos-npu',
        'cortexa': 'cortex-a76'
    };

    const pythonTarget = targetMap[target] || 'cortex-a76';

    const pythonProcess = spawn('python3', [
        path.join(__dirname, 'analyzer_main.py')
    ]);

    let outputData = '';
    let errorData = '';

    const inputData = JSON.stringify({
        code: code,
        target: pythonTarget
    });

    pythonProcess.stdin.write(inputData);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
        console.error('Python stderr:', data.toString());
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('Python process error:', errorData);
            return res.status(500).json({ 
                error: 'Analysis failed', 
                details: errorData 
            });
        }

        try {
            const result = JSON.parse(outputData);
            res.json(result);
        } catch (e) {
            console.error('JSON parse error:', e);
            console.error('Raw output:', outputData);
            res.status(500).json({ 
                error: 'Failed to parse analysis results',
                details: outputData
            });
        }
    });

    pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        res.status(500).json({ 
            error: 'Failed to start analysis',
            details: error.message
        });
    });
});

// Gemini AI Summary endpoint
app.post('/summarize', async (req, res) => {
    const { analysisData, code } = req.body;

    if (!analysisData) {
        return res.status(400).json({ error: 'Missing analysis data' });
    }

    // Check if API key is set
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'AIzaSyB-zyIcO_fJMxTCMhns5rSJxmtTODIBMCw') {
        return res.json({ 
            summary: generateFallbackSummary(analysisData)
        });
    }

    try {
        const prompt = buildGeminiPrompt(analysisData, code);
        const data = await makeGeminiRequest(prompt);

        if (data.candidates && data.candidates[0]) {
            const summary = data.candidates[0].content.parts[0].text;
            res.json({ summary });
        } else {
            throw new Error('Invalid response from Gemini API');
        }

    } catch (error) {
        console.error('Gemini API error:', error);
        res.json({ 
            summary: generateFallbackSummary(analysisData)
        });
    }
});

// Build a detailed prompt for Gemini
function buildGeminiPrompt(data, code) {
    const scorecard = data.visualization_data.scorecard;
    const pipeline = data.visualization_data.pipeline;
    const mca = data.mca_raw_data;
    const target = data.target_cpu.toUpperCase();

    let prompt = `You are a computer architecture expert analyzing micro-architecture performance data from LLVM MCA (Machine Code Analyzer).

**Target Architecture:** ${target}

**Performance Metrics:**
- IPC (Instructions Per Cycle): ${mca.IPC}
- Total Cycles: ${mca.Total_Cycles}
- Instructions: ${mca.Instructions}
- Dispatch Width: ${mca.Dispatch_Width}
- Efficiency Score: ${scorecard.efficiency_score}%
- Wasted Potential: ${scorecard.wasted_potential}%
- Cycles Lost to Stalls: ${scorecard.cycles_lost}

**Pipeline Analysis:**
- Frontend Status: ${pipeline.frontend_status}
- Frontend Ratio: ${pipeline.frontend_ratio}
- Backend IPC: ${pipeline.backend_overall_ipc}
`;

    if (pipeline.backend_units) {
        prompt += '\n**Backend Unit Pressures:**\n';
        for (const [unit, unitData] of Object.entries(pipeline.backend_units)) {
            prompt += `- ${unit.replace('_', ' ')}: ${unitData.pressure}\n`;
        }
    }

    if (code) {
        prompt += `\n**Code Snippet:**\n\`\`\`cpp\n${code.substring(0, 500)}\n\`\`\`\n`;
    }

    prompt += `\n**Task:** Provide a concise, expert-level summary (3-4 sentences) explaining:
1. Overall performance assessment (is this code efficient?)
2. Key bottlenecks (which pipeline stages have HIGH pressure and what does that mean?)
3. Practical optimization suggestions (what should the developer focus on?)

Use clear, direct language. Focus on actionable insights. Be specific about which execution units are bottlenecks.`;

    return prompt;
}

// Fallback rule-based summary
function generateFallbackSummary(data) {
    const scorecard = data.visualization_data.scorecard;
    const pipeline = data.visualization_data.pipeline;
    const target = data.target_cpu.toUpperCase();

    let summary = `**Target: ${target}**\n\n`;

    // Performance assessment
    if (scorecard.efficiency_score >= 70) {
        summary += `✅ **Excellent Performance** (${scorecard.efficiency_score}% efficiency): This code achieves strong instruction-level parallelism and effectively utilizes the CPU's dispatch width.\n\n`;
    } else if (scorecard.efficiency_score >= 40) {
        summary += `⚠️ **Moderate Performance** (${scorecard.efficiency_score}% efficiency): There's room for improvement. The code is leaving ${scorecard.wasted_potential}% of potential performance on the table.\n\n`;
    } else {
        summary += `❌ **Poor Performance** (${scorecard.efficiency_score}% efficiency): Significant bottlenecks detected. ${scorecard.cycles_lost} cycles are wasted due to pipeline stalls.\n\n`;
    }

    // Pipeline analysis
    const frontendPressure = pipeline.frontend_status;
    if (frontendPressure === 'High Pressure') {
        summary += `🔴 **Frontend Bottleneck**: The instruction fetch/decode pipeline is struggling. This suggests issues with instruction cache misses, complex decoding, or branch mispredictions.\n\n`;
    }

    // Backend analysis
    if (pipeline.backend_units) {
        const highPressureUnits = [];
        for (const [unit, unitData] of Object.entries(pipeline.backend_units)) {
            if (unitData.pressure === 'High Pressure') {
                highPressureUnits.push(unit.replace('_', ' '));
            }
        }

        if (highPressureUnits.length > 0) {
            summary += `🔴 **Backend Bottlenecks**: High pressure detected in ${highPressureUnits.join(', ')}. `;
            
            if (highPressureUnits.some(u => u.includes('Load') || u.includes('Store'))) {
                summary += `Memory operations are saturating the load/store units. Consider reducing memory traffic or improving data locality.\n\n`;
            } else if (highPressureUnits.some(u => u.includes('FP') || u.includes('NEON'))) {
                summary += `Floating-point/SIMD units are saturated. The code is compute-intensive on these units.\n\n`;
            } else if (highPressureUnits.some(u => u.includes('Integer') || u.includes('ALU'))) {
                summary += `Integer ALU units are saturated with arithmetic operations.\n\n`;
            }
        }
    }

    // Recommendations
    summary += `**💡 Optimization Focus**: `;
    if (scorecard.efficiency_score < 40) {
        summary += `Look for data dependencies that prevent parallel execution. Consider loop unrolling, software pipelining, or restructuring the algorithm.`;
    } else if (scorecard.efficiency_score < 70) {
        summary += `Good foundation, but there's headroom. Profile memory access patterns and consider vectorization opportunities.`;
    } else {
        summary += `Performance is already strong. Focus on maintaining code clarity while preserving these characteristics.`;
    }

    return summary;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving files from 'public' folder`);
    console.log(`🤖 AI Summary: ${GEMINI_API_KEY === 'AIzaSyB-zyIcO_fJMxTCMhns5rSJxmtTODIBMCw' ? 'Fallback mode (no API key)' : 'Gemini API enabled'}`);
    console.log(`\n💡 Open http://localhost:${PORT} in your browser\n`);
});