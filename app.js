/**
 * ============================================================================
 * ARCHFLOW APPLICATION CONTROLLER
 * ============================================================================
 * Coordinates the 3 Subject Modules:
 * - FLAT: DFALexer & DFAVisualizer
 * - COA: PipelineSimulator & Timeline Renderer
 * - DAA: InstructionOptimizer & DAGVisualizer
 */

class ArchFlowApp {
  constructor() {
    this.lexer = new DFALexer();
    this.simulator = new PipelineSimulator();
    this.optimizer = new InstructionOptimizer();

    // App State
    this.sourceCode = '';
    this.parseResult = null;
    this.analysis = null;
    this.forwardingEnabled = false;
    this.currentViewMode = 'original'; // 'original' | 'optimized' | 'comparison'
    this.activeCycle = 1;
    this.isPlaying = false;
    this.playInterval = null;
    this.playbackSpeedMs = 800;

    // Sub-visualizers
    this.dagVisualizer = null;
    this.dfaVisualizer = null;

    // Presets
    this.presets = {
      classic: {
        name: 'Classic Prompt RAW Hazard (4 Insts)',
        code: `; Classic RAW Hazard Demonstration
LOAD R1, 0
ADD R2, R1, R3
SUB R4, R2, R5
MUL R6, R7, R8`,
        desc: 'Demonstrates how MUL is independent and can be hoisted by Kahn’s algorithm to eliminate bubbles.'
      },
      interleaved: {
        name: 'Interleaving Benchmark (High Speedup)',
        code: `; Interleaving 3 Independent Data Streams
LOAD R1, 100
ADD R2, R1, R0
LOAD R3, 200
SUB R4, R3, R0
LOAD R5, 300
MUL R6, R5, R0`,
        desc: 'Without optimization, back-to-back RAW stalls occur. Topological sorting reorders to achieve 0 stalls.'
      },
      load_use: {
        name: 'Load-Use Hazard & Forwarding Unit',
        code: `; Load-Use Hazard
LOAD R1, 50
ADD R2, R1, R3
STORE R2, 200`,
        desc: 'Observe the 1-stall bubble that remains even with forwarding enabled due to memory read latency.'
      },
      deep_chain: {
        name: 'Deep Dependency Chain with Floater',
        code: `; Dependency Chain + Independent Work
LOAD R1, 10
ADD R2, R1, R1
ADD R3, R2, R2
ADD R4, R3, R3
MUL R7, R8, R9
LOAD R5, 40`,
        desc: 'Kahn’s algorithm schedules MUL and LOAD R5 early between dependencies to maximize throughput.'
      },
      dfa_syntax_error: {
        name: 'FLAT Syntax Error & DFA Trap',
        code: `; Syntax Error Demonstration for FLAT DFA
LOAD R1, 100
ADD R2, R1, R3
SUB X99, R2, R5   ; X99 is invalid register syntax!`,
        desc: 'Demonstrates DFA transitioning into q_reject state with precise error column localization.'
      }
    };
  }

  init() {
    this.dagVisualizer = new DAGVisualizer('dag-container');
    this.dfaVisualizer = new DFAVisualizer('dfa-canvas-container', 'dfa-step-container');

    this.bindEvents();
    this.loadPreset('classic');
  }

  bindEvents() {
    // Code Editor Input
    const editor = document.getElementById('assembly-input');
    editor?.addEventListener('input', () => {
      this.sourceCode = editor.value;
      this.runAnalysis();
    });

    // Preset selector
    const presetSelect = document.getElementById('preset-select');
    presetSelect?.addEventListener('change', (e) => {
      this.loadPreset(e.target.value);
    });

    // Forwarding Toggle
    const forwardingToggle = document.getElementById('forwarding-toggle');
    forwardingToggle?.addEventListener('change', (e) => {
      this.forwardingEnabled = e.target.checked;
      document.getElementById('forwarding-status-badge').textContent = this.forwardingEnabled ? 'FORWARDING ON' : 'NO FORWARDING';
      document.getElementById('forwarding-status-badge').className = `badge ${this.forwardingEnabled ? 'badge-success' : 'badge-neutral'}`;
      this.runAnalysis();
    });

    // View Mode Switcher (Original / Optimized / Comparison)
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentViewMode = e.currentTarget.getAttribute('data-view');
        this.renderTimelineViews();
      });
    });

    // Subject Detail Tabs (COA Timeline / DAA DAG / FLAT DFA / Report)
    document.querySelectorAll('.panel-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content-panel').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const targetPanelId = e.currentTarget.getAttribute('data-target');
        document.getElementById(targetPanelId)?.classList.add('active');

        if (targetPanelId === 'tab-dfa') {
          this.updateDFAPanel();
        } else if (targetPanelId === 'tab-dag' && this.analysis) {
          this.dagVisualizer.render(this.analysis.dag);
        }
      });
    });

    // Playback Controls
    document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-prev-cycle')?.addEventListener('click', () => this.stepCycle(-1));
    document.getElementById('btn-next-cycle')?.addEventListener('click', () => this.stepCycle(1));
    document.getElementById('btn-reset-cycle')?.addEventListener('click', () => this.setCycle(1));
    document.getElementById('cycle-scrubber')?.addEventListener('input', (e) => this.setCycle(parseInt(e.target.value, 10)));
    document.getElementById('speed-select')?.addEventListener('change', (e) => {
      this.playbackSpeedMs = parseInt(e.target.value, 10);
      if (this.isPlaying) {
        this.pause();
        this.play();
      }
    });

    // Line selector for DFA inspection
    document.getElementById('dfa-line-select')?.addEventListener('change', (e) => {
      const lineIdx = parseInt(e.target.value, 10);
      if (this.parseResult && this.parseResult.parsedLines[lineIdx]) {
        this.dfaVisualizer.loadLineTrace(this.parseResult.parsedLines[lineIdx]);
      }
    });

    // Python Modal Toggle
    document.getElementById('btn-view-python')?.addEventListener('click', () => {
      document.getElementById('python-modal')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-python-modal')?.addEventListener('click', () => {
      document.getElementById('python-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-copy-python')?.addEventListener('click', () => {
      const code = document.getElementById('python-code-block')?.textContent;
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-python');
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = 'Copy Python Script', 2000);
      });
    });
  }

  loadPreset(presetKey) {
    const preset = this.presets[presetKey];
    if (!preset) return;

    const editor = document.getElementById('assembly-input');
    if (editor) {
      editor.value = preset.code;
      this.sourceCode = preset.code;
    }
    const descEl = document.getElementById('preset-description');
    if (descEl) descEl.textContent = preset.desc;

    this.runAnalysis();
  }

  runAnalysis() {
    this.parseResult = this.lexer.parseProgram(this.sourceCode);

    const errorContainer = document.getElementById('editor-error-banner');
    if (!this.parseResult.isValid) {
      const firstErr = this.parseResult.errors[0];
      errorContainer.innerHTML = `
        <div class="alert alert-error">
          <span class="icon">⚠️</span>
          <div>
            <strong>FLAT Lexer Syntax Error:</strong> ${firstErr.error}
            <div class="error-code-preview">Line ${firstErr.lineNum}: <code>${firstErr.raw}</code></div>
          </div>
        </div>
      `;
      errorContainer.classList.remove('hidden');
      this.analysis = null;
      this.renderEmptyState();
      this.updateDFAPanel();
      return;
    } else {
      errorContainer.classList.add('hidden');
    }

    if (this.parseResult.instructions.length === 0) {
      this.analysis = null;
      this.renderEmptyState();
      return;
    }

    // Run DAA Optimization and COA Simulation
    this.analysis = this.optimizer.optimizeAndCompare(this.parseResult.instructions, {
      forwarding: this.forwardingEnabled
    });

    // Update UI elements
    this.updateMetrics();
    this.renderTimelineViews();
    this.updateCycleScrubber();
    this.updateDFAPanel();

    // Render DAG if visible
    if (this.analysis) {
      this.dagVisualizer.render(this.analysis.dag);
      this.renderKahnTraceTable();
    }
  }

  updateMetrics() {
    if (!this.analysis) return;
    const m = this.analysis.metrics;
    const setSafe = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setSafe('metric-orig-cycles', m.originalCycles);
    setSafe('metric-opt-cycles', m.optimizedCycles);
    setSafe('metric-saved-cycles', m.cyclesSaved >= 0 ? `-${m.cyclesSaved}` : `+${Math.abs(m.cyclesSaved)}`);
    setSafe('metric-orig-stalls', m.originalStalls);
    setSafe('metric-opt-stalls', m.optimizedStalls);
    setSafe('metric-saved-stalls', m.bubblesSaved >= 0 ? `-${m.bubblesSaved}` : `+${Math.abs(m.bubblesSaved)}`);
    setSafe('metric-speedup', `${m.speedupFactor}x (${m.speedupPct >= 0 ? '+' : ''}${m.speedupPct}%)`);

    // Speedup badge color
    const badge = document.getElementById('speedup-badge');
    if (badge) {
      badge.className = `metric-trend ${m.cyclesSaved > 0 ? 'trend-positive' : 'trend-neutral'}`;
      badge.textContent = m.cyclesSaved > 0 ? `🚀 ${m.bubblesSaved} Bubbles Eliminated` : 'Identical Stalls';
    }
  }

  renderTimelineViews() {
    if (!this.analysis) return;

    const singleContainer = document.getElementById('single-timeline-wrapper');
    const compContainer = document.getElementById('comparison-timeline-wrapper');

    if (this.currentViewMode === 'comparison') {
      singleContainer.classList.add('hidden');
      compContainer.classList.remove('hidden');

      this.renderGrid('timeline-grid-orig-comp', this.analysis.original.instructions, this.analysis.original.simulation, 'Original Sequence');
      this.renderGrid('timeline-grid-opt-comp', this.analysis.optimized.instructions, this.analysis.optimized.simulation, 'DAA Kahn’s Reordered Sequence');
    } else {
      singleContainer.classList.remove('hidden');
      compContainer.classList.add('hidden');

      const isOpt = this.currentViewMode === 'optimized';
      const instructions = isOpt ? this.analysis.optimized.instructions : this.analysis.original.instructions;
      const sim = isOpt ? this.analysis.optimized.simulation : this.analysis.original.simulation;
      const title = isOpt ? 'DAA Reordered Pipeline (Kahn’s Topo Sort)' : 'Original Order Pipeline';

      this.renderGrid('timeline-grid-single', instructions, sim, title);
    }

    this.updateActiveCycleHighlight();
  }

  renderGrid(containerId, instructions, simulation, title) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalCycles = simulation.totalCycles;
    let html = `<div class="timeline-table-card">`;
    html += `<div class="timeline-card-header">`;
    html += `<h4>${title}</h4>`;
    html += `<div class="timeline-stats-summary">Total Cycles: <strong>${totalCycles}</strong> | Stalls: <span class="badge-stall-count">${simulation.stallsCount} bubbles</span> | IPC: <strong>${simulation.ipc}</strong></div>`;
    html += `</div>`;

    html += `<div class="timeline-table-scroll"><table class="timeline-table"><thead><tr>`;
    html += `<th class="sticky-col-inst">Instruction</th>`;

    for (let c = 1; c <= totalCycles; c++) {
      html += `<th class="cycle-col-hdr ${c === this.activeCycle ? 'active-cycle-header' : ''}" data-cycle="${c}">C${c}</th>`;
    }
    html += `</tr></thead><tbody>`;

    instructions.forEach((inst, rowIdx) => {
      const row = simulation.timeline[rowIdx] || [];
      html += `<tr>`;
      html += `<td class="sticky-col-inst inst-title-cell" title="${inst.raw} (${inst.desc || ''})">`;
      html += `<span class="inst-tag inst-type-${inst.type.toLowerCase()}">${inst.label}</span> `;
      html += `<span class="inst-code">${inst.raw}</span>`;
      html += `</td>`;

      for (let c = 1; c <= totalCycles; c++) {
        const stage = row[c - 1];
        const isCurrentActive = (c === this.activeCycle);
        if (!stage) {
          html += `<td class="stage-cell empty-cell ${isCurrentActive ? 'active-cycle-cell' : ''}" data-cycle="${c}"></td>`;
        } else if (stage === 'STALL') {
          html += `<td class="stage-cell cell-stall ${isCurrentActive ? 'active-cycle-cell' : ''}" data-cycle="${c}" title="Pipeline Bubble (RAW Hazard Stall)">
            <span class="stage-badge badge-stall">STALL</span>
          </td>`;
        } else {
          html += `<td class="stage-cell cell-${stage.toLowerCase()} ${isCurrentActive ? 'active-cycle-cell' : ''}" data-cycle="${c}" title="Cycle ${c}: ${inst.label} is in ${stage}">
            <span class="stage-badge badge-${stage.toLowerCase()}">${stage}</span>
          </td>`;
        }
      }
      html += `</tr>`;
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
  }

  updateCycleScrubber() {
    if (!this.analysis) return;
    const sim = this.currentViewMode === 'optimized' ? this.analysis.optimized.simulation : this.analysis.original.simulation;
    const maxCycles = sim.totalCycles || 1;

    const scrubber = document.getElementById('cycle-scrubber');
    if (scrubber) {
      scrubber.max = maxCycles.toString();
      scrubber.value = Math.min(this.activeCycle, maxCycles).toString();
    }
    this.updateLatchBar(sim);
  }

  setCycle(cycle) {
    if (!this.analysis) return;
    const sim = this.currentViewMode === 'optimized' ? this.analysis.optimized.simulation : this.analysis.original.simulation;
    const maxCycles = sim.totalCycles || 1;

    this.activeCycle = Math.max(1, Math.min(cycle, maxCycles));
    const scrubber = document.getElementById('cycle-scrubber');
    if (scrubber) scrubber.value = this.activeCycle.toString();

    document.getElementById('current-cycle-display').textContent = `Cycle ${this.activeCycle} / ${maxCycles}`;

    this.updateActiveCycleHighlight();
    this.updateLatchBar(sim);
  }

  stepCycle(delta) {
    this.setCycle(this.activeCycle + delta);
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (!this.analysis) return;
    const sim = this.currentViewMode === 'optimized' ? this.analysis.optimized.simulation : this.analysis.original.simulation;
    const maxCycles = sim.totalCycles || 1;

    if (this.activeCycle >= maxCycles) {
      this.activeCycle = 1;
    }

    this.isPlaying = true;
    const btn = document.getElementById('btn-play');
    if (btn) btn.innerHTML = '⏸ Pause';

    this.playInterval = setInterval(() => {
      if (this.activeCycle >= maxCycles) {
        this.pause();
      } else {
        this.setCycle(this.activeCycle + 1);
      }
    }, this.playbackSpeedMs);
  }

  pause() {
    this.isPlaying = false;
    clearInterval(this.playInterval);
    this.playInterval = null;
    const btn = document.getElementById('btn-play');
    if (btn) btn.innerHTML = '▶ Play';
  }

  updateActiveCycleHighlight() {
    document.querySelectorAll('.stage-cell, .cycle-col-hdr').forEach(el => {
      const c = parseInt(el.getAttribute('data-cycle'), 10);
      if (c === this.activeCycle) {
        if (el.classList.contains('cycle-col-hdr')) {
          el.classList.add('active-cycle-header');
        } else {
          el.classList.add('active-cycle-cell');
        }
      } else {
        el.classList.remove('active-cycle-header', 'active-cycle-cell');
      }
    });
  }

  updateLatchBar(sim) {
    if (!sim || !sim.cycleSnapshots) return;
    const snapshot = sim.cycleSnapshots[this.activeCycle - 1];
    if (!snapshot) return;

    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach(stage => {
      const el = document.getElementById(`latch-${stage.toLowerCase()}`);
      if (el) el.textContent = snapshot[stage] || '—';
    });

    const hazardBadge = document.getElementById('latch-hazard-alert');
    if (hazardBadge) {
      if (snapshot.hazard) {
        hazardBadge.innerHTML = `⚠️ <strong>Hazard in Cycle ${this.activeCycle}:</strong> ${snapshot.hazard.description}`;
        hazardBadge.classList.remove('hidden');
      } else {
        hazardBadge.classList.add('hidden');
      }
    }
  }

  renderKahnTraceTable() {
    const tableBody = document.getElementById('kahn-trace-tbody');
    if (!tableBody || !this.analysis) return;

    const steps = this.analysis.kahnResult.steps;
    let html = '';

    steps.forEach(st => {
      html += `<tr>`;
      html += `<td><strong>Step ${st.step}</strong></td>`;
      html += `<td><span class="badge badge-primary">${st.selectedNode}</span> <code>${st.instructionText}</code></td>`;
      html += `<td>${st.readyQueueBefore.length ? st.readyQueueBefore.map(q => `<span class="badge badge-outline">${q}</span>`).join(' ') : '<em>Empty</em>'}</td>`;
      html += `<td><span class="text-success">${st.unblockedNodes.length ? st.unblockedNodes.map(u => `<span class="badge badge-success">+${u}</span>`).join(' ') : 'None'}</span></td>`;
      html += `<td><small>${st.reason}</small></td>`;
      html += `</tr>`;
    });

    tableBody.innerHTML = html;
  }

  updateDFAPanel() {
    const select = document.getElementById('dfa-line-select');
    if (!select || !this.parseResult) return;

    select.innerHTML = '';
    const nonBlank = this.parseResult.parsedLines
      .map((p, idx) => ({ p, idx }))
      .filter(item => !item.p.isEmpty);

    if (nonBlank.length === 0) {
      select.innerHTML = '<option value="">No instructions</option>';
      this.dfaVisualizer.loadLineTrace(null);
      return;
    }

    nonBlank.forEach(({ p, idx }) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = `Line ${p.lineNum}: ${p.raw.trim()}`;
      select.appendChild(opt);
    });

    // Load first line trace
    select.value = nonBlank[0].idx.toString();
    this.dfaVisualizer.loadLineTrace(this.parseResult.parsedLines[nonBlank[0].idx]);
  }

  renderEmptyState() {
    const singleContainer = document.getElementById('single-timeline-wrapper');
    if (singleContainer) {
      singleContainer.innerHTML = `
        <div class="empty-state">
          <span class="icon">💻</span>
          <p>Please enter valid assembly code or select a preset to simulate.</p>
        </div>
      `;
    }
  }
}

// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.archFlow = new ArchFlowApp();
  window.archFlow.init();
});
