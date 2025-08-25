# iterm-mcp - Enhanced Coding Agent
A Model Context Protocol server that provides access to your iTerm session AND powerful file operations for AI-assisted coding.


### Features

**Natural Integration:** You share iTerm with the model. You can ask questions about what's on the screen, or delegate a task to the model and watch as it performs each step.

**Lightning Fast Performance:** Now with **iTerm2 Python API integration** - 3-5x faster than AppleScript! Command execution, output reading, and control characters are dramatically faster.

**Full Terminal Control and REPL support:** The model can start and interact with REPL's as well as send control characters like ctrl-c, ctrl-z, etc.

**Safe File Operations:** Read and write files using Node.js file system APIs - no shell escaping issues! Features automatic backups, diff previews, and a staging system for reviewing changes before applying them.

**Change Management:** Stage file modifications for human review with full diff preview. Accept or reject changes individually. All changes are backed up automatically.

**Easy on the Dependencies:** iterm-mcp is built with minimal dependencies and is runnable via npx. It's designed to be easy to add to Claude Desktop and other MCP clients. It should just work.


## Safety Considerations

* The user is responsible for using the tool safely.
* No built-in restrictions: iterm-mcp makes no attempt to evaluate the safety of commands that are executed.
* Models can behave in unexpected ways. The user is expected to monitor activity and abort when appropriate.
* For multi-step tasks, you may need to interrupt the model if it goes off track. Start with smaller, focused tasks until you're familiar with how the model behaves. 
* **File modifications create automatic backups** in the `.backups/` directory
* **Use the staging system** for critical changes that need review

### Tools

#### Terminal Operations
- `write_to_terminal` - Writes to the active iTerm terminal, often used to run a command. Returns the number of lines of output produced by the command.
- `read_terminal_output` - Reads the requested number of lines from the active iTerm terminal.
- `send_control_character` - Sends a control character to the active iTerm terminal (e.g., Ctrl-C to stop a process).

#### File Operations
- `read_file` - Read any text file using Node.js file system (no shell escaping issues).
- `write_file` - Write or append content to files with automatic parent directory creation.
- `write_file_with_diff` - Write files with automatic backup and unified diff preview.
- `create_directory` - Create directories with all necessary parent directories.
- `list_directory` - List directory contents with clear [FILE] and [DIR] labels.
- `create_backup` - Manually create timestamped backups of any file.

#### Change Management (for careful modifications)
- `stage_changes` - Stage file changes for human review before applying.
- `list_pending_changes` - List all staged changes waiting for review.
- `preview_change` - Preview a staged change with full unified diff.
- `apply_change` - Apply a staged change after human approval (with automatic backup).
- `reject_change` - Reject and remove a staged change without applying.
- `apply_patch` - Apply unified diff patches with dry-run support.

### Requirements

* iTerm2 must be running
* Node version 18 or greater
* Python 3.7+ (for Python API integration)
* Additional dependency: `diff` package for generating file diffs

### Python API Setup (Recommended)

For optimal performance, enable the iTerm2 Python API:

1. Open iTerm2 → Preferences → General → Python API
2. Check "Enable Python API"
3. Set "Require 'Automation' permission" for security

The server will automatically install the required Python packages in a virtual environment.


## Installation

### Quick Install (NPX)

To use with Claude Desktop, add the server config:

On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iterm-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "iterm-mcp"
      ]
    }
  }
}
```

### Local Installation (Recommended for Development)

1. Clone and install:
```bash
git clone https://github.com/yourusername/iterm-mcp.git
cd iterm-mcp
npm install
npm run build
```

2. Update Claude Desktop config to use local version:
```json
{
  "mcpServers": {
    "iterm-coding-agent": {
      "command": "node",
      "args": ["/absolute/path/to/iterm-mcp/build/index.js"]
    }
  }
}
```

### Installing via Smithery

To install iTerm for Claude Desktop automatically via [Smithery](https://smithery.ai/server/iterm-mcp):

```bash
npx -y @smithery/cli install iterm-mcp --client claude
```
[![smithery badge](https://smithery.ai/badge/iterm-mcp)](https://smithery.ai/server/iterm-mcp)

## Usage Examples

### Basic Terminal Operations

**You**: "Run the tests for this project"  
**AI**: I'll run the tests for you.
- *Executes `npm test` in terminal*
- *Reads the output to see results*
- "The tests are complete. I can see 15 tests passed and 2 failed. The failures are in the authentication module."

**You**: "There's a process running on port 3000 that I need to stop"  
**AI**: I'll help you find and stop that process.
- *Runs `lsof -i :3000` to find the process*
- *Reads the output to get the PID*
- *Runs `kill -9 [PID]` to stop it*
- "I've stopped the process that was running on port 3000."

### Safe File Modifications

**You**: "Update the API URL in config.js to use the production endpoint"  
**AI**: I'll update the API URL in your config file. Let me first check the current configuration.
- *Reads config.js to see current content*
- *Writes the updated file with automatic backup*
- "I've updated config.js to use the production API endpoint. A backup was created at `.backups/config.js_2024-07-29_143022.bak`. Here's what changed:
  ```diff
  - const API_URL = 'http://localhost:3000/api';
  + const API_URL = 'https://api.production.com/v1';
  ```"

### Staged Changes Workflow

**You**: "I need you to refactor the database connection module, but I want to review the changes first"  
**AI**: I'll refactor the database connection module and stage the changes for your review.
- *Reads the current database.js file*
- *Stages the refactored version with a description*
- "I've staged the database refactoring changes with ID `d4f8a2c1`. The changes include:
  - Converted callbacks to async/await
  - Added connection pooling
  - Improved error handling
  
  You can review the full diff by asking me to 'show the changes for d4f8a2c1'."

**You**: "Show me the changes for d4f8a2c1"  
**AI**: Here's the diff for the staged database refactoring:
- *Shows the complete unified diff*
- "Would you like me to apply these changes or make any modifications?"

**You**: "Apply the changes"  
**AI**: I'll apply the database refactoring changes now.
- *Creates backup and applies the staged changes*
- "Changes applied successfully! The original file is backed up at `.backups/database.js_2024-07-29_144512.bak`."

### Project Exploration

**You**: "What's the structure of this React project?"  
**AI**: I'll explore the project structure for you.
- *Lists the root directory*
- *Recursively lists the src directory*
- "This is a React project with the following structure:
  - `src/components/` - Contains Button, Form, and Layout components
  - `src/pages/` - Has Home, About, and Contact pages  
  - `src/utils/` - Utility functions and helpers
  - `src/api/` - API integration modules
  
  The project uses TypeScript and appears to follow a standard React application structure."

### Complex Workflows

**You**: "Set up a new feature branch and create the initial files for a user authentication system"  
**AI**: I'll set up a new feature branch and create the authentication system structure.
- *Runs `git checkout -b feature/user-auth`*
- *Creates directory structure: `src/auth/`*
- *Creates initial files with basic templates*
- "I've set up the authentication feature:
  1. Created new branch 'feature/user-auth'
  2. Created the following structure:
     - `src/auth/AuthContext.js` - React context for auth state
     - `src/auth/useAuth.js` - Custom hook for authentication
     - `src/auth/LoginForm.js` - Login component
     - `src/auth/api.js` - Auth API functions
  
  All files have basic boilerplate code to get you started."

## File Storage Locations

- **Backups**: `.backups/` - Timestamped copies of files before modifications
- **Pending Changes**: `.pending/` - Staged changes awaiting review
- Both directories are created automatically and ignored by git (add to .gitignore)

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. Key areas for improvement:

- Full patch file application support
- Multiple file operations in single command
- Integration with git for better version control
- File watching capabilities
- Template system for common file patterns

## License

MIT