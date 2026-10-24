/**
 * ============================================================================
 * COA MODULE: 5-Stage MIPS Pipeline Simulator with Hazard Detection & Forwarding
 * ============================================================================
 * Simulates the classic MIPS 5-stage pipeline latches:
 * - IF_ID  : Instruction Fetch -> Decode latch
 * - ID_EX  : Decode -> Execute latch
 * - EX_MEM : Execute -> Memory latch
 * - MEM_WB : Memory -> Write Back latch
 * 
 * Features:
 * - True RAW (Read-After-Write) hazard detection.
 * - Split-cycle register file (WB writes in 1st half of cycle, ID reads in 2nd half).
 * - Toggleable Data Forwarding Unit (EX->EX, MEM->EX).
 * - Load-Use hazard 1-bubble stall detection.
 * - Cycle-by-cycle latch snapshot telemetry for interactive scrubber.
 */

class PipelineSimulator {
  constructor() {
    this.STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
  }

  /**
   * Simulates execution of instructions through the 5-stage pipeline.
   * @param {Array} instructions 
   * @param {Object} options { forwarding: boolean }
   * @returns {Object} Simulation results including timeline, stalls, cycle snapshots
   */
  simulate(instructions, options = { forwarding: false }) {
    const n = instructions ? instructions.length : 0;
    if (n === 0) {
      return {
        timeline: [],
        totalCycles: 0,
        hazards: [],
        stallsCount: 0,
        instructionsExecuted: 0,
        ipc: 0,
        cycleSnapshots: []
      };
    }

    const forwarding = !!options.forwarding;

    // timeline[instIdx][cycle - 1] = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB' | 'STALL' | null
    const timeline = instructions.map(() => []);
    const hazards = [];
    let totalStalls = 0;

    // Latches
    let if_id = null;
    let id_ex = null;
    let ex_mem = null;
    let mem_wb = null;

    let pc = 0;
    let currentCycle = 1;
    const maxCycles = 300;
    const cycleSnapshots = [];

    while ((pc < n || if_id || id_ex || ex_mem || mem_wb) && currentCycle < maxCycles) {
      let next_if_id = null;
      let next_id_ex = null;
      let next_ex_mem = null;
      let next_mem_wb = null;

      let stall_id = false;
      let stallReason = null;

      // 1. WB Stage
      if (mem_wb !== null) {
        timeline[mem_wb.id].push('WB');
        // Retired
      }

      // 2. MEM Stage
      if (ex_mem !== null) {
        timeline[ex_mem.id].push('MEM');
        next_mem_wb = ex_mem;
      }

      // 3. EX Stage
      if (id_ex !== null) {
        timeline[id_ex.id].push('EX');
        next_ex_mem = id_ex;
      }

      // 4. ID Stage & Hazard Detection
      if (if_id !== null) {
        const currInst = if_id;
        const srcRegs = currInst.rs || [];

        for (const src of srcRegs) {
          // Check producer in EX stage (id_ex)
          if (id_ex && id_ex.rd === src) {
            if (!forwarding) {
              stall_id = true;
              stallReason = {
                cycle: currentCycle,
                currInst: currInst.label,
                producerInst: id_ex.label,
                register: src,
                producerStage: 'EX',
                type: 'RAW (No Forwarding)',
                description: `${currInst.label} reads ${src} being computed by ${id_ex.label} in EX.`
              };
              break;
            } else {
              // With forwarding, LOAD producer in EX requires 1 stall because memory data is only ready at MEM
              if (id_ex.type === 'LOAD') {
                stall_id = true;
                stallReason = {
                  cycle: currentCycle,
                  currInst: currInst.label,
                  producerInst: id_ex.label,
                  register: src,
                  producerStage: 'EX (LOAD)',
                  type: 'Load-Use Hazard (1 Stall)',
                  description: `Load-Use hazard: ${currInst.label} reads ${src} from ${id_ex.label}. Data ready at MEM.`
                };
                break;
              }
              // ALU producer in EX can forward directly to EX -> 0 stalls!
            }
          }

          // Check producer in MEM stage (ex_mem)
          if (ex_mem && ex_mem.rd === src) {
            if (!forwarding) {
              stall_id = true;
              stallReason = {
                cycle: currentCycle,
                currInst: currInst.label,
                producerInst: ex_mem.label,
                register: src,
                producerStage: 'MEM',
                type: 'RAW (No Forwarding)',
                description: `${currInst.label} reads ${src} being accessed by ${ex_mem.label} in MEM.`
              };
              break;
            }
            // With forwarding, MEM forwards to EX directly via bypass unit -> 0 stalls!
          }
        }

        if (stall_id) {
          timeline[currInst.id].push('STALL');
          totalStalls++;
          next_id_ex = null;   // bubble inserted downstream
          next_if_id = if_id;  // hold instruction in IF/ID latch
          hazards.push(stallReason);
        } else {
          timeline[currInst.id].push('ID');
          next_id_ex = currInst;
        }
      }

      // 5. IF Stage
      if (stall_id) {
        // Freeze PC: no new instruction fetched
        for (let idx = pc; idx < n; idx++) {
          timeline[idx].push(null);
        }
      } else {
        if (pc < n) {
          const fetchedInst = instructions[pc];
          timeline[fetchedInst.id].push('IF');
          next_if_id = fetchedInst;
          pc++;
        }
        for (let idx = pc; idx < n; idx++) {
          timeline[idx].push(null);
        }
      }

      // Pad instructions that have already retired
      for (let idx = 0; idx < n; idx++) {
        while (timeline[idx].length < currentCycle) {
          timeline[idx].push(null);
        }
      }

      // Snapshot latch state for visual scrubber
      cycleSnapshots.push({
        cycle: currentCycle,
        IF: next_if_id ? next_if_id.label : '—',
        ID: next_id_ex ? next_id_ex.label : (stall_id ? `${if_id.label} (STALL)` : '—'),
        EX: next_ex_mem ? next_ex_mem.label : '—',
        MEM: next_mem_wb ? next_mem_wb.label : '—',
        WB: mem_wb ? mem_wb.label : '—',
        hazard: stallReason
      });

      // Advance latches to next cycle
      if_id = next_if_id;
      id_ex = next_id_ex;
      ex_mem = next_ex_mem;
      mem_wb = next_mem_wb;

      currentCycle++;
    }

    const totalCycles = currentCycle - 1;
    const ipc = n > 0 && totalCycles > 0 ? (n / totalCycles).toFixed(2) : 0;

    return {
      timeline,
      totalCycles,
      hazards,
      stallsCount: totalStalls,
      instructionsExecuted: n,
      ipc: parseFloat(ipc),
      cycleSnapshots,
      forwardingEnabled: forwarding
    };
  }
}

// Export for ES modules and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PipelineSimulator };
}
