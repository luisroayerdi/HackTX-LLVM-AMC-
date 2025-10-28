# HackTX-LLVM-AMC-

🚀 Inspiration
Understanding how code truly executes at the microarchitectural level has always been a challenge. Traditional profiling tools show numbers — not intuition. We wanted to see what the CPU sees: how instructions flow, stall, and retire in real time. Inspired by LLVM’s MCA and performance visualization tools like Intel VTune, we set out to merge compiler analysis and visual analytics into a single, interactive experience.

💡 What it does
AMC++ visualizes microarchitectural behavior by mapping LLVM’s Machine Code Analyzer (MCA) output into a dynamic, interactive interface. It shows:

Real-time pipeline flow (fetch → decode → execute → retire)
Hotspot heatmaps for bottleneck detection
Side-by-side views of compiler workflows and microprocessor pipelines
Live metrics such as IPC, stall reasons, and throughput efficiency
The result: a clear, explorable picture of how code interacts with hardware.

🛠️ How we built it
We built AMC++ on top of LLVM MCA for backend analysis and extended it using TypeScript, D3.js, and WebGL for rich visualization.

Frontend: Interactive HTML/JS dashboard with animated graphs and hotspots
Backend: Custom LLVM MCA++ engine extension generating JSON telemetry
Visualization: Interactive CPU pipeline simulation, workflow graph overlays, and performance gauges
Integration: Streamlit and Python bindings for rapid experimentation
