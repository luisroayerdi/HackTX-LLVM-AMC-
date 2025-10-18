"""
Cortex-A Abstract Pipeline Analyzer (Extended)
Now includes individual backend sub-unit pressures
based on instruction-level information.
"""

# Example LLVM MCA output
mca_data = {
    "Iterations": 100,
    "Instructions": 6600,
    "Total_Cycles": 2557,
    "Total_uOps": 8000,
    "Dispatch_Width": 4,
    "uOps_Per_Cycle": 3.13,
    "IPC": 2.58,
    "Block_RThroughput": 20.0,
    "Instruction_Info": [
        # [#uOps, Latency, RThroughput, MayLoad, MayStore, HasSideEffects]
        [1, 1, 0.5, False, False, False],  # Integer ALU
        [2, 3, 1.0, False, False, False],  # FP/NEON
        [1, 1, 0.5, True, False, False],   # Load
        [1, 1, 0.5, False, True, False],   # Store
        [1, 2, 1.0, False, False, True],   # Branch
    ]
}

# ---------- Stage Calculations ----------

# Frontend
frontend_ratio = mca_data["uOps_Per_Cycle"] / mca_data["Dispatch_Width"]
def stage_pressure(ratio):
    if ratio >= 0.85:
        return "Low Pressure"
    elif ratio >= 0.5:
        return "Medium Pressure"
    else:
        return "High Pressure"
frontend_status = stage_pressure(frontend_ratio)

# Backend overall
backend_ratio = mca_data["IPC"] / mca_data["uOps_Per_Cycle"]
backend_status = stage_pressure(backend_ratio)

# Retire
retire_ratio = backend_ratio  # same heuristic
retire_status = stage_pressure(retire_ratio)

# ---------- Backend Sub-Unit Calculations ----------

instruction_info = mca_data["Instruction_Info"]
total_uops = sum(inst[0] for inst in instruction_info)

# Initialize counters
unit_uops = {
    "Integer_ALU": 0,
    "FP_NEON": 0,
    "Load_Store": 0,
    "Branch_Control": 0
}

for inst in instruction_info:
    uops, latency, rthrough, may_load, may_store, side_effect = inst
    # Assign uOps to backend unit type
    if may_load or may_store:
        unit_uops["Load_Store"] += uops
    elif side_effect:
        unit_uops["Branch_Control"] += uops
    elif latency >= 2:  # assume latency>=2 indicates FP/NEON
        unit_uops["FP_NEON"] += uops
    else:
        unit_uops["Integer_ALU"] += uops

# Compute ratios and pressure for each sub-unit
unit_pressure = {}
for unit, uops in unit_uops.items():
    ratio = uops / total_uops if total_uops else 0
    if ratio < 0.2:
        unit_pressure[unit] = "Low Pressure"
    elif ratio < 0.5:
        unit_pressure[unit] = "Medium Pressure"
    else:
        unit_pressure[unit] = "High Pressure"

# ---------- Summary Output ----------

print("=== Cortex-A Abstract Pipeline Summary ===")
print(f"Frontend: {frontend_status} ({mca_data['uOps_Per_Cycle']:.2f}/{mca_data['Dispatch_Width']})")
print(f"Backend Overall: {backend_status} (IPC {mca_data['IPC']:.2f})")
print("Backend Sub-Units:")
for unit, pressure in unit_pressure.items():
    print(f"  {unit}: {pressure} ({unit_uops[unit]} uOps, {unit_uops[unit]/total_uops:.2f} ratio)")
print(f"Retire: {retire_status}")
overall_status = "Backend-limited block with good throughput" if backend_ratio < 0.9 else "Overall: Efficient execution"
print(f"Overall: {overall_status}")
