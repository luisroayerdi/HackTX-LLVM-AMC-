// Minimal fallback summary - encourages API setup
function generateFallbackSummary(data) {
    const scorecard = data.visualization_data.scorecard;
    const pipeline = data.visualization_data.pipeline;
    const mca = data.mca_raw_data;
    const target = data.target_cpu.toUpperCase();
    const originalTarget = data.original_target || '';
    
    // Properly detect if this is NPU analysis
    const isNPU = originalTarget.toLowerCase().includes('npu') || 
                  originalTarget.toLowerCase().includes('ethos') ||
                  target.includes('ETHOS') || 
                  target.includes('NPU');

    let summary = `**🤖 AI-Powered Insights Unavailable**\n\n`;
    summary += `Set the GEMINI_API_KEY environment variable to get detailed, hardware-specific analysis that connects these metrics to real-world deployment costs, energy efficiency, and optimization strategies.\n\n`;
    summary += `**Basic Metrics Summary:**\n`;
    summary += `• Target: ${isNPU ? 'ARM Ethos NPU' : target}\n`;
    summary += `• IPC: ${mca.IPC} instructions per cycle\n`;
    summary += `• Efficiency: ${scorecard.efficiency_score}% of theoretical peak\n`;
    summary += `• Cycles Lost: ${scorecard.cycles_lost} cycles\n\n`;

    summary += `**Pipeline Status:**\n`;
    summary += `• Frontend: ${pipeline.frontend_status}\n`;
    
    if (pipeline.backend_units) {
        Object.entries(pipeline.backend_units).forEach(([unit, data]) => {
            summary += `• ${unit.replace('_', ' ')}: ${data.pressure}\n`;
        });
    }

    summary += `\n**💡 With Gemini API enabled, you would receive:**\n`;
    if (isNPU) {
        summary += `• Analysis of energy efficiency and power consumption implications\n`;
        summary += `• NPU deployment viability assessment (edge AI, battery life impact)\n`;
        summary += `• Cost-benefit analysis for NPU vs. CPU execution\n`;
        summary += `• Strategic optimization recommendations for tensor operations\n`;
    } else {
        summary += `• Server cost and resource utilization analysis\n`;
        summary += `• Performance economics for cloud/mobile deployment\n`;
        summary += `• Bottleneck impact on SLA and user experience\n`;
        summary += `• Strategic optimization ROI recommendations\n`;
    }

    return summary;
}const express = require('express');
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

// Helper function to make HTTPS requests
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
                maxOutputTokens: 2048,
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
            // Add the original target request for proper NPU detection
            result.original_target = target;
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

// Build hardware-specific prompts for Gemini
function buildGeminiPrompt(data, code) {
    const scorecard = data.visualization_data.scorecard;
    const pipeline = data.visualization_data.pipeline;
    const mca = data.mca_raw_data;
    const target = data.target_cpu.toUpperCase();
    const originalTarget = data.original_target || '';
    
    // Check if this is an NPU analysis by looking at the original target request
    const isNPU = originalTarget.toLowerCase().includes('npu') || 
                  originalTarget.toLowerCase().includes('ethos') ||
                  target.includes('ETHOS') || 
                  target.includes('NPU');

    let prompt = '';

    if (isNPU) {
        // NPU-specific analysis prompt
        prompt = `You are an AI accelerator and neural network optimization expert analyzing predicted performance of code on ARM Ethos NPU hardware.

**Target Hardware:** ${target} (Neural Processing Unit)
**Context:** This analysis predicts how the code will execute on dedicated AI acceleration hardware. NPUs are optimized for tensor operations, matrix multiplications, and parallel data processing common in neural networks.

**Performance Prediction Metrics:**
- IPC (Instructions Per Cycle): ${mca.IPC}
- Total Cycles: ${mca.Total_Cycles}
- Instructions: ${mca.Instructions}
- Predicted Efficiency: ${scorecard.efficiency_score}%
- Cycles Lost to Stalls: ${scorecard.cycles_lost}

**Pipeline Analysis:**
- Frontend (Instruction Fetch/Decode): ${pipeline.frontend_status}
- Backend Units Status:`;

        if (pipeline.backend_units) {
            for (const [unit, unitData] of Object.entries(pipeline.backend_units)) {
                prompt += `\n  • ${unit.replace('_', ' ')}: ${unitData.pressure}`;
            }
        }

        if (code) {
            prompt += `\n\n**Code Being Analyzed:**\n\`\`\`cpp\n${code.substring(0, 600)}\n\`\`\`\n`;
        }

        prompt += `\n**Your Task:**
Write a high-level, insightful analysis (4-6 sentences) that explains:

1. **NPU Suitability:** Is this code pattern well-suited for NPU acceleration? Neural networks benefit from tensor operations, SIMD, and parallel data processing. Does this code exhibit those characteristics?

2. **Predicted Performance:** Based on the IPC of ${mca.IPC} and efficiency of ${scorecard.efficiency_score}%, how well will this code likely perform on the Ethos NPU? What does this tell us about hardware utilization?

3. **Bottleneck Analysis:** Which execution units show high pressure? For NPUs, this matters for:
   - Vector/SIMD units → Critical for parallel tensor operations
   - Memory units → Data movement can dominate NPU workloads
   - Integer ALU → Control flow overhead can kill NPU efficiency

4. **Actionable Recommendations:** What specific changes would make this code run better on NPU hardware? Think about:
   - Vectorization opportunities
   - Memory access patterns (coalescing, caching)
   - Loop structures that map to tensor operations
   - Reducing control flow divergence

Be technical but accessible. Focus on what these predictions mean for real NPU performance.`;

    } else {
        // CPU-specific analysis prompt (Cortex-A series)
        prompt = `You are a world-class computer architecture expert specializing in ARM processors, superscalar pipelines, and performance optimization. You're analyzing predicted performance for ARM Cortex-A CPU cores.

**CRITICAL CONTEXT:**
This is predictive analysis using LLVM MCA (Machine Code Analyzer) to forecast how code will execute on an out-of-order, superscalar ARM processor. Cortex-A cores are sophisticated general-purpose processors with complex execution pipelines, branch prediction, and memory hierarchies.

**Target Hardware:** ${target} (ARM CPU Core)
**Dispatch Width:** ${mca.Dispatch_Width} instructions per cycle (theoretical maximum)
**Analysis Scope:** ${mca.Instructions} instructions analyzed over ${mca.Total_Cycles} predicted cycles

**Performance Prediction Metrics:**
- Measured IPC: ${mca.IPC} (achieving ${((mca.IPC / mca.Dispatch_Width) * 100).toFixed(1)}% of dispatch width)
- Architectural Efficiency: ${scorecard.efficiency_score}% of theoretical peak
- Predicted Cycles Lost to Stalls: ${scorecard.cycles_lost} cycles
- Ideal Cycles (perfect parallelism): ${scorecard.ideal_cycles} cycles

**Pipeline Bottleneck Predictions:**
- Instruction Frontend (Fetch/Decode/Rename): ${pipeline.frontend_status} (${pipeline.frontend_ratio} µOps/cycle)
- Backend Execution Pressure:`;

        if (pipeline.backend_units) {
            for (const [unit, unitData] of Object.entries(pipeline.backend_units)) {
                prompt += `\n  • ${unit.replace('_', ' ')}: ${unitData.pressure} (utilization: ${(unitData.ratio * 100).toFixed(0)}%)`;
            }
        }

        if (code) {
            prompt += `\n\n**Code Pattern Being Analyzed:**\n\`\`\`cpp\n${code.substring(0, 700)}\n\`\`\`\n`;
        }

        prompt += `\n**YOUR TASK - Write a High-Level Expert Analysis (8-12 sentences):**

You must provide deep, insightful analysis that goes beyond surface metrics. Think like a principal performance engineer evaluating production code. Address:

**1. Instruction-Level Parallelism Assessment (3-4 sentences):**
- With an IPC of ${mca.IPC} on a ${mca.Dispatch_Width}-wide processor (${scorecard.efficiency_score}% efficiency), what's the fundamental story?
- Are we achieving good instruction-level parallelism or are data dependencies choking the pipeline?
- Look at the code: do you see dependency chains, complex control flow, or opportunities for parallel execution?
- Is this code naturally parallel-friendly or inherently sequential?

**2. Pipeline Bottleneck Root Cause Analysis (3-4 sentences):**
- The ${scorecard.cycles_lost} cycles lost to stalls - what's the UNDERLYING CAUSE?
- Frontend pressure (${pipeline.frontend_status}) → instruction cache misses? branch mispredictions? decode complexity?
- Backend execution unit pressure → which specific functional unit is saturated and WHY?
  * Integer ALU pressure: dependency chains in arithmetic? loop counters?
  * FP/SIMD pressure: floating-point heavy? vectorization opportunities?
  * Load/Store pressure: cache misses? memory bandwidth? pointer chasing?
  * Branch pressure: unpredictable branches? complex control flow?
- Connect the bottleneck to the actual code patterns you see

**3. Microarchitectural Behavior Insights (2-3 sentences):**
- What does this analysis reveal about how ${target}'s out-of-order execution is handling this code?
- Are we seeing good speculative execution? register renaming effectiveness? 
- Is the reorder buffer getting stalled? Are we hitting resource limits?

**4. Performance Optimization Strategy (2-3 sentences):**
- Given the bottlenecks, what specific optimizations would have the highest impact?
- Be technical: talk about loop unrolling factors, prefetch distances, SIMD instruction selection, register pressure, instruction scheduling
- Prioritize: what's the #1 thing that would move the efficiency needle?

**WRITING STYLE:**
- Be technical and precise - assume the reader understands computer architecture deeply
- Make bold, confident assessments based on the data
- Connect low-level metrics (IPC, cycle counts) to high-level insights (code characteristics, optimization strategies)
- Avoid hedging - if the data shows a clear bottleneck, call it out directly
- Think: "What would an Intel/ARM senior architect tell me about optimizing this code?"`;
    }

    return prompt;
}

// Enhanced fallback summary with hardware-specific insights
function generateFallbackSummary(data) {
    const scorecard = data.visualization_data.scorecard;
    const pipeline = data.visualization_data.pipeline;
    const mca = data.mca_raw_data;
    const target = data.target_cpu.toUpperCase();
    const originalTarget = data.original_target || '';
    
    // Properly detect if this is NPU analysis
    const isNPU = originalTarget.toLowerCase().includes('npu') || 
                  originalTarget.toLowerCase().includes('ethos') ||
                  target.includes('ETHOS') || 
                  target.includes('NPU');

    let summary = `**Target Hardware: ${isNPU ? 'ARM Ethos NPU' : target}**\n\n`;

    if (isNPU) {
        // NPU-specific fallback summary
        summary += `📊 **NPU Performance Prediction**\n`;
        
        if (scorecard.efficiency_score >= 70) {
            summary += `This code is predicted to achieve excellent performance on the Ethos NPU (${scorecard.efficiency_score}% efficiency). The high IPC of ${mca.IPC} suggests good parallelization that maps well to NPU tensor operations.\n\n`;
        } else if (scorecard.efficiency_score >= 40) {
            summary += `⚠️ Moderate NPU utilization predicted (${scorecard.efficiency_score}% efficiency). The code will run, but ${scorecard.cycles_lost} cycles are lost to stalls, suggesting the workload doesn't fully exploit NPU parallelism.\n\n`;
        } else {
            summary += `❌ Poor NPU acceleration predicted (${scorecard.efficiency_score}% efficiency). This code pattern may not be suitable for NPU execution - it's leaving ${scorecard.wasted_potential}% of NPU performance unused.\n\n`;
        }

        // NPU-specific bottleneck analysis
        if (pipeline.backend_units) {
            const highPressureUnits = [];
            for (const [unit, unitData] of Object.entries(pipeline.backend_units)) {
                if (unitData.pressure === 'High Pressure') {
                    highPressureUnits.push(unit.replace('_', ' '));
                }
            }

            if (highPressureUnits.length > 0) {
                summary += `🔴 **Critical Bottlenecks for NPU:**\n`;
                
                if (highPressureUnits.some(u => u.includes('Load') || u.includes('Store'))) {
                    summary += `Memory bandwidth is saturated. NPU performance is heavily dependent on efficient data movement. Consider:\n- Coalescing memory accesses\n- Using on-chip memory/cache more effectively\n- Reducing data movement between host and NPU\n\n`;
                }
                if (highPressureUnits.some(u => u.includes('FP') || u.includes('NEON'))) {
                    summary += `Vector/SIMD units are saturated - this is actually good for NPUs! The code is compute-intensive on parallel units. Ensure you're using the widest SIMD operations available.\n\n`;
                }
                if (highPressureUnits.some(u => u.includes('Integer') || u.includes('ALU'))) {
                    summary += `High scalar integer pressure suggests control flow overhead. NPUs perform best with minimal branching and maximum data parallelism.\n\n`;
                }
            }
        }

        summary += `💡 **NPU Optimization Strategy:** `;
        if (scorecard.efficiency_score < 40) {
            summary += `This workload needs restructuring for NPU acceleration. Focus on: converting loops to tensor operations, eliminating branches, and maximizing SIMD operations.`;
        } else {
            summary += `Good NPU utilization foundation. Fine-tune memory access patterns and ensure maximum vectorization to reach peak performance.`;
        }

    } else {
        // CPU-specific fallback summary (original logic enhanced)
        summary += `📊 **CPU Performance Prediction**\n`;
        
        if (scorecard.efficiency_score >= 70) {
            summary += `✅ Excellent predicted performance on ${target} (${scorecard.efficiency_score}% efficiency, IPC: ${mca.IPC}). The code achieves strong instruction-level parallelism and effectively utilizes the ${mca.Dispatch_Width}-wide dispatch pipeline.\n\n`;
        } else if (scorecard.efficiency_score >= 40) {
            summary += `⚠️ Moderate predicted performance (${scorecard.efficiency_score}% efficiency, IPC: ${mca.IPC}). The code will run but ${scorecard.cycles_lost} cycles are wasted due to pipeline stalls or resource contention.\n\n`;
        } else {
            summary += `❌ Poor predicted performance (${scorecard.efficiency_score}% efficiency, IPC: ${mca.IPC}). Significant bottlenecks detected - ${scorecard.cycles_lost} cycles lost represents substantial performance left on the table.\n\n`;
        }

        // Frontend analysis
        if (pipeline.frontend_status === 'High Pressure') {
            summary += `🔴 **Frontend Bottleneck**: Instruction fetch/decode is struggling. This indicates:\n- Instruction cache misses\n- Complex instruction decode\n- Branch mispredictions disrupting the pipeline\n\n`;
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
                summary += `🔴 **Backend Execution Bottlenecks**: ${highPressureUnits.join(', ')}\n`;
                
                if (highPressureUnits.some(u => u.includes('Load') || u.includes('Store'))) {
                    summary += `Memory subsystem is saturated. This suggests cache misses or memory bandwidth limits. Consider prefetching, improving data locality, or reducing memory traffic.\n\n`;
                }
                if (highPressureUnits.some(u => u.includes('FP') || u.includes('NEON'))) {
                    summary += `Floating-point/SIMD units are fully utilized. The code is compute-bound on these units, which may be optimal depending on the workload.\n\n`;
                }
                if (highPressureUnits.some(u => u.includes('Integer') || u.includes('ALU'))) {
                    summary += `Integer ALU units are saturated. This indicates heavy arithmetic computation or unresolved data dependencies.\n\n`;
                }
                if (highPressureUnits.some(u => u.includes('Branch'))) {
                    summary += `Branch/control flow units under pressure. Complex branching or unpredictable branches are affecting performance.\n\n`;
                }
            }
        }

        summary += `💡 **Optimization Recommendations:** `;
        if (scorecard.efficiency_score < 40) {
            summary += `Critical focus needed on resolving data dependencies and improving instruction-level parallelism. Consider loop unrolling, software pipelining, or algorithmic restructuring.`;
        } else if (scorecard.efficiency_score < 70) {
            summary += `Solid foundation with room for improvement. Profile memory access patterns, explore vectorization with NEON, and optimize hot loops.`;
        } else {
            summary += `Performance is already excellent. Maintain code structure and consider this a good baseline for similar workloads.`;
        }
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