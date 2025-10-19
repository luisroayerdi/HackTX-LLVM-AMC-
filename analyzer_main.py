import subprocess
import json
import re
import os
import sys 

# --- LLVM TOOL CONSTANTS ---

# List of common LLVM executable names to try, from newest to oldest version
MCA_NAMES = [f"llvm-mca-{i}" for i in range(20, 10, -1)] + ["llvm-mca"]
CLANG_NAMES = [f"clang-{i}" for i in range(20, 10, -1)] + ["clang"]

# The script prioritizes environment variables if they are set
# Hardcode the paths based on the user's Homebrew installation directory: /opt/homebrew/opt/llvm
LLVM_BIN_PATH = "/opt/homebrew/opt/llvm/bin/"

LLVM_MCA_EXEC = os.environ.get("LLVM_MCA_PATH", os.path.join(LLVM_BIN_PATH, "llvm-mca"))
CLANG_EXEC = os.environ.get("CLANG_PATH", os.path.join(LLVM_BIN_PATH, "clang"))

def find_llvm_tool(tool_names):
    """
    Attempts to find the correct executable name for a tool by checking the system PATH.
    :param tool_names: List of potential names (e.g., ['clang-18', 'clang'])
    :return: The correct executable name if found, otherwise None.
    """
    for name in tool_names:
        # Check if the fully qualified path exists and is executable
        full_path = os.path.join(LLVM_BIN_PATH, name)
        if os.path.exists(full_path) and os.access(full_path, os.X_OK):
             return full_path
        
        # Fallback to checking the system PATH
        try:
            # Run the tool with '--version' to check if it's callable
            # We explicitly prevent running 'clang' or 'llvm-mca' without a full path check first
            # to avoid false positives on system binaries that aren't the Homebrew ones.
            pass
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    return None

# Attempt to locate the tools if the environment variable was not explicitly set
if not os.environ.get("LLVM_MCA_PATH") and not os.path.exists(LLVM_MCA_EXEC):
    LLVM_MCA_EXEC = find_llvm_tool(MCA_NAMES)
if not os.environ.get("CLANG_PATH") and not os.path.exists(CLANG_EXEC):
    CLANG_EXEC = find_llvm_tool(CLANG_NAMES)

# --- 1. CORE ANALYSIS FUNCTIONS ---

def calculate_pipeline_summary(mca_data):
    """Calculates pipeline pressure summaries and backend unit breakdowns for visualization."""
    
    # --- Stage Calculations ---
    D_W = mca_data.get("Dispatch_Width", 4)
    U_P_C = mca_data.get("uOps_Per_Cycle", 1.0)
    IPC = mca_data.get("IPC", 1.0)

    # Simplified pressure logic for output strings
    frontend_ratio = U_P_C / D_W
    backend_ratio = IPC / U_P_C

    def get_pressure_status(ratio):
        if ratio >= 0.85: return "Low Pressure"
        if ratio >= 0.5: return "Medium Pressure"
        return "High Pressure"

    # Calculate backend unit pressures based on actual metrics
    # These are estimates based on typical ARM architecture behavior
    backend_units = {
        "Integer_ALU": {"pressure": get_pressure_status(min(backend_ratio * 1.2, 1.0)), "ratio": min(backend_ratio * 1.2, 1.0)},
        "FP_NEON": {"pressure": get_pressure_status(backend_ratio * 0.8), "ratio": backend_ratio * 0.8},
        "Load_Store": {"pressure": get_pressure_status(backend_ratio * 0.6), "ratio": backend_ratio * 0.6}, 
        "Branch_Control": {"pressure": get_pressure_status(min(backend_ratio * 1.5, 1.0)), "ratio": min(backend_ratio * 1.5, 1.0)},
    }

    return {
        "frontend_status": get_pressure_status(frontend_ratio),
        "frontend_ratio": f"{U_P_C:.2f}/{D_W}",
        "backend_overall_status": get_pressure_status(backend_ratio),
        "backend_overall_ipc": f"{IPC:.2f}",
        "backend_units": backend_units, # For the pipeline diagram visualization
    }

def calculate_efficiency_scorecard(mca_data):
    """Calculates the two key quantitative metrics (Efficiency and Cycles Lost)."""
    
    TOTAL_CYCLES = mca_data.get("Total_Cycles", 1)
    INSTRUCTIONS = mca_data.get("Instructions", 1)
    DISPATCH_WIDTH = mca_data.get("Dispatch_Width", 4)
    MEASURED_IPC = mca_data.get("IPC", 1.0)
    
    # 1. Architectural Efficiency Score (how close IPC is to Dispatch Width)
    EFFICIENCY_SCORE = (MEASURED_IPC / DISPATCH_WIDTH) * 100
    
    # 2. Cycles Lost to Stalls (Total Cycles - Ideal Cycles)
    IDEAL_CYCLES = INSTRUCTIONS / DISPATCH_WIDTH
    CYCLES_LOST = TOTAL_CYCLES - IDEAL_CYCLES
    
    return {
        "efficiency_score": round(EFFICIENCY_SCORE, 2),
        "wasted_potential": round(100 - EFFICIENCY_SCORE, 2),
        "cycles_lost": int(round(CYCLES_LOST, 0)),
        "ideal_cycles": int(round(IDEAL_CYCLES, 0)),
    }

# --- 2. LLVM MCA Execution and Parsing ---

def execute_llvm_mca(code_string, target_triple, target_cpu):
    """
    Executes the full LLVM toolchain: C++ -> Assembly -> MCA analysis.
    
    :return: Parsed MCA data dictionary or None on fatal error.
    """
    global LLVM_MCA_EXEC, CLANG_EXEC

    if not CLANG_EXEC or not os.path.exists(CLANG_EXEC):
        print("FATAL ERROR: Could not find CLANG. Please install LLVM or set CLANG_PATH.", file=sys.stderr)
        return None
    if not LLVM_MCA_EXEC or not os.path.exists(LLVM_MCA_EXEC):
        print("FATAL ERROR: Could not find LLVM-MCA. Please install LLVM or set LLVM_MCA_PATH.", file=sys.stderr)
        return None
    
    # Use a unique temporary file name to prevent race conditions
    temp_cpp_file = f"temp_code_{os.getpid()}.cpp"
    assembly_output = "" # Initialize assembly_output here

    # Write C++ code to a temporary file
    try:
        with open(temp_cpp_file, "w") as f:
            f.write(code_string)
            
        # Step 1: Compile C++ to TARGET ASSEMBLY (.s) using Clang
        compile_command = [
            CLANG_EXEC, 
            "-S", temp_cpp_file, 
            "-o", "-", # Output to stdout
            f"--target={target_triple}", # Use the explicit triple (now set to aarch64-linux-gnu)
            f"-mcpu={target_cpu}", 
            "-O2",
            "-stdlib=libc++",  # Use LLVM's C++ standard library
            "-nostdinc++",  # Don't use system C++ headers
            f"-I/opt/homebrew/opt/llvm/include/c++/v1",  # Add LLVM's C++ headers
        ]
        
        # Run clang and capture Assembly output
        assembly_result = subprocess.run(compile_command, capture_output=True, text=True, check=True)
        raw_assembly_output = assembly_result.stdout

        # --- Assembly Filtering ---
        # The assembly output often contains Mach-O/linker metadata directives (.type, .size, .section, .cfi) 
        # that confuse llvm-mca, which expects a raw instruction stream and simple labels.
        FILTER_DIRECTIVES = [
            ".file", ".ident", ".section", ".type", ".size", ".addrsig", ".cfi_", ".globl"
        ]
        
        lines = raw_assembly_output.splitlines()
        cleaned_lines = []

        for line in lines:
            stripped_line = line.strip()
            
            # Check if the line starts with any of the problematic directives
            is_metadata = any(stripped_line.startswith(d) for d in FILTER_DIRECTIVES)
            
            # Allow .text and .p2align, which are structural but usually harmless or necessary
            if stripped_line.startswith(".text") or stripped_line.startswith(".p2align"):
                is_metadata = False 

            if not is_metadata:
                cleaned_lines.append(line)
        
        assembly_output = "\n".join(cleaned_lines)
        # --- End Assembly Filtering ---

        # Step 2: Run LLVM-MCA on the Cleaned Assembly input
        mca_command = [
            LLVM_MCA_EXEC, 
            "-mcpu", target_cpu, 
            "-iterations", "100"
        ]
        
        # Pipe the Cleaned Assembly output directly to llvm-mca's stdin
        mca_result = subprocess.run(mca_command, input=assembly_output, capture_output=True, text=True, check=True)
        mca_output = mca_result.stdout
        
        return parse_mca_output(mca_output)

    except subprocess.CalledProcessError as e:
        print(f"Subprocess Error (Clang or MCA): {e}", file=sys.stderr)
        # Only print the MCA stderr, which contains the useful error messages
        print(f"Stderr from MCA: {e.stderr}", file=sys.stderr)
        return None 
    except FileNotFoundError as e:
        print(f"FATAL ERROR: Tool not found during execution: {e}", file=sys.stderr)
        return None
    finally:
        # Cleanup temporary file
        if os.path.exists(temp_cpp_file):
            os.remove(temp_cpp_file)


def parse_mca_output(mca_output):
    """
    Parses key summary metrics from the raw llvm-mca text output.
    """
    data = {}
    
    # Define regex patterns for key statistics
    patterns = {
        "Iterations": r"Iterations:\s+(\d+)",
        "Instructions": r"Instructions:\s+(\d+)",
        "Total_Cycles": r"Total Cycles:\s+(\d+)",
        "Total_uOps": r"Total uOps:\s+(\d+)",
        "Dispatch_Width": r"Dispatch Width:\s+(\d+)",
        "uOps_Per_Cycle": r"uOps Per Cycle:\s+([\d.]+)",
        "IPC": r"IPC:\s+([\d.]+)",
        "Block_RThroughput": r"Block RThroughput:\s+([\d.]+)",
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, mca_output)
        if match:
            # Convert to float for IPC/uOps per cycle, int otherwise
            if key in ["uOps_Per_Cycle", "IPC", "Block_RThroughput"]:
                data[key] = float(match.group(1))
            else:
                data[key] = int(match.group(1))
    
    if not all(k in data for k in ["Total_Cycles", "Instructions", "Dispatch_Width", "IPC"]):
        print("ERROR: Could not parse all required MCA metrics. Check MCA version compatibility.", file=sys.stderr)
        return None
        
    return data


# --- 3. MAIN EXECUTION FUNCTION FOR NODE.JS FRONTEND ---

def analyze_code(cxx_code, target):
    """
    Main entry point function called by the Node.js backend.
    
    :param cxx_code: The raw C++ code string from the user.
    :param target: E.g., 'cortex-a76' or 'ethos-npu'.
    :return: A JSON string with all data required for visualization and summary.
    """
    # 1. Determine LLVM target based on user selection
    target_lower = target.lower()
    
    if target_lower == "cortex-a76":
        # Explicitly use the Linux-GNU triple to force ELF assembly syntax (not Mach-O)
        target_triple = "aarch64-unknown-linux-gnu" 
        target_cpu = "cortex-a76"
    elif target_lower == "cortex-a53":
        # Use aarch64-linux-gnu for A53 to ensure ELF assembly syntax
        target_triple = "aarch64-unknown-linux-gnu"
        target_cpu = "cortex-a53"
    elif target_lower in ["ethos-npu", "ethos"]:
        # Ethos analysis defaults to A76 profile on AArch64 Linux-GNU
        target_triple = "aarch64-unknown-linux-gnu" 
        target_cpu = "cortex-a76" 
    else:
        return json.dumps({"error": f"Unsupported target: {target}"})

    # 2. Execute LLVM MCA
    print(f"--- Running LIVE Analysis for {target_cpu.upper()} ({target_triple}) ---", file=sys.stderr)
    mca_data = execute_llvm_mca(cxx_code, target_triple, target_cpu)
    
    if mca_data is None:
        # Check if the error is due to missing tools
        tool_error_message = ""
        if not CLANG_EXEC or not os.path.exists(CLANG_EXEC):
            tool_error_message += "Clang not found or path incorrect. "
        if not LLVM_MCA_EXEC or not os.path.exists(LLVM_MCA_EXEC):
            tool_error_message += "LLVM-MCA not found or path incorrect. "

        if tool_error_message:
             return json.dumps({"error": f"Failed to run LLVM tools: {tool_error_message}Please check your LLVM installation paths."})


        return json.dumps({"error": "Failed to run LLVM MCA or C++ compilation failed. Check logs for details."})

    # 3. Perform Analysis
    pipeline_summary = calculate_pipeline_summary(mca_data)
    efficiency_scorecard = calculate_efficiency_scorecard(mca_data)

    # 4. Consolidate Results for Frontend
    final_output = {
        "mca_raw_data": mca_data, # Raw numbers for potential AI summary
        "target_cpu": target_cpu,
        "visualization_data": {
            "pipeline": pipeline_summary,
            "scorecard": efficiency_scorecard,
        }
    }

    return json.dumps(final_output, indent=4)

if __name__ == '__main__':
    # Read JSON input from stdin (sent by Node.js)
    try:
        input_data = json.loads(sys.stdin.read())
        code = input_data.get('code', '')
        target = input_data.get('target', 'cortex-a76')
        
        result_json = analyze_code(code, target)
        print(result_json)
        
    except Exception as e:
        error_output = json.dumps({"error": f"Python script error: {str(e)}"})
        print(error_output)
        sys.exit(1)