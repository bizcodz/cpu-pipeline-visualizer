/**
 * ============================================================================
 * DAA DAG VISUALIZER: Interactive SVG Directed Acyclic Graph Renderer
 * ============================================================================
 */

class DAGVisualizer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.selectedNodeId = null;
  }

  render(dag) {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!dag || !dag.nodes || dag.nodes.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <span class="icon">🕸️</span>
          <p>No instructions to visualize in DAG.</p>
        </div>
      `;
      return;
    }

    const width = this.container.clientWidth || 600;
    const height = Math.max(340, dag.nodes.length * 65);

    // Compute topological layers for clean left-to-right / top-to-bottom layout
    const layers = this.computeLayers(dag);
    const maxLayer = Math.max(...layers);
    const layerCounts = new Array(maxLayer + 1).fill(0);
    layers.forEach(l => layerCounts[l]++);

    // Assign (x, y) coordinates
    const nodePositions = [];
    const layerCurrentIndex = new Array(maxLayer + 1).fill(0);
    const xPadding = 70;
    const yPadding = 50;
    const layerWidth = maxLayer === 0 ? 0 : (width - 2 * xPadding) / maxLayer;

    dag.nodes.forEach((node, i) => {
      const layer = layers[i];
      const countInLayer = layerCounts[layer];
      const indexInLayer = layerCurrentIndex[layer]++;

      const x = maxLayer === 0 ? width / 2 : xPadding + layer * layerWidth;
      const ySpacing = (height - 2 * yPadding) / Math.max(countInLayer, 1);
      const y = yPadding + (indexInLayer + 0.5) * ySpacing;

      nodePositions.push({ x, y, node });
    });

    // Create SVG
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.classList.add('dag-svg');

    // Defs: Arrowheads & Gradients
    const defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML = `
      <marker id="arrow-raw" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#f43f5e" />
      </marker>
      <marker id="arrow-waw" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#eab308" />
      </marker>
      <marker id="arrow-war" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#8b5cf6" />
      </marker>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    `;
    svg.appendChild(defs);

    // Group for Edges
    const edgeGroup = document.createElementNS(svgNS, 'g');
    edgeGroup.classList.add('edges-group');

    dag.edges.forEach(edge => {
      const p1 = nodePositions[edge.from];
      const p2 = nodePositions[edge.to];
      if (!p1 || !p2) return;

      const path = document.createElementNS(svgNS, 'path');
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const cx1 = p1.x + dx * 0.4;
      const cy1 = p1.y;
      const cx2 = p1.x + dx * 0.6;
      const cy2 = p2.y;

      const d = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
      path.setAttribute('d', d);
      path.classList.add('dag-edge', `edge-${edge.type.toLowerCase()}`);
      path.setAttribute('marker-end', `url(#arrow-${edge.type.toLowerCase()})`);
      path.setAttribute('data-from', edge.from);
      path.setAttribute('data-to', edge.to);

      // Edge label
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 6;
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY);
      text.classList.add('dag-edge-label');
      text.textContent = `${edge.type}: ${edge.register}`;

      edgeGroup.appendChild(path);
      edgeGroup.appendChild(text);
    });

    svg.appendChild(edgeGroup);

    // Group for Nodes
    const nodeGroup = document.createElementNS(svgNS, 'g');
    nodeGroup.classList.add('nodes-group');

    nodePositions.forEach((pos, i) => {
      const g = document.createElementNS(svgNS, 'g');
      g.classList.add('dag-node');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.setAttribute('data-id', i);

      // Node background pill
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', '-55');
      rect.setAttribute('y', '-22');
      rect.setAttribute('width', '110');
      rect.setAttribute('height', '44');
      rect.setAttribute('rx', '10');
      rect.classList.add('dag-node-box', `node-type-${pos.node.type.toLowerCase()}`);

      // Instruction label (I0: ADD)
      const title = document.createElementNS(svgNS, 'text');
      title.setAttribute('x', '0');
      title.setAttribute('y', '-4');
      title.classList.add('dag-node-title');
      title.textContent = `${pos.node.label}: ${pos.node.opcode}`;

      // Register detail (Rd -> Rs1, Rs2)
      const sub = document.createElementNS(svgNS, 'text');
      sub.setAttribute('x', '0');
      sub.setAttribute('y', '12');
      sub.classList.add('dag-node-sub');
      const writes = pos.node.rd ? `W:${pos.node.rd}` : 'W:—';
      const reads = pos.node.rs && pos.node.rs.length ? `R:${pos.node.rs.join(',')}` : '';
      sub.textContent = `${writes} ${reads}`.trim();

      g.appendChild(rect);
      g.appendChild(title);
      g.appendChild(sub);

      // Tooltip / title
      const tooltip = document.createElementNS(svgNS, 'title');
      tooltip.textContent = `${pos.node.label}: ${pos.node.raw}\n${pos.node.desc}\nIn-Degree: ${dag.inDegree[i]}`;
      g.appendChild(tooltip);

      // Interactivity: highlight connections on hover
      g.addEventListener('mouseenter', () => this.highlightConnections(i, svg));
      g.addEventListener('mouseleave', () => this.clearHighlights(svg));

      nodeGroup.appendChild(g);
    });

    svg.appendChild(nodeGroup);
    this.container.appendChild(svg);
  }

  computeLayers(dag) {
    const n = dag.nodes.length;
    const layers = new Array(n).fill(0);
    // Longest path layering from in-degree 0
    const inDeg = [...dag.inDegree];
    const q = [];
    for (let i = 0; i < n; i++) {
      if (inDeg[i] === 0) q.push(i);
    }

    while (q.length > 0) {
      const u = q.shift();
      for (const v of dag.adj[u]) {
        layers[v] = Math.max(layers[v], layers[u] + 1);
        inDeg[v]--;
        if (inDeg[v] === 0) {
          q.push(v);
        }
      }
    }

    return layers;
  }

  highlightConnections(nodeId, svg) {
    const edges = svg.querySelectorAll('.dag-edge');
    const nodes = svg.querySelectorAll('.dag-node');

    nodes.forEach(n => {
      const id = parseInt(n.getAttribute('data-id'), 10);
      if (id === nodeId) {
        n.classList.add('selected');
      } else {
        n.classList.add('dimmed');
      }
    });

    edges.forEach(e => {
      const from = parseInt(e.getAttribute('data-from'), 10);
      const to = parseInt(e.getAttribute('data-to'), 10);
      if (from === nodeId || to === nodeId) {
        e.classList.add('active-edge');
        // Un-dim connected node
        const partnerId = from === nodeId ? to : from;
        const partnerNode = svg.querySelector(`.dag-node[data-id="${partnerId}"]`);
        if (partnerNode) {
          partnerNode.classList.remove('dimmed');
          partnerNode.classList.add(from === nodeId ? 'descendant' : 'ancestor');
        }
      } else {
        e.classList.add('dimmed');
      }
    });
  }

  clearHighlights(svg) {
    svg.querySelectorAll('.dag-node').forEach(n => {
      n.classList.remove('selected', 'dimmed', 'ancestor', 'descendant');
    });
    svg.querySelectorAll('.dag-edge').forEach(e => {
      e.classList.remove('active-edge', 'dimmed');
    });
  }
}

// Export for ES modules and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DAGVisualizer };
}
