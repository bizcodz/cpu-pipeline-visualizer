# ARCHFLOW: CPU Instruction Pipeline Visualizer with Assembly Parser & DAA Optimizer

[![Live Demo](https://img.shields.io/badge/Live_Demo-ARCHFLOW_Online-00f0ff?style=for-the-badge&logo=googlechrome&logoColor=000000)](https://bizcodz.github.io/cpu-pipeline-visualizer/)
[![Deploy to GitHub Pages](https://github.com/bizcodz/cpu-pipeline-visualizer/actions/workflows/deploy.yml/badge.svg)](https://github.com/bizcodz/cpu-pipeline-visualizer/actions/workflows/deploy.yml)
[![Repository](https://img.shields.io/badge/GitHub-cpu--pipeline--visualizer-8a2be2?style=for-the-badge&logo=github)](https://github.com/bizcodz/cpu-pipeline-visualizer)

> 🚀 **Live Deployment**: **[https://bizcodz.github.io/cpu-pipeline-visualizer/](https://bizcodz.github.io/cpu-pipeline-visualizer/)**  
> Access the interactive 5-stage MIPS pipeline simulation, live DFA state transition engine, and Kahn's algorithm DAG reordering tool directly in your browser with zero installation!

---

An interactive engineering simulation tool uniting three foundational computer science disciplines into one cohesive, production-grade application:

| Subject | Academic Unit & Topic | Role in ARCHFLOW |
| :--- | :--- | :--- |
| **FLAT** (Formal Languages & Automata Theory) | Regular Expressions & Deterministic Finite Automata (DFA) (Unit 1.5, 2.7) | The **Lexer & Syntax Validator**: A hand-built DFA tracks character-by-character state transitions $\delta(q, c)$ to tokenize assembly instructions, reject invalid register identifiers, and trap syntax errors into $q_{\text{reject}}$. |
| **COA** (Computer Organization & Architecture) | 5-Stage MIPS Pipelining & Data Hazards (Unit 3.1, 3.7) | The **Pipeline Simulator Core**: Models `IF`, `ID`, `EX`, `MEM`, and `WB` latches. Detects Read-After-Write (RAW) data hazards, inserts precise stall bubbles (`STALL`), and features a toggleable hardware Data Forwarding unit (`EX->EX`, `MEM->EX`). |
| **DAA** (Design & Analysis of Algorithms) | Directed Acyclic Graphs (DAG) & Topological Sorting (Unit 1.11, Kahn's Algorithm) | The **Dependency Analyzer & Latency Optimizer**: Constructs a DAG of data dependencies and runs Kahn's algorithm with a greedy latency-hiding heuristic to reorder independent instructions, eliminating bubbles and speeding up execution. |

---

## 🌟 Key Features

1. **Dual Implementation**:
   - **Interactive Web App**: HTML5, Vanilla CSS3 (Obsidian Cyber-Hardware theme), and modern JavaScript.
   - **Standalone Python CLI**: Zero-dependency, ANSI-colorized terminal simulator (`pipeline_sim.py`).
2. **5-Stage MIPS Pipeline Visualizer**:
   - Color-coded cycle-by-cycle grid (`IF`, `ID`, `EX`, `MEM`, `WB`, and `STALL`).
   - Interactive playback scrubber: Play, Pause, Step Forward, Step Back, and Speed adjustment.
   - Live latch telemetry (`IF/ID`, `ID/EX`, `EX/MEM`, `MEM/WB`).
3. **Data Forwarding Unit Toggle**:
   - Compare "No Forwarding" (2 stalls for RAW) vs "Hardware Forwarding Enabled" (0 stalls for ALU-ALU, 1 stall for Load-Use).
4. **Interactive SVG Dependency DAG**:
   - Visual nodes with register read/write badges.
   - Directed dependency edges labeled with conflicting registers.
   - Hover inspection highlighting ancestor producers and descendant consumers.
5. **Kahn's Topological Sort Step-by-Step Trace**:
   - Live queue status, in-degree updates, and latency-aware selection rationale.
6. **Formal DFA State Automaton**:
   - Visual state transition graph $M = (Q, \Sigma, \delta, q_0, F)$.
   - Interactive character-by-character step animator showing state equations $\delta(q_i, \text{char}) = q_j$.

---

## 🚀 Quick Start Guide

### 1. Web Application

#### 🌐 Live Cloud Deployment
Run directly in any web browser without cloning or running commands:  
👉 **[https://bizcodz.github.io/cpu-pipeline-visualizer/](https://bizcodz.github.io/cpu-pipeline-visualizer/)**

#### 💻 Local Setup
```bash
# Clone the repository
git clone https://github.com/bizcodz/cpu-pipeline-visualizer.git
cd cpu-pipeline-visualizer

# Start local server (Python 3)
python -m http.server 8080
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

### 2. Standalone Python CLI

Run directly from the command line:

```bash
# Run default program
python pipeline_sim.py

# Run with custom assembly instructions
python pipeline_sim.py --code "LOAD R1, 0\nADD R2, R1, R3\nSUB R4, R2, R5\nMUL R6, R7, R8"

# Run with Data Forwarding enabled
python pipeline_sim.py --forwarding

# Run from an assembly file
python pipeline_sim.py --file program.asm
```

---

## 📖 Theoretical Details by Subject

### 1. FLAT: Regular Expressions & DFA Lexer

- **Formal 5-Tuple**:
  $$M = (Q, \Sigma, \delta, q_0, F)$$
  - $Q = \{q_0, q_{\text{op}}, q_{w1}, q_{r1}, q_{\text{rd}}, q_{c1}, q_{w2}, q_{r2}, q_{\text{rs1}}, q_{\text{imm}}, q_{c2}, q_{w3}, q_{r3}, q_{\text{rs2}}, q_{\text{accept}}, q_{\text{reject}}\}$
  - $\Sigma = \{ \text{A-Z}, \text{0-9}, \text{'R'}, \text{','}, \text{'['}, \text{']'}, \text{whitespace}, \text{EOF} \}$
  - $q_0 = \text{Start State}$
  - $F = \{q_{\text{accept}}, q_{\text{imm}}, q_{\text{rs2}}, q_{\text{op}}(\text{for NOP})\}$
  - $q_{\text{reject}} = \text{Trap state reached upon invalid syntax}$

### 2. COA: 5-Stage Pipelining & Hazard Rules

- **Stages**:
  1. `IF` (Instruction Fetch): PC fetch from instruction memory.
  2. `ID` (Instruction Decode): Register read from register file.
  3. `EX` (Execute): ALU operation or memory address calculation.
  4. `MEM` (Memory Access): Data memory read/write.
  5. `WB` (Write Back): Register file write.
- **Split-Cycle Convention**: WB writes in the first half of the clock cycle, and ID reads in the second half.
- **RAW Hazard Latencies**:
  - **No Forwarding**: If instruction $B$ reads a register written by instruction $A$, $B$ must stall in ID until $A$ completes WB $\implies$ **2 stall cycles**.
  - **With Forwarding**:
    - ALU $\to$ ALU: Forwarded from `EX/MEM` latch directly to ALU mux $\implies$ **0 stalls**.
    - LOAD $\to$ ALU (Load-Use): Data not available until `MEM` stage completes $\implies$ **1 stall cycle**.

### 3. DAA: DAG & Kahn's Topological Sorting

- **DAG Construction**:
  - $V = \{I_0, I_1, \dots, I_{n-1}\}$
  - Directed edge $(I_i \to I_j) \in E$ iff $i < j$ and $I_i$ writes a register read by $I_j$ (RAW dependency).
- **Kahn's Algorithm**:
  1. Compute $\text{in-degree}(u)$ for all $u \in V$.
  2. Enqueue all $u$ with $\text{in-degree}(u) = 0$ into ready queue $Q$.
  3. While $Q \neq \emptyset$:
     - **Latency Heuristic**: Pick candidate $u \in Q$ whose source registers do not conflict with the destination registers of the last 2 scheduled instructions.
     - Append $u$ to schedule.
     - For each neighbor $v \in \text{Adj}[u]$, decrement $\text{in-degree}(v)$. If $0$, add $v$ to $Q$.
- **Time Complexity**: $O(V + E)$ where $V$ is number of instructions and $E$ is number of data dependencies.

---

## 📁 Repository Structure

```
cpu-pipeline-visualizer/
├── index.html           # Core HTML5 dashboard structure
├── styles.css           # Obsidian cyber-hardware styling & animations
├── lexer.js             # FLAT module: Regex & DFA tokenizer
├── pipeline.js          # COA module: 5-stage MIPS pipeline simulator
├── optimizer.js         # DAA module: Dependency DAG & Kahn's algorithm
├── graph_visualizer.js  # Interactive SVG dependency DAG renderer
├── dfa_visualizer.js    # Interactive DFA state graph & step scrubber
├── app.js               # Application controller & state management
├── pipeline_sim.py      # Standalone Python CLI simulator
└── README.md            # Academic documentation & report
```
