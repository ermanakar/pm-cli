export const REPL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Allowed paths: docs/**, .pmx/**, src/**, package.json, README.md, etc.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The relative path to the file (e.g. src/index.ts)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the project. Recursive by default. Use "." for root or "src/" for code.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path (default: .)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Propose a write to a documentation file. The user will review and confirm.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The path to write to (must start with docs/ or .pmx/)' },
          content: { type: 'string', description: 'The full content of the file' },
          reason: { type: 'string', description: 'Short reason for this change (e.g. "Add dark mode FAQ")' }
        },
        required: ['path', 'content', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_investigation',
      description: 'DELEGATE a deep, autonomous investigation to a sub-agent. Use this for complex questions ("How does X work?", "Audit Y") that require reading multiple files.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'The question or goal to investigate (e.g. "How does auth work?")' }
        },
        required: ['objective']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_feature_flow',
      description: 'DELEGATE the creation of a Product Requirement Document (PRD) or feature spec. Use this whenever the user asks to "plan", "spec", or "design" a new feature.',
      parameters: {
        type: 'object',
        properties: {
          request: { type: 'string', description: 'The feature request or idea (e.g. "Add a dark mode toggle")' }
        },
        required: ['request']
      }
    }
  }
];
