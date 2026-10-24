#!/usr/bin/env python3
"""
===============================================================================
ARCHFLOW: CPU Instruction Pipeline Visualizer with Assembly Parser & Optimizer
===============================================================================
A unified academic simulator connecting three core computer science disciplines:
1. FLAT: Regular Expressions & DFA Tokenizer (Lexer)
2. COA : 5-Stage MIPS Pipeline Simulator (IF, ID, EX, MEM, WB) with RAW Hazards & Forwarding
3. DAA : Directed Acyclic Graph (DAG) & Kahn's Topological Sort Instruction Reordering

Author: Antigravity AI
Python Version: 3.8+ (Zero external dependencies)
===============================================================================
"""

import sys
import re
import argparse
from typing import List, Dict, Tuple, Optional, Set

# Ensure safe console output encoding on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# =============================================================================
# 1. FLAT MODULE: Assembly Lexer, Regex & DFA Tokenizer
# =============================================================================

class Instruction:
    def __init__(self, idx: int, raw: str, opcode: str, rd: Optional[str], rs: List[str], imm: Optional[int], inst_type: str):
        self.id = idx
        self.label = f"I{idx}"
        self.raw = raw
        self.opcode = opcode.upper()
        self.rd = rd
        self.rs = rs
        self.imm = imm
        self.type = inst_type

    def __repr__(self):
        return f"Instruction({self.label}: {self.raw} | W:{self.rd} R:{','.join(self.rs)})"


class DFALexer:
    """Simulates DFA transitions and applies regex rules to validate and tokenize assembly lines."""
    
    ALU_OPS = {'ADD', 'SUB', 'MUL', 'AND', 'OR'}
    ALL_OPS = {'LOAD', 'STORE', 'ADD', 'SUB', 'MUL', 'AND', 'OR', 'NOP'}

    @classmethod
    def parse_program(cls, source_code: str) -> Tuple[List[Instruction], List[str]]:
        instructions = []
        errors = []
        lines = source_code.strip().splitlines()

        for line_no, raw_line in enumerate(lines, start=1):
            line = raw_line.strip()
            # Skip empty lines and comment lines
            if not line or line.startswith((';', '#', '//')):
                continue

            # Strip inline comments
            line = re.sub(r'\s*(?:[;#]|//).*$', '', line).strip()
            if not line:
                continue

            # DFA Simulation check
            dfa_valid, dfa_err = cls.simulate_dfa(line)
            if not dfa_valid:
                errors.append(f"Line {line_no} [FLAT DFA Reject]: {dfa_err}")
                continue

            # Regex parsing
            inst, err = cls.parse_instruction(line, len(instructions), line_no, raw_line)
            if err:
                errors.append(f"Line {line_no} [Syntax Error]: {err}")
            else:
                instructions.append(inst)

        return instructions, errors

    @classmethod
    def simulate_dfa(cls, line: str) -> Tuple[bool, Optional[str]]:
        state = 'q0'
        for i, char in enumerate(line):
            if state == 'q0':
                if char.isspace():
                    state = 'q0'
                elif char.isalpha():
                    state = 'q_op'
                else:
                    return False, f"Unexpected char '{char}' at col {i+1}"
            elif state == 'q_op':
                if char.isalpha():
                    state = 'q_op'
                elif char.isspace():
                    state = 'q_w1'
                else:
                    return False, f"Invalid opcode character '{char}' at col {i+1}"
            elif state in ('q_w1', 'q_w2', 'q_w3'):
                if char.isspace():
                    pass
                elif char in ('R', 'r'):
                    state = 'q_reg_r'
                elif char.isdigit() or char == '-':
                    state = 'q_imm'
                elif char == '[':
                    state = 'q_mem'
                else:
                    return False, f"Expected register or immediate at col {i+1}, got '{char}'"
            elif state == 'q_reg_r':
                if char.isdigit():
                    state = 'q_reg_num'
                else:
                    return False, f"Expected register number after 'R' at col {i+1}"
            elif state == 'q_reg_num':
                if char.isdigit():
                    state = 'q_reg_num'
                elif char == ',':
                    state = 'q_w2'
                elif char.isspace():
                    state = 'q_reg_ws'
                else:
                    return False, f"Expected ',' or whitespace at col {i+1}"
            elif state == 'q_reg_ws':
                if char.isspace():
                    pass
                elif char == ',':
                    state = 'q_w2'
                else:
                    return False, f"Expected ',' at col {i+1}"
            elif state == 'q_imm':
                if char.isalnum() or char == 'x':
                    state = 'q_imm'
                elif char.isspace():
                    pass
                else:
                    return False, f"Invalid character '{char}' in immediate at col {i+1}"
            elif state == 'q_mem':
                if char.isspace():
                    pass
                elif char in ('R', 'r'):
                    state = 'q_mem_r'
                else:
                    return False, f"Expected register in memory address at col {i+1}"
            elif state == 'q_mem_r':
                if char.isdigit():
                    state = 'q_mem_num'
                else:
                    return False, f"Expected digits for memory register at col {i+1}"
            elif state == 'q_mem_num':
                if char.isdigit():
                    pass
                elif char == ']':
                    state = 'q_accept_mem'
                elif char.isspace():
                    pass
                else:
                    return False, f"Expected ']' at col {i+1}"
            elif state == 'q_accept_mem':
                if char.isspace():
                    pass
                else:
                    return False, f"Unexpected token after memory address at col {i+1}"

        return True, None

    @classmethod
    def parse_instruction(cls, line: str, idx: int, line_no: int, raw_line: str) -> Tuple[Optional[Instruction], Optional[str]]:
        tokens = [t.strip() for t in re.split(r'[, ]+', line) if t.strip()]
        if not tokens:
            return None, "Empty line"

        op = tokens[0].upper()
        if op not in cls.ALL_OPS:
            return None, f"Unknown opcode '{op}'"

        if op == 'NOP':
            return Instruction(idx, raw_line, 'NOP', None, [], None, 'NOP'), None

        if op in cls.ALU_OPS:
            if len(tokens) != 4:
                return None, f"{op} requires 3 operands: {op} Rd, Rs1, Rs2"
            rd = tokens[1].upper()
            rs1 = tokens[2].upper()
            rs2 = tokens[3].upper()
            for r in (rd, rs1, rs2):
                if not re.match(r'^R([0-9]|[12][0-9]|3[01])$', r):
                    return None, f"Invalid register '{r}'"
            return Instruction(idx, raw_line, op, rd, [rs1, rs2], None, 'ALU'), None

        if op == 'LOAD':
            if len(tokens) != 3:
                return None, "LOAD requires 2 operands: LOAD Rd, imm"
            rd = tokens[1].upper()
            if not re.match(r'^R([0-9]|[12][0-9]|3[01])$', rd):
                return None, f"Invalid destination register '{rd}'"
            imm_str = tokens[2]
            try:
                imm = int(imm_str, 0)
            except ValueError:
                return None, f"Invalid immediate value '{imm_str}'"
            return Instruction(idx, raw_line, op, rd, [], imm, 'LOAD'), None

        if op == 'STORE':
            if len(tokens) != 3:
                return None, "STORE requires 2 operands: STORE Rs, imm"
            rs = tokens[1].upper()
            if not re.match(r'^R([0-9]|[12][0-9]|3[01])$', rs):
                return None, f"Invalid source register '{rs}'"
            imm_str = tokens[2]
            try:
                imm = int(imm_str, 0)
            except ValueError:
                return None, f"Invalid memory address '{imm_str}'"
            return Instruction(idx, raw_line, op, None, [rs], imm, 'STORE'), None

        return None, "Unsupported format"


# =============================================================================
# 2. DAA MODULE: Dependency DAG & Kahn's Algorithm Topological Sort
# =============================================================================

class DAGAnalyzer:
    @staticmethod
    def build_dag(instructions: List[Instruction]) -> Dict:
        n = len(instructions)
        adj = {i: [] for i in range(n)}
        in_degree = [0] * n
        edges = []

        for i in range(n):
            prod = instructions[i]
            if not prod.rd:
                continue

            for j in range(i + 1, n):
                cons = instructions[j]
                # RAW True Dependency
                if prod.rd in cons.rs:
                    if j not in adj[i]:
                        adj[i].append(j)
                        in_degree[j] += 1
                        edges.append((i, j, prod.rd, 'RAW'))

        return {'adj': adj, 'in_degree': in_degree, 'edges': edges, 'n': n}

    @staticmethod
    def kahn_topological_sort(dag: Dict, instructions: List[Instruction]) -> Tuple[List[Instruction], List[Dict]]:
        n = dag['n']
        in_deg = list(dag['in_degree'])
        adj = dag['adj']
        ready_queue = [i for i in range(n) if in_deg[i] == 0]

        reordered_indices = []
        trace_steps = []

        while ready_queue:
            # Latency-Aware Greedy Heuristic:
            # Pick a node that does not read registers written by the last 2 scheduled instructions
            recent_rds = []
            if len(reordered_indices) >= 1 and instructions[reordered_indices[-1]].rd:
                recent_rds.append(instructions[reordered_indices[-1]].rd)
            if len(reordered_indices) >= 2 and instructions[reordered_indices[-2]].rd:
                recent_rds.append(instructions[reordered_indices[-2]].rd)

            best_idx = 0
            reason = "Zero in-degree"
            for q_idx, cand in enumerate(ready_queue):
                cand_inst = instructions[cand]
                if not any(r in recent_rds for r in cand_inst.rs):
                    best_idx = q_idx
                    reason = f"Zero in-degree & avoids recent RAW conflict on {recent_rds}"
                    break

            chosen = ready_queue.pop(best_idx)
            reordered_indices.append(chosen)

            unblocked = []
            for neighbor in adj[chosen]:
                in_deg[neighbor] -= 1
                if in_deg[neighbor] == 0:
                    ready_queue.append(neighbor)
                    unblocked.append(instructions[neighbor].label)

            trace_steps.append({
                'chosen': instructions[chosen].label,
                'raw': instructions[chosen].raw,
                'unblocked': unblocked,
                'reason': reason
            })

        reordered_instructions = []
        for new_idx, orig_idx in enumerate(reordered_indices):
            orig = instructions[orig_idx]
            new_inst = Instruction(new_idx, orig.raw, orig.opcode, orig.rd, orig.rs, orig.imm, orig.type)
            reordered_instructions.append(new_inst)

        return reordered_instructions, trace_steps


# =============================================================================
# 3. COA MODULE: 5-Stage MIPS Pipeline Simulator
# =============================================================================

class PipelineSimulator:
    STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB']

    @classmethod
    def simulate(cls, instructions: List[Instruction], forwarding: bool = False) -> Dict:
        n = len(instructions)
        if n == 0:
            return {'timeline': [], 'cycles': 0, 'stalls': 0, 'hazards': []}

        # timeline[inst_idx] = list of stage strings for cycles 1, 2, ...
        timeline = [[] for _ in range(n)]
        hazards = []
        total_stalls = 0

        # Pipeline register latches holding instruction objects or None
        if_id = None
        id_ex = None
        ex_mem = None
        mem_wb = None

        pc = 0
        current_cycle = 1
        max_cycles = 250

        # Cycle snapshots for detailed telemetry
        snapshots = []

        while (pc < n or if_id or id_ex or ex_mem or mem_wb) and current_cycle < max_cycles:
            # Next state of latches after this cycle
            next_if_id = None
            next_id_ex = None
            next_ex_mem = None
            next_mem_wb = None

            stall_id = False
            stall_reason = None

            # 1. WB Stage
            if mem_wb is not None:
                timeline[mem_wb.id].append('WB')
                # Retired

            # 2. MEM Stage
            if ex_mem is not None:
                timeline[ex_mem.id].append('MEM')
                next_mem_wb = ex_mem

            # 3. EX Stage
            if id_ex is not None:
                timeline[id_ex.id].append('EX')
                next_ex_mem = id_ex

            # 4. ID Stage & Hazard Detection
            if if_id is not None:
                curr_inst = if_id
                # Check dependencies with instructions in EX, MEM (and WB without forwarding)
                for src in curr_inst.rs:
                    # Check producer in EX stage (id_ex)
                    if id_ex and id_ex.rd == src:
                        if not forwarding:
                            stall_id = True
                            stall_reason = f"RAW hazard: {curr_inst.label} waits for {id_ex.label} in EX on {src}"
                            break
                        else:
                            # With forwarding, if producer is LOAD, load data is not ready until MEM -> 1 stall
                            if id_ex.type == 'LOAD':
                                stall_id = True
                                stall_reason = f"Load-Use hazard: {curr_inst.label} waits for {id_ex.label} (LOAD) on {src}"
                                break
                    # Check producer in MEM stage (ex_mem)
                    if ex_mem and ex_mem.rd == src:
                        if not forwarding:
                            stall_id = True
                            stall_reason = f"RAW hazard: {curr_inst.label} waits for {ex_mem.label} in MEM on {src}"
                            break
                        # With forwarding, MEM stage forwards directly to EX stage -> 0 stalls!

                if stall_id:
                    # Insert stall bubble
                    timeline[curr_inst.id].append('STALL')
                    total_stalls += 1
                    next_id_ex = None  # bubble inserted into EX
                    next_if_id = if_id # retain instruction in IF/ID latch
                    hazards.append((current_cycle, stall_reason))
                else:
                    # Normal ID execution
                    timeline[curr_inst.id].append('ID')
                    next_id_ex = curr_inst

            # 5. IF Stage
            if stall_id:
                # IF is frozen: PC does not advance
                # Pad instructions not yet fetched
                for idx in range(pc, n):
                    timeline[idx].append(None)
            else:
                if pc < n:
                    fetched_inst = instructions[pc]
                    timeline[fetched_inst.id].append('IF')
                    next_if_id = fetched_inst
                    pc += 1

                # Pad instructions not yet fetched
                for idx in range(pc, n):
                    timeline[idx].append(None)

            # Pad instructions that have already retired
            for idx in range(n):
                while len(timeline[idx]) < current_cycle:
                    timeline[idx].append(None)

            # Advance pipeline latches
            if_id = next_if_id
            id_ex = next_id_ex
            ex_mem = next_ex_mem
            mem_wb = next_mem_wb

            current_cycle += 1

        total_cycles = current_cycle - 1
        return {
            'timeline': timeline,
            'cycles': total_cycles,
            'stalls': total_stalls,
            'hazards': hazards
        }


# =============================================================================
# 4. REPORT & TERMINAL VISUALIZATION
# =============================================================================

def print_timeline_table(instructions: List[Instruction], sim_result: Dict, title: str):
    print(f"\n================================================================================")
    print(f" {title.upper()}")
    print(f" Total Execution Time: {sim_result['cycles']} Cycles | Stall Bubbles: {sim_result['stalls']}")
    print(f"================================================================================")
    
    total_c = sim_result['cycles']
    header = f"{'Instruction':<24} | " + " ".join(f"C{c:<2}" for c in range(1, total_c + 1))
    print(header)
    print("-" * len(header))

    for i, inst in enumerate(instructions):
        label_text = f"{inst.label}: {inst.raw}"[:24]
        row_stages = []
        for cell in sim_result['timeline'][i]:
            if cell == 'STALL':
                row_stages.append("\033[91mSTL\033[0m")
            elif cell == 'IF':
                row_stages.append("\033[96mIF \033[0m")
            elif cell == 'ID':
                row_stages.append("\033[94mID \033[0m")
            elif cell == 'EX':
                row_stages.append("\033[93mEX \033[0m")
            elif cell == 'MEM':
                row_stages.append("\033[95mMEM\033[0m")
            elif cell == 'WB':
                row_stages.append("\033[92mWB \033[0m")
            else:
                row_stages.append(" . ")
        print(f"{label_text:<24} | " + " ".join(row_stages))


def main():
    parser = argparse.ArgumentParser(description="ARCHFLOW: CPU Instruction Pipeline Visualizer with DFA Lexer & DAA Optimizer")
    parser.add_argument('--code', type=str, help="Raw assembly code string to simulate")
    parser.add_argument('--file', type=str, help="Path to .asm file")
    parser.add_argument('--forwarding', action='store_true', help="Enable MIPS Data Forwarding unit")
    args = parser.parse_args()

    default_code = """
LOAD R1, 0
ADD R2, R1, R3
SUB R4, R2, R5
MUL R6, R7, R8
""".strip()

    source = default_code
    if args.code:
        source = args.code
    elif args.file:
        with open(args.file, 'r') as f:
            source = f.read()

    print("\n[FLAT] Parsing Assembly & DFA Token Validation...")
    instructions, errors = DFALexer.parse_program(source)

    if errors:
        print("\n\033[91mSyntax Errors Detected by FLAT Lexer:\033[0m")
        for err in errors:
            print(f"  [X] {err}")
        sys.exit(1)

    print(f"[*] FLAT Lexer accepted {len(instructions)} valid instructions.")

    # 1. DAA DAG & Topological Sorting
    print("\n[DAA] Constructing Dependency DAG & Running Kahn's Algorithm...")
    dag = DAGAnalyzer.build_dag(instructions)
    print(f"[*] Detected {len(dag['edges'])} true data dependency (RAW) edges:")
    for src, dst, reg, t in dag['edges']:
        print(f"    {instructions[src].label} ---> {instructions[dst].label} (via register {reg})")

    reordered_instructions, trace = DAGAnalyzer.kahn_topological_sort(dag, instructions)

    # 2. COA Pipeline Simulations
    fwd_mode = "ENABLED" if args.forwarding else "DISABLED"
    print(f"\n[COA] Simulating 5-Stage MIPS Pipeline (Forwarding: {fwd_mode})...")

    sim_orig = PipelineSimulator.simulate(instructions, forwarding=args.forwarding)
    sim_opt = PipelineSimulator.simulate(reordered_instructions, forwarding=args.forwarding)

    # 3. Print Timelines
    print_timeline_table(instructions, sim_orig, f"Original Order ({sim_orig['cycles']} Cycles, {sim_orig['stalls']} Stalls)")
    print_timeline_table(reordered_instructions, sim_opt, f"DAA Kahn's Reordered Order ({sim_opt['cycles']} Cycles, {sim_opt['stalls']} Stalls)")

    # 4. Final Comparison Report
    cycles_saved = sim_orig['cycles'] - sim_opt['cycles']
    bubbles_saved = sim_orig['stalls'] - sim_opt['stalls']
    speedup = (sim_orig['cycles'] / sim_opt['cycles']) if sim_opt['cycles'] > 0 else 1.0

    print("\n================================================================================")
    print(" DAA OPTIMIZATION SUMMARY")
    print("================================================================================")
    print(f" Original Pipeline Duration : {sim_orig['cycles']} clock cycles ({sim_orig['stalls']} stalls)")
    print(f" DAA Optimized Duration     : {sim_opt['cycles']} clock cycles ({sim_opt['stalls']} stalls)")
    print(f" Clock Cycles Saved         : {cycles_saved} cycles")
    print(f" Stall Bubbles Eliminated   : {bubbles_saved} bubbles")
    print(f" Speedup Factor             : {speedup:.2f}x ({((sim_orig['cycles'] - sim_opt['cycles']) / sim_orig['cycles'] * 100):.1f}%)")
    print("================================================================================\n")


if __name__ == '__main__':
    main()
