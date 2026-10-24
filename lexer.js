/**
 * ============================================================================
 * FLAT MODULE: Assembly Lexer, Regular Expressions & DFA Tokenizer
 * ============================================================================
 * Implements:
 * 1. DFA (Deterministic Finite Automaton) character-by-character state tracker.
 * 2. Regex-based pattern matching for token extraction and syntax validation.
 * 3. Formal transition table and state visualizer metadata for academic report.
 */

class DFALexer {
  constructor() {
    // Supported opcodes and their syntactic classes
    this.OPCODES = {
      'ADD':   { type: 'ALU',   operands: ['REG', 'REG', 'REG'], desc: 'Integer Add (Rd = Rs1 + Rs2)' },
      'SUB':   { type: 'ALU',   operands: ['REG', 'REG', 'REG'], desc: 'Integer Subtract (Rd = Rs1 - Rs2)' },
      'MUL':   { type: 'ALU',   operands: ['REG', 'REG', 'REG'], desc: 'Integer Multiply (Rd = Rs1 * Rs2)' },
      'AND':   { type: 'ALU',   operands: ['REG', 'REG', 'REG'], desc: 'Bitwise AND (Rd = Rs1 & Rs2)' },
      'OR':    { type: 'ALU',   operands: ['REG', 'REG', 'REG'], desc: 'Bitwise OR (Rd = Rs1 | Rs2)' },
      'LOAD':  { type: 'LOAD',  operands: ['REG', 'IMM_OR_MEM'], desc: 'Load Word (Rd = Mem/Imm)' },
      'STORE': { type: 'STORE', operands: ['REG', 'IMM_OR_MEM'], desc: 'Store Word (Mem/Imm = Rs)' },
      'NOP':   { type: 'NOP',   operands: [],                   desc: 'No Operation (Pipeline Bubble)' }
    };

    // DFA Definition: States Q, Alphabet Sigma, Start State q0, Accepting States F
    this.states = [
      'q0',        // Start state (skipping leading whitespace)
      'q_op',      // Reading opcode characters (A-Z)
      'q_w1',      // Whitespace after opcode
      'q_r1_init', // Reading 'R' of 1st operand
      'q_r1_num',  // Reading register digits (e.g., '1', '2')
      'q_c1',      // Comma after 1st operand
      'q_w2',      // Whitespace after 1st comma
      'q_r2_init', // Reading 'R' of 2nd operand
      'q_r2_num',  // Reading register digits of 2nd operand
      'q_imm_sign',// Sign (+/-) of immediate
      'q_imm_num', // Reading digits of immediate value
      'q_mem_open',// Reading '[' for memory reference
      'q_mem_reg_r',
      'q_mem_reg_num',
      'q_mem_close',
      'q_c2',      // Comma after 2nd operand
      'q_w3',      // Whitespace after 2nd comma
      'q_r3_init', // Reading 'R' of 3rd operand
      'q_r3_num',  // Reading register digits of 3rd operand
      'q_comm',    // In comment (; or //) until end of line
      'q_accept',  // Valid instruction accepted
      'q_reject'   // Syntax error / Trap state
    ];

    // Regex token patterns for fast tokenization & verification
    this.regexPatterns = {
      WHITESPACE: /^\s+/,
      COMMENT: /^([;#]|\/\/).*$/,
      OPCODE: /^(LOAD|STORE|ADD|SUB|MUL|AND|OR|NOP)\b/i,
      REGISTER: /^R([0-9]|[12][0-9]|3[01])\b/i,
      IMMEDIATE: /^(?:0x[0-9a-fA-F]+|-?\d+)\b/,
      COMMA: /^,/,
      MEM_ADDR: /^\[\s*R([0-9]|[12][0-9]|3[01])\s*\]/i
    };
  }

  /**
   * Tokenizes a single line of assembly and simulates the DFA transition sequence.
   * Returns: { isValid, tokens, transitions, instruction, error }
   */
  parseLine(rawLine, lineNum = 1) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return {
        isEmpty: true,
        isValid: true,
        raw: rawLine,
        lineNum,
        tokens: [],
        transitions: [{ state: 'q0', char: 'ε', nextState: 'q0', note: 'Blank / Comment line' }]
      };
    }

    // Run the step-by-step DFA simulation for visualization
    const dfaTrace = this.simulateDFA(rawLine);
    
    // Parse using structured regex tokens for robust AST generation
    const parseResult = this.regexParse(trimmed, lineNum, rawLine);

    return {
      isEmpty: false,
      isValid: parseResult.success && dfaTrace.isValid,
      raw: rawLine,
      lineNum,
      tokens: parseResult.tokens || [],
      instruction: parseResult.instruction,
      transitions: dfaTrace.steps,
      error: parseResult.error || dfaTrace.error
    };
  }

  /**
   * Character-by-character DFA simulation for FLAT demonstration.
   */
  simulateDFA(line) {
    let state = 'q0';
    const steps = [];
    let i = 0;
    const len = line.length;

    while (i < len) {
      const char = line[i];
      let nextState = 'q_reject';
      let note = '';

      switch (state) {
        case 'q0':
          if (/\s/.test(char)) {
            nextState = 'q0';
            note = 'Skip leading space';
          } else if (/[a-zA-Z]/.test(char)) {
            nextState = 'q_op';
            note = 'Start reading Opcode';
          } else if (char === ';' || char === '#' || (char === '/' && line[i+1] === '/')) {
            nextState = 'q_comm';
            note = 'Comment detected';
          } else {
            nextState = 'q_reject';
            note = `Unexpected character '${char}' at start`;
          }
          break;

        case 'q_op':
          if (/[a-zA-Z]/.test(char)) {
            nextState = 'q_op';
            note = 'Reading Opcode';
          } else if (/\s/.test(char)) {
            nextState = 'q_w1';
            note = 'Opcode finished, reading delimiter';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
            note = 'Opcode with inline comment';
          } else {
            nextState = 'q_reject';
            note = `Invalid character '${char}' in opcode`;
          }
          break;

        case 'q_w1':
          if (/\s/.test(char)) {
            nextState = 'q_w1';
            note = 'Skip whitespace';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_r1_init';
            note = "Recognizing register prefix 'R'";
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
            note = `Expected register prefix 'R', got '${char}'`;
          }
          break;

        case 'q_r1_init':
          if (/\d/.test(char)) {
            nextState = 'q_r1_num';
            note = 'Reading register number';
          } else {
            nextState = 'q_reject';
            note = `Register prefix 'R' must be followed by digits`;
          }
          break;

        case 'q_r1_num':
          if (/\d/.test(char)) {
            nextState = 'q_r1_num';
            note = 'Reading 2nd digit of register';
          } else if (char === ',') {
            nextState = 'q_c1';
            note = 'Found comma after 1st operand';
          } else if (/\s/.test(char)) {
            nextState = 'q_r1_num'; // allow trailing space before comma
            note = 'Whitespace before comma';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
            note = `Expected ',' or whitespace, got '${char}'`;
          }
          break;

        case 'q_c1':
          if (/\s/.test(char)) {
            nextState = 'q_w2';
            note = 'Whitespace after comma';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_r2_init';
            note = "Recognizing 2nd register prefix 'R'";
          } else if (/[\d-]/.test(char)) {
            nextState = 'q_imm_num';
            note = 'Recognizing immediate number';
          } else if (char === '[') {
            nextState = 'q_mem_open';
            note = 'Recognizing memory dereference [';
          } else {
            nextState = 'q_reject';
            note = `Unexpected token after comma: '${char}'`;
          }
          break;

        case 'q_w2':
          if (/\s/.test(char)) {
            nextState = 'q_w2';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_r2_init';
            note = 'Reading 2nd register';
          } else if (/[\d-]/.test(char)) {
            nextState = 'q_imm_num';
            note = 'Reading immediate value';
          } else if (char === '[') {
            nextState = 'q_mem_open';
            note = 'Reading memory address';
          } else {
            nextState = 'q_reject';
            note = `Expected register, immediate or memory pointer, got '${char}'`;
          }
          break;

        case 'q_r2_init':
          if (/\d/.test(char)) {
            nextState = 'q_r2_num';
            note = 'Reading 2nd register number';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_r2_num':
          if (/\d/.test(char)) {
            nextState = 'q_r2_num';
          } else if (char === ',') {
            nextState = 'q_c2';
            note = 'Found 2nd comma';
          } else if (/\s/.test(char)) {
            nextState = 'q_r2_num';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_imm_num':
          if (/[0-9a-fA-FxX]/.test(char)) {
            nextState = 'q_imm_num';
            note = 'Reading immediate digits';
          } else if (/\s/.test(char)) {
            nextState = 'q_imm_num';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_mem_open':
          if (/\s/.test(char)) {
            nextState = 'q_mem_open';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_mem_reg_r';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_mem_reg_r':
          if (/\d/.test(char)) {
            nextState = 'q_mem_reg_num';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_mem_reg_num':
          if (/\d/.test(char)) {
            nextState = 'q_mem_reg_num';
          } else if (char === ']') {
            nextState = 'q_mem_close';
            note = 'Closed memory bracket ]';
          } else if (/\s/.test(char)) {
            nextState = 'q_mem_reg_num';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_mem_close':
          if (/\s/.test(char)) {
            nextState = 'q_mem_close';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_c2':
          if (/\s/.test(char)) {
            nextState = 'q_w3';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_r3_init';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_w3':
          if (/\s/.test(char)) {
            nextState = 'q_w3';
          } else if (char === 'R' || char === 'r') {
            nextState = 'q_r3_init';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_r3_init':
          if (/\d/.test(char)) {
            nextState = 'q_r3_num';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_r3_num':
          if (/\d/.test(char)) {
            nextState = 'q_r3_num';
          } else if (/\s/.test(char)) {
            nextState = 'q_r3_num';
          } else if (char === ';' || char === '#') {
            nextState = 'q_comm';
          } else {
            nextState = 'q_reject';
          }
          break;

        case 'q_comm':
          nextState = 'q_comm'; // stay in comment until newline
          break;

        default:
          nextState = 'q_reject';
      }

      steps.push({
        index: i,
        char: char === ' ' ? '␣' : char,
        fromState: state,
        toState: nextState,
        note
      });

      if (nextState === 'q_reject') {
        return {
          isValid: false,
          finalState: 'q_reject',
          error: `DFA Rejected at char #${i+1} '${char}': ${note || 'Invalid transition'}`,
          steps
        };
      }

      state = nextState;
      i++;
    }

    // Accepting states:
    const acceptingStates = new Set(['q_op', 'q_r1_num', 'q_r2_num', 'q_r3_num', 'q_imm_num', 'q_mem_close', 'q_comm']);
    const isAccepted = acceptingStates.has(state);

    steps.push({
      index: i,
      char: 'EOF',
      fromState: state,
      toState: isAccepted ? 'q_accept' : 'q_reject',
      note: isAccepted ? 'End of line reached in accepting state' : 'Incomplete instruction at EOF'
    });

    return {
      isValid: isAccepted,
      finalState: isAccepted ? 'q_accept' : 'q_reject',
      error: isAccepted ? null : `Syntax Error: Incomplete assembly statement`,
      steps
    };
  }

  /**
   * Fast, structured regex parser to produce verified AST for COA and DAA stages.
   */
  regexParse(line, lineNum, rawLine) {
    // Strip trailing comments
    const commentMatch = line.match(/\s*(?:[;#]|\/\/).*$/);
    const codePart = commentMatch ? line.slice(0, commentMatch.index).trim() : line.trim();

    if (!codePart) {
      return { success: true, tokens: [], instruction: null };
    }

    // Match opcode
    const opMatch = codePart.match(/^([A-Z]+)\b/i);
    if (!opMatch) {
      return { success: false, error: `Invalid syntax on line ${lineNum}: No valid opcode found.` };
    }

    const opcode = opMatch[1].toUpperCase();
    if (!this.OPCODES[opcode]) {
      return { success: false, error: `Line ${lineNum}: Unknown opcode '${opcode}'. Supported: ${Object.keys(this.OPCODES).join(', ')}` };
    }

    const opMeta = this.OPCODES[opcode];
    const rest = codePart.slice(opMatch[0].length).trim();

    // Handle NOP
    if (opcode === 'NOP') {
      if (rest.length > 0) {
        return { success: false, error: `Line ${lineNum}: NOP instruction takes no operands.` };
      }
      return {
        success: true,
        tokens: [{ type: 'OPCODE', value: 'NOP' }],
        instruction: {
          id: lineNum - 1,
          label: `I${lineNum - 1}`,
          raw: rawLine,
          opcode: 'NOP',
          rd: null,
          rs: [],
          imm: null,
          type: 'NOP',
          lineNum,
          desc: opMeta.desc
        }
      };
    }

    // Split operands by comma
    const operandTokens = rest.split(',').map(s => s.trim());

    if (opMeta.type === 'ALU') {
      // Must have 3 operands: Rd, Rs1, Rs2
      if (operandTokens.length !== 3) {
        return { success: false, error: `Line ${lineNum}: ${opcode} requires 3 operands: ${opcode} Rd, Rs1, Rs2 (got ${operandTokens.length})` };
      }

      const regRegex = /^R([0-9]|[12][0-9]|3[01])$/i;
      const rdMatch = operandTokens[0].match(regRegex);
      const rs1Match = operandTokens[1].match(regRegex);
      const rs2Match = operandTokens[2].match(regRegex);

      if (!rdMatch) return { success: false, error: `Line ${lineNum}: Invalid destination register '${operandTokens[0]}'` };
      if (!rs1Match) return { success: false, error: `Line ${lineNum}: Invalid source register 1 '${operandTokens[1]}'` };
      if (!rs2Match) return { success: false, error: `Line ${lineNum}: Invalid source register 2 '${operandTokens[2]}'` };

      const rd = `R${parseInt(rdMatch[1], 10)}`;
      const rs1 = `R${parseInt(rs1Match[1], 10)}`;
      const rs2 = `R${parseInt(rs2Match[1], 10)}`;

      return {
        success: true,
        tokens: [
          { type: 'OPCODE', value: opcode },
          { type: 'REGISTER', value: rd, role: 'DEST' },
          { type: 'COMMA', value: ',' },
          { type: 'REGISTER', value: rs1, role: 'SRC1' },
          { type: 'COMMA', value: ',' },
          { type: 'REGISTER', value: rs2, role: 'SRC2' }
        ],
        instruction: {
          id: lineNum - 1,
          label: `I${lineNum - 1}`,
          raw: rawLine,
          opcode,
          rd,
          rs: [rs1, rs2],
          imm: null,
          type: 'ALU',
          lineNum,
          desc: `${opMeta.desc} → ${rd} = ${rs1} ${opcode === 'ADD' ? '+' : opcode === 'SUB' ? '-' : opcode === 'MUL' ? '*' : opcode} ${rs2}`
        }
      };
    }

    if (opcode === 'LOAD') {
      // LOAD Rd, imm  OR  LOAD Rd, [Rs]
      if (operandTokens.length !== 2) {
        return { success: false, error: `Line ${lineNum}: LOAD requires 2 operands: LOAD Rd, imm OR LOAD Rd, [Rs]` };
      }

      const regRegex = /^R([0-9]|[12][0-9]|3[01])$/i;
      const rdMatch = operandTokens[0].match(regRegex);
      if (!rdMatch) return { success: false, error: `Line ${lineNum}: Invalid destination register '${operandTokens[0]}'` };

      const rd = `R${parseInt(rdMatch[1], 10)}`;
      const secondOp = operandTokens[1];

      // Check if memory dereference [Rs]
      const memMatch = secondOp.match(/^\[\s*R([0-9]|[12][0-9]|3[01])\s*\]$/i);
      if (memMatch) {
        const rs = `R${parseInt(memMatch[1], 10)}`;
        return {
          success: true,
          tokens: [
            { type: 'OPCODE', value: 'LOAD' },
            { type: 'REGISTER', value: rd, role: 'DEST' },
            { type: 'COMMA', value: ',' },
            { type: 'MEM_ADDR', value: `[${rs}]`, baseReg: rs }
          ],
          instruction: {
            id: lineNum - 1,
            label: `I${lineNum - 1}`,
            raw: rawLine,
            opcode: 'LOAD',
            rd,
            rs: [rs],
            imm: null,
            type: 'LOAD',
            lineNum,
            desc: `Load word from address [${rs}] into ${rd}`
          }
        };
      }

      // Check immediate number
      const immMatch = secondOp.match(/^(?:0x[0-9a-fA-F]+|-?\d+)$/);
      if (immMatch) {
        const immVal = secondOp.startsWith('0x') ? parseInt(secondOp, 16) : parseInt(secondOp, 10);
        return {
          success: true,
          tokens: [
            { type: 'OPCODE', value: 'LOAD' },
            { type: 'REGISTER', value: rd, role: 'DEST' },
            { type: 'COMMA', value: ',' },
            { type: 'IMMEDIATE', value: immVal }
          ],
          instruction: {
            id: lineNum - 1,
            label: `I${lineNum - 1}`,
            raw: rawLine,
            opcode: 'LOAD',
            rd,
            rs: [], // Immediate load has no register source dependency
            imm: immVal,
            type: 'LOAD',
            lineNum,
            desc: `Load immediate value ${immVal} into ${rd}`
          }
        };
      }

      return { success: false, error: `Line ${lineNum}: Second operand of LOAD must be an immediate (e.g. 0, 100) or [Rs] (e.g. [R2])` };
    }

    if (opcode === 'STORE') {
      // STORE Rs, [Rd]  OR  STORE Rs, address
      if (operandTokens.length !== 2) {
        return { success: false, error: `Line ${lineNum}: STORE requires 2 operands: STORE Rs, [Rd] OR STORE Rs, address` };
      }

      const regRegex = /^R([0-9]|[12][0-9]|3[01])$/i;
      const rsMatch = operandTokens[0].match(regRegex);
      if (!rsMatch) return { success: false, error: `Line ${lineNum}: Invalid source register '${operandTokens[0]}'` };

      const rs = `R${parseInt(rsMatch[1], 10)}`;
      const secondOp = operandTokens[1];

      const memMatch = secondOp.match(/^\[\s*R([0-9]|[12][0-9]|3[01])\s*\]$/i);
      if (memMatch) {
        const addrReg = `R${parseInt(memMatch[1], 10)}`;
        return {
          success: true,
          tokens: [
            { type: 'OPCODE', value: 'STORE' },
            { type: 'REGISTER', value: rs, role: 'SRC' },
            { type: 'COMMA', value: ',' },
            { type: 'MEM_ADDR', value: `[${addrReg}]`, baseReg: addrReg }
          ],
          instruction: {
            id: lineNum - 1,
            label: `I${lineNum - 1}`,
            raw: rawLine,
            opcode: 'STORE',
            rd: null, // Store writes memory, not a register
            rs: [rs, addrReg], // Both register to store and address register are read
            imm: null,
            type: 'STORE',
            lineNum,
            desc: `Store ${rs} to memory at address [${addrReg}]`
          }
        };
      }

      const immMatch = secondOp.match(/^(?:0x[0-9a-fA-F]+|-?\d+)$/);
      if (immMatch) {
        const immVal = parseInt(secondOp, 10);
        return {
          success: true,
          tokens: [
            { type: 'OPCODE', value: 'STORE' },
            { type: 'REGISTER', value: rs, role: 'SRC' },
            { type: 'COMMA', value: ',' },
            { type: 'IMMEDIATE', value: immVal }
          ],
          instruction: {
            id: lineNum - 1,
            label: `I${lineNum - 1}`,
            raw: rawLine,
            opcode: 'STORE',
            rd: null,
            rs: [rs],
            imm: immVal,
            type: 'STORE',
            lineNum,
            desc: `Store ${rs} to memory address ${immVal}`
          }
        };
      }

      return { success: false, error: `Line ${lineNum}: Destination of STORE must be [Rd] or address` };
    }

    return { success: false, error: `Line ${lineNum}: Unhandled instruction format` };
  }

  /**
   * Tokenizes an entire assembly program.
   */
  parseProgram(sourceText) {
    const lines = sourceText.split(/\r?\n/);
    const parsedLines = [];
    const instructions = [];
    const errors = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const res = this.parseLine(line, lineNum);
      parsedLines.push(res);
      if (!res.isEmpty) {
        if (!res.isValid) {
          errors.push({ lineNum, error: res.error, raw: line });
        } else if (res.instruction) {
          // Re-index instructions sequentially (I0, I1, ...)
          const inst = { ...res.instruction, id: instructions.length, label: `I${instructions.length}` };
          instructions.push(inst);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      instructions,
      parsedLines
    };
  }
}

// Export for ES modules and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DFALexer };
}
