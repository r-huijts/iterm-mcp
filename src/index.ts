// Enhanced tool descriptions for better AI understanding
// Replace the tools array in index.ts with this version

const tools = [
  // Original iTerm tools
  {
    name: "write_to_terminal",
    description: "Execute commands in the active iTerm terminal. Use this to run any shell command, script, or program. Examples: 'npm test', 'git status', 'python script.py'. The command runs in the current working directory of the terminal. After execution, use read_terminal_output to see the results. Note: This doesn't return output directly - it only tells you how many lines were produced.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute. Can be any valid terminal command including pipes, redirects, and command chaining with && or ||"
        },
      },
      required: ["command"]
    }
  },
  {
    name: "read_terminal_output",
    description: "Read the most recent output from the iTerm terminal. Always use this after write_to_terminal to see command results. Reads the specified number of lines from the terminal buffer, counting from the bottom (most recent). Use a higher line count for commands with verbose output. Essential for verifying command execution success and reading error messages.",
    inputSchema: {
      type: "object",
      properties: {
        linesOfOutput: {
          type: "integer",
          description: "Number of lines to read from the bottom of the terminal. Default is 25. Increase for long outputs (e.g., 100 for test results, 200 for build logs)"
        },
      },
      required: ["linesOfOutput"]
    }
  },
  {
    name: "send_control_character",
    description: "Send control characters to interrupt or control running processes in the terminal. Use 'c' to stop a running process (Ctrl+C), 'z' to suspend it (Ctrl+Z), 'd' to send EOF (Ctrl+D), or 'l' to clear screen (Ctrl+L). Essential for stopping runaway processes, exiting interactive programs, or managing long-running tasks.",
    inputSchema: {
      type: "object",
      properties: {
        letter: {
          type: "string",
          description: "The control character letter: 'c' (interrupt), 'z' (suspend), 'd' (EOF), 'l' (clear), or ']' (telnet escape)"
        },
      },
      required: ["letter"]
    }
  },
  
  // File operation tools
  {
    name: "read_file",
    description: "Read the complete contents of any text file using Node.js file system (not terminal commands). This is the primary way to inspect code files, configuration files, or any text content. Much more reliable than using 'cat' in the terminal. Returns the entire file content as a string. Use this before making any modifications to understand the current state.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path. Examples: 'src/index.js', '/Users/name/project/config.json', './README.md'"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write or append content to a file using Node.js file system. Creates the file if it doesn't exist, including any necessary parent directories. Use mode 'w' to completely replace file contents, or 'a' to add to the end. This is the most direct way to create or modify files - much more reliable than echo/cat in terminal. Perfect for saving generated code, updating configurations, or creating new files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path where to write. Parent directories will be created if needed"
        },
        content: {
          type: "string",
          description: "The complete content to write to the file. For mode 'w', this replaces everything. For mode 'a', this is added to the end"
        },
        mode: {
          type: "string",
          description: "Write mode: 'w' completely overwrites the file (default), 'a' appends to the end of existing content",
          enum: ["w", "a"],
          default: "w"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "write_file_with_diff",
    description: "Write file with automatic backup and optional diff preview. This is the SAFEST way to modify existing files. It: 1) Creates a timestamped backup in .backups/ folder, 2) Shows a unified diff of changes (if file exists), 3) Writes the new content. Perfect for refactoring code or making careful edits where you want to see exactly what changed. The diff uses standard unified format showing removed lines with '-' and added lines with '+'.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to write. If file exists, a backup will be created before overwriting"
        },
        content: {
          type: "string",
          description: "The new complete content for the file"
        },
        show_diff: {
          type: "boolean",
          description: "Whether to include a unified diff in the response showing what changed. Default true. Set false for new files or when diff isn't needed",
          default: true
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "create_directory",
    description: "Create a directory and all necessary parent directories. Safe to call even if directory already exists. Use this before writing files to ensure the directory structure exists, or when setting up project structures. Works like 'mkdir -p' but using Node.js file system.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to create. Examples: 'src/components/forms', './test/fixtures'. Parent directories are created automatically"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "list_directory",
    description: "List contents of a directory with clear [FILE] and [DIR] labels. Use this to explore project structure, find files, or verify directory contents. Can list recursively to see entire directory trees. More reliable than 'ls' command as it provides consistent formatted output. Essential for understanding project organization before making changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Use '.' for current directory. Examples: 'src/', '../', '/Users/name/project'",
          default: "."
        },
        recursive: {
          type: "boolean",
          description: "List all subdirectories recursively. Useful for seeing entire project structure. Warning: can produce very long output for large directories",
          default: false
        }
      }
    }
  },
  
  // Change management tools - for careful file modifications
  {
    name: "stage_changes",
    description: "Stage file changes for human review before applying them. This creates a 'pending change' that can be reviewed, previewed with diff, and then either applied or rejected. Use this when making important changes that need human approval. Each staged change gets a unique ID and is saved in .pending/ directory. This is the SAFEST approach for critical file modifications. The process: 1) Stage the change, 2) Human reviews with preview_change, 3) Human decides to apply_change or reject_change.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to change. The file doesn't need to exist yet"
        },
        content: {
          type: "string",
          description: "The complete new content for the file"
        },
        description: {
          type: "string",
          description: "Human-readable description of what this change does and why. Helps the user understand the purpose when reviewing"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_pending_changes",
    description: "List all staged changes waiting for review. Shows change IDs, file paths, timestamps, and descriptions. Use this to see what changes are queued for human approval. Each change shows its unique ID (needed for preview/apply/reject), the file it affects, when it was staged, and its description. Essential for managing multiple pending modifications.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "preview_change",
    description: "Preview a specific staged change with full unified diff. Shows exactly what will change if the change is applied - removed lines prefixed with '-', added lines with '+', and context lines for clarity. Use this with a change ID from list_pending_changes to help humans understand the impact before approving. Essential for reviewing staged modifications.",
    inputSchema: {
      type: "object",
      properties: {
        change_id: {
          type: "string",
          description: "The unique change ID from list_pending_changes. Example: 'a1b2c3d4'"
        }
      },
      required: ["change_id"]
    }
  },
  {
    name: "apply_change",
    description: "Apply a staged change after human approval. This: 1) Creates a backup of the current file (if it exists), 2) Writes the new content, 3) Removes the change from pending queue. Use this after preview_change when the human approves. The change ID comes from list_pending_changes. Once applied, the change cannot be reversed except by restoring from backup.",
    inputSchema: {
      type: "object",
      properties: {
        change_id: {
          type: "string",
          description: "The unique change ID to apply. Must be a valid ID from list_pending_changes"
        }
      },
      required: ["change_id"]
    }
  },
  {
    name: "reject_change",
    description: "Reject and delete a staged change without applying it. Removes the change from the pending queue and cleans up associated files. Use this when the human decides not to proceed with a staged modification. The original file remains untouched. Once rejected, the change is permanently deleted.",
    inputSchema: {
      type: "object",
      properties: {
        change_id: {
          type: "string",
          description: "The unique change ID to reject. Must be a valid ID from list_pending_changes"
        }
      },
      required: ["change_id"]
    }
  },
  {
    name: "create_backup",
    description: "Create a timestamped backup of any file. Copies the file to .backups/ directory with format: filename_YYYY-MM-DD_HHMMSS.bak. Use this before risky operations or when you want to preserve the current state. Backups are never automatically deleted. Returns the backup file path for reference.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to backup. File must exist or error will be thrown"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "apply_patch",
    description: "Apply a unified diff patch to a file. Supports standard unified diff format (like from 'git diff' or 'diff -u'). Use dry_run=true first to preview what would happen. Automatically creates a backup before applying. Useful for applying changes from external sources or reverting modifications. Note: Current implementation is a placeholder - full patch application coming soon.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Target file to apply the patch to"
        },
        patch: {
          type: "string",
          description: "Unified diff format patch content. Should include --- and +++ headers and @@ hunk markers"
        },
        dry_run: {
          type: "boolean",
          description: "If true, only preview what would be done without actually applying. Always use true first to verify the patch will apply correctly",
          default: true
        }
      },
      required: ["path", "patch"]
    }
  }
];