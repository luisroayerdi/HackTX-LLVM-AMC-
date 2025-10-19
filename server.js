const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // Serve static files from 'public' folder

// API endpoint to analyze code
app.post('/analyze', (req, res) => {
    const { code, target } = req.body;

    if (!code || !target) {
        return res.status(400).json({ error: 'Missing code or target parameter' });
    }

    // Map frontend target names to Python script expectations
    const targetMap = {
        'npu': 'ethos-npu',
        'cortexa': 'cortex-a76'
    };

    const pythonTarget = targetMap[target] || 'cortex-a76';

    // Spawn Python process
    const pythonProcess = spawn('python3', [
        path.join(__dirname, 'analyzer_main.py')
    ]);

    let outputData = '';
    let errorData = '';

    // Create input JSON for Python script
    const inputData = JSON.stringify({
        code: code,
        target: pythonTarget
    });

    // Send data to Python stdin
    pythonProcess.stdin.write(inputData);
    pythonProcess.stdin.end();

    // Collect output
    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
        console.error('Python stderr:', data.toString());
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('Python process error:', errorData);
            return res.status(500).json({ 
                error: 'Analysis failed', 
                details: errorData 
            });
        }

        try {
            // Parse the JSON output from Python
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

    // Handle errors
    pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        res.status(500).json({ 
            error: 'Failed to start analysis',
            details: error.message
        });
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Place your index.html in the "public" folder');
});