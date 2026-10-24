/**
 * ============================================================================
 * FLAT DFA VISUALIZER: Interactive Automaton State Graph & Step Animator
 * ============================================================================
 */

class DFAVisualizer {
  constructor(canvasContainerId, stepContainerId) {
    this.canvasContainer = document.getElementById(canvasContainerId);
    this.stepContainer = document.getElementById(stepContainerId);
    this.currentStepIdx = 0;
    this.steps = [];

    // State coordinates for visual graph layout
    this.stateNodes = {
      'q0':        { x: 50,  y: 110, label: 'q₀', desc: 'Initial / Start', isStart: true },
      'q_op':      { x: 150, y: 110, label: 'q_op', desc: 'Reading Opcode' },
      'q_w1':      { x: 250, y: 110, label: 'q_w1', desc: 'Delimiter (Space)' },
      'q_r1_init': { x: 350, y: 60,  label: 'q_r1', desc: "Prefix 'R'" },
      'q_r1_num':  { x: 450, y: 60,  label: 'q_rd', desc: 'Dest Reg Digits' },
      'q_c1':      { x: 550, y: 110, label: 'q_c1', desc: 'Comma 1' },
      'q_w2':      { x: 650, y: 110, label: 'q_w2', desc: 'Whitespace' },
      'q_r2_init': { x: 740, y: 60,  label: 'q_r2', desc: "Prefix 'R'" },
      'q_r2_num':  { x: 820, y: 60,  label: 'q_s1', desc: 'Src1 Reg' },
      'q_imm_num': { x: 780, y: 170, label: 'q_imm', desc: 'Immediate Value' },
      'q_c2':      { x: 900, y: 110, label: 'q_c2', desc: 'Comma 2' },
      'q_w3':      { x: 980, y: 110, label: 'q_w3', desc: 'Whitespace' },
      'q_r3_init': { x: 1060, y: 110, label: 'q_r3', desc: "Prefix 'R'" },
      'q_r3_num':  { x: 1150, y: 110, label: 'q_s2', desc: 'Src2 Reg' },
      'q_accept':  { x: 1250, y: 110, label: 'q_acc', desc: 'Valid Instruction', isAccept: true },
      'q_reject':  { x: 650, y: 220, label: 'q_rej', desc: 'Trap / Syntax Error', isError: true }
    };
  }

  renderAutomaton(activeState = 'q0') {
    if (!this.canvasContainer) return;
    this.canvasContainer.innerHTML = '';

    const width = 1320;
    const height = 280;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.classList.add('dfa-svg');

    // Defs
    const defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML = `
      <marker id="dfa-arrow" viewBox="0 0 10 10" refX="21" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#64748b" />
      </marker>
      <marker id="dfa-arrow-active" viewBox="0 0 10 10" refX="21" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#38bdf8" />
      </marker>
    `;
    svg.appendChild(defs);

    // Primary state transitions to draw as lines
    const transitions = [
      { from: 'q0', to: 'q_op', label: '[A-Z]' },
      { from: 'q_op', to: 'q_w1', label: '\\s+' },
      { from: 'q_w1', to: 'q_r1_init', label: "'R'" },
      { from: 'q_r1_init', to: 'q_r1_num', label: '[0-9]' },
      { from: 'q_r1_num', to: 'q_c1', label: "','" },
      { from: 'q_c1', to: 'q_w2', label: '\\s*' },
      { from: 'q_w2', to: 'q_r2_init', label: "'R'" },
      { from: 'q_r2_init', to: 'q_r2_num', label: '[0-9]' },
      { from: 'q_w2', to: 'q_imm_num', label: '[0-9-]' },
      { from: 'q_imm_num', to: 'q_accept', label: 'EOF' },
      { from: 'q_r2_num', to: 'q_c2', label: "','" },
      { from: 'q_c2', to: 'q_w3', label: '\\s*' },
      { from: 'q_w3', to: 'q_r3_init', label: "'R'" },
      { from: 'q_r3_init', to: 'q_r3_num', label: '[0-9]' },
      { from: 'q_r3_num', to: 'q_accept', label: 'EOF' },
      { from: 'q_op', to: 'q_accept', label: 'EOF (NOP)' }
    ];

    // Draw transition curves
    transitions.forEach(tr => {
      const p1 = this.stateNodes[tr.from];
      const p2 = this.stateNodes[tr.to];
      if (!p1 || !p2) return;

      const path = document.createElementNS(svgNS, 'path');
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const d = `M ${p1.x} ${p1.y} C ${p1.x + dx * 0.4} ${p1.y + dy * 0.1}, ${p1.x + dx * 0.6} ${p2.y - dy * 0.1}, ${p2.x} ${p2.y}`;
      path.setAttribute('d', d);
      path.classList.add('dfa-transition-line');
      path.setAttribute('marker-end', 'url(#dfa-arrow)');

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 8;
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY);
      text.classList.add('dfa-transition-label');
      text.textContent = tr.label;

      svg.appendChild(path);
      svg.appendChild(text);
    });

    // Draw states
    Object.keys(this.stateNodes).forEach(stateKey => {
      const node = this.stateNodes[stateKey];
      const g = document.createElementNS(svgNS, 'g');
      g.classList.add('dfa-state-group');
      if (stateKey === activeState) g.classList.add('active-state');
      if (node.isAccept) g.classList.add('accept-state');
      if (node.isError) g.classList.add('error-state');
      if (node.isStart) g.classList.add('start-state');

      // Outer circle (double circle for accept states)
      if (node.isAccept) {
        const outerCircle = document.createElementNS(svgNS, 'circle');
        outerCircle.setAttribute('cx', node.x);
        outerCircle.setAttribute('cy', node.y);
        outerCircle.setAttribute('r', '24');
        outerCircle.classList.add('dfa-accept-ring');
        g.appendChild(outerCircle);
      }

      // Main circle
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', '19');
      circle.classList.add('dfa-state-circle');
      g.appendChild(circle);

      // Label
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', node.y + 5);
      text.classList.add('dfa-state-text');
      text.textContent = node.label;
      g.appendChild(text);

      // Sub description
      const desc = document.createElementNS(svgNS, 'text');
      desc.setAttribute('x', node.x);
      desc.setAttribute('y', node.y + 35);
      desc.classList.add('dfa-state-desc');
      desc.textContent = node.desc;
      g.appendChild(desc);

      svg.appendChild(g);
    });

    this.canvasContainer.appendChild(svg);
  }

  loadLineTrace(lineParseResult) {
    if (!lineParseResult || !lineParseResult.transitions) {
      this.steps = [];
      this.renderAutomaton('q0');
      if (this.stepContainer) {
        this.stepContainer.innerHTML = '<p class="text-muted">No line selected for DFA simulation.</p>';
      }
      return;
    }

    this.steps = lineParseResult.transitions;
    this.currentStepIdx = 0;
    this.renderStep(0);
  }

  renderStep(index) {
    if (this.steps.length === 0) return;
    this.currentStepIdx = Math.max(0, Math.min(index, this.steps.length - 1));
    const step = this.steps[this.currentStepIdx];

    // Highlight the active state in graph
    this.renderAutomaton(step.toState);

    // Render interactive step inspector
    if (this.stepContainer) {
      this.stepContainer.innerHTML = `
        <div class="dfa-step-card">
          <div class="step-badge-row">
            <span class="badge badge-step">Char Step ${this.currentStepIdx + 1} / ${this.steps.length}</span>
            <span class="badge ${step.toState === 'q_reject' ? 'badge-danger' : step.toState === 'q_accept' ? 'badge-success' : 'badge-primary'}">
              State: ${step.toState}
            </span>
          </div>
          <div class="step-transition-equation">
            <code>δ(${step.fromState}, '<span class="highlight-char">${step.char}</span>') = <strong>${step.toState}</strong></code>
          </div>
          <p class="step-note">${step.note || 'Processing character token.'}</p>
          <div class="step-scrubber">
            <button class="btn btn-sm btn-outline" id="dfa-prev-btn" ${this.currentStepIdx === 0 ? 'disabled' : ''}>◀ Prev Char</button>
            <input type="range" id="dfa-step-range" min="0" max="${this.steps.length - 1}" value="${this.currentStepIdx}" class="scrubber-slider" />
            <button class="btn btn-sm btn-outline" id="dfa-next-btn" ${this.currentStepIdx === this.steps.length - 1 ? 'disabled' : ''}>Next Char ▶</button>
          </div>
        </div>
      `;

      // Wire controls
      document.getElementById('dfa-prev-btn')?.addEventListener('click', () => this.renderStep(this.currentStepIdx - 1));
      document.getElementById('dfa-next-btn')?.addEventListener('click', () => this.renderStep(this.currentStepIdx + 1));
      document.getElementById('dfa-step-range')?.addEventListener('input', (e) => this.renderStep(parseInt(e.target.value, 10)));
    }
  }
}

// Export for ES modules and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DFAVisualizer };
}
