/**
 * ============================================================================
 * DAA MODULE: Dependency DAG Analyzer & Kahn's Topological Sort Optimizer
 * ============================================================================
 * Features:
 * 1. DAG Builder: Constructs true data dependency (RAW) and antidependency (WAR/WAW) edges.
 * 2. In-Degree Calculator: Identifies independent root instructions.
 * 3. Kahn's Algorithm: Breadth-first topological sorting with detailed step-by-step trace.
 * 4. Latency-Aware Priority Heuristic: Interleaves independent instructions between
 *    dependent instructions to hide pipeline bubble latency.
 * 5. Optimization Metrics: Before-vs-After cycle savings, bubbles eliminated, speedup factor.
 */

class InstructionOptimizer {
  constructor() {
    this.sim = new PipelineSimulator();
  }

  /**
   * Constructs the Directed Acyclic Graph (DAG) of instruction dependencies.
   * @param {Array} instructions 
   * @returns {Object} { nodes, edges, inDegree, adjacencyList, reverseAdjacencyList }
   */
  buildDAG(instructions) {
    const n = instructions.length;
    const nodes = instructions.map((inst, index) => ({
      id: index,
      label: inst.label,
      opcode: inst.opcode,
      raw: inst.raw,
      rd: inst.rd,
      rs: inst.rs || [],
      type: inst.type,
      desc: inst.desc
    }));

    const edges = [];
    const inDegree = new Array(n).fill(0);
    const adj = Array.from({ length: n }, () => []);
    const revAdj = Array.from({ length: n }, () => []);

    // Analyze dependencies across all instruction pairs (i < j)
    for (let i = 0; i < n; i++) {
      const producer = instructions[i];
      if (!producer.rd) continue; // STORE or NOP does not write a register

      for (let j = i + 1; j < n; j++) {
        const consumer = instructions[j];

        // 1. RAW (True Dependency): consumer reads what producer writes
        if (consumer.rs && consumer.rs.includes(producer.rd)) {
          // Check if already connected
          if (!adj[i].includes(j)) {
            adj[i].push(j);
            revAdj[j].push(i);
            inDegree[j]++;
            edges.push({
              from: i,
              to: j,
              fromLabel: producer.label,
              toLabel: consumer.label,
              register: producer.rd,
              type: 'RAW',
              weight: producer.type === 'LOAD' ? 2 : 1, // pipeline latency weight
              description: `RAW on ${producer.rd} (${producer.label} -> ${consumer.label})`
            });
          }
        }

        // 2. WAW (Output Dependency): both write to the same register
        // Ordering must be preserved to guarantee final register state
        if (consumer.rd && consumer.rd === producer.rd) {
          if (!adj[i].includes(j)) {
            adj[i].push(j);
            revAdj[j].push(i);
            inDegree[j]++;
            edges.push({
              from: i,
              to: j,
              fromLabel: producer.label,
              toLabel: consumer.label,
              register: producer.rd,
              type: 'WAW',
              weight: 1,
              description: `WAW on ${producer.rd}`
            });
          }
        }

        // 3. WAR (Anti-dependency): consumer writes what producer reads
        // To preserve original semantics, producer must read before consumer overwrites
        if (producer.rs && consumer.rd && producer.rs.includes(consumer.rd)) {
          if (!adj[i].includes(j)) {
            adj[i].push(j);
            revAdj[j].push(i);
            inDegree[j]++;
            edges.push({
              from: i,
              to: j,
              fromLabel: producer.label,
              toLabel: consumer.label,
              register: consumer.rd,
              type: 'WAR',
              weight: 1,
              description: `WAR on ${consumer.rd}`
            });
          }
        }
      }
    }

    return {
      nodes,
      edges,
      inDegree,
      adj,
      revAdj
    };
  }

  /**
   * Performs Kahn's Algorithm for Topological Sort with a pipeline-latency heuristic.
   * Priority rule: Choose an instruction from the ready set that does NOT depend on
   * recently scheduled registers (to fill bubble slots).
   */
  kahnTopologicalSort(dag, instructions) {
    const n = instructions.length;
    const inDegree = [...dag.inDegree];
    const adj = dag.adj;

    // Queue of ready nodes (in-degree == 0)
    let readyQueue = [];
    for (let i = 0; i < n; i++) {
      if (inDegree[i] === 0) {
        readyQueue.push(i);
      }
    }

    const sortedIndices = [];
    const steps = [];
    let stepCount = 0;

    while (readyQueue.length > 0) {
      stepCount++;

      // Heuristic selection:
      // Check which registers were written by the last 2 scheduled instructions
      const recentlyWritten = [];
      const len = sortedIndices.length;
      if (len >= 1 && instructions[sortedIndices[len - 1]].rd) {
        recentlyWritten.push(instructions[sortedIndices[len - 1]].rd);
      }
      if (len >= 2 && instructions[sortedIndices[len - 2]].rd) {
        recentlyWritten.push(instructions[sortedIndices[len - 2]].rd);
      }

      // Pick a candidate from readyQueue that does NOT read any recently written registers
      let chosenIndexInQueue = -1;
      let selectionReason = '';

      for (let qIdx = 0; qIdx < readyQueue.length; qIdx++) {
        const candidateIdx = readyQueue[qIdx];
        const candidateInst = instructions[candidateIdx];
        const hasConflict = candidateInst.rs && candidateInst.rs.some(r => recentlyWritten.includes(r));

        if (!hasConflict) {
          chosenIndexInQueue = qIdx;
          selectionReason = `Zero in-degree & avoids recent RAW hazards on [${recentlyWritten.join(', ') || 'none'}]`;
          break;
        }
      }

      // Fallback: if all ready nodes have a hazard, pick the first ready node
      if (chosenIndexInQueue === -1) {
        chosenIndexInQueue = 0;
        selectionReason = `Zero in-degree (unavoidable dependency latency)`;
      }

      const selectedNode = readyQueue.splice(chosenIndexInQueue, 1)[0];
      sortedIndices.push(selectedNode);

      // Decrement in-degree of all successors
      const unblocked = [];
      for (const neighbor of adj[selectedNode]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          readyQueue.push(neighbor);
          unblocked.push(instructions[neighbor].label);
        }
      }

      steps.push({
        step: stepCount,
        selectedNode: instructions[selectedNode].label,
        instructionText: instructions[selectedNode].raw,
        readyQueueBefore: readyQueue.map(i => instructions[i].label),
        reason: selectionReason,
        unblockedNodes: unblocked,
        currentInDegrees: [...inDegree]
      });
    }

    // Check if graph had cycles (should never happen for straight-line code)
    const isDAG = sortedIndices.length === n;

    // Generate new instruction list with updated sequential labels
    const reorderedInstructions = sortedIndices.map((origIdx, newIdx) => {
      const orig = instructions[origIdx];
      return {
        ...orig,
        id: newIdx,
        label: `I${newIdx}*`,
        origLabel: orig.label,
        origId: origIdx
      };
    });

    return {
      isDAG,
      sortedIndices,
      reorderedInstructions,
      steps
    };
  }

  /**
   * Full pipeline optimization and comparison analysis.
   */
  optimizeAndCompare(instructions, options = { forwarding: false }) {
    if (!instructions || instructions.length === 0) {
      return null;
    }

    // 1. Build DAG
    const dag = this.buildDAG(instructions);

    // 2. Run Kahn's Topo Sort
    const kahnResult = this.kahnTopologicalSort(dag, instructions);

    // 3. Simulate Original Program
    const origSim = this.sim.simulate(instructions, options);

    // 4. Simulate Reordered Program
    const optSim = this.sim.simulate(kahnResult.reorderedInstructions, options);

    // 5. Compute Comparative Metrics
    const cyclesSaved = origSim.totalCycles - optSim.totalCycles;
    const bubblesSaved = origSim.stallsCount - optSim.stallsCount;
    const speedup = origSim.totalCycles > 0 && optSim.totalCycles > 0 
      ? (origSim.totalCycles / optSim.totalCycles).toFixed(2) 
      : 1.0;
    const speedupPct = origSim.totalCycles > 0 
      ? (((origSim.totalCycles - optSim.totalCycles) / origSim.totalCycles) * 100).toFixed(1)
      : 0;

    return {
      dag,
      kahnResult,
      original: {
        instructions,
        simulation: origSim
      },
      optimized: {
        instructions: kahnResult.reorderedInstructions,
        simulation: optSim
      },
      metrics: {
        originalCycles: origSim.totalCycles,
        optimizedCycles: optSim.totalCycles,
        cyclesSaved,
        originalStalls: origSim.stallsCount,
        optimizedStalls: optSim.stallsCount,
        bubblesSaved,
        speedupFactor: parseFloat(speedup),
        speedupPct: parseFloat(speedupPct)
      }
    };
  }
}

// Export for ES modules and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InstructionOptimizer };
}
