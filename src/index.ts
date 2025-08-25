#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import CommandExecutor from "./CommandExecutor.js";
import PythonCommandExecutor from "./PythonCommandExecutor.js";
import TtyOutputReader from "./TtyOutputReader.js";
import PythonTtyOutputReader from "./PythonTtyOutputReader.js";
import SendControlCharacter from "./SendControlCharacter.js";
import PythonSendControlCharacter from "./PythonSendControlCharacter.js";
import FileOperations from "./FileOperations.js";

const fileOps = new FileOperations();

// Configuration: Set to true to use the faster Python API, false for AppleScript
const USE_PYTHON_API = true;

const server = new Server(
  {
    name: "iterm-coding-agent",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
              type: "number",
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
              enum: ["w", "a"],
              description: "Write mode: 'w' completely overwrites the file (default), 'a' appends to the end of existing content"
            }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "write_file_with_diff",
        description: "Write file with diff preview showing exactly what changed. This is perfect for code modifications where you want to see the changes clearly. Shows a unified diff with removed lines marked with '-' and added lines with '+'. No backups are created - trust Git for version control.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path to write. If file exists, a diff will be shown"
            },
            content: {
              type: "string",
              description: "The new complete content for the file"
            },
            show_diff: {
              type: "boolean",
              description: "Whether to include a unified diff in the response showing what changed. Default true. Set false for new files or when diff isn't needed"
            }
          },
          required: ["path", "content"]
        }
      },
     

      // Staging system tools
      {
        name: "stage_changes",
        description: "Stage file changes for human review before applying them. This creates a 'pending change' that can be reviewed, previewed with diff, and then either applied or rejected. Use this when making important changes that need human approval. Each staged change gets a unique ID and is saved in .pending/ directory. This is the SAFEST approach for critical file modifications. The process: 1) Stage the change, 2) Human reviews with preview_change, 3) Human decides to apply_change or reject_change. IMPORTANT: Always follow up by using preview_change and displaying the diff in a formatted ```diff code block so the human can see exactly what will change and approve/reject the changes.",
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
        description: "Preview a specific staged change with full unified diff. Shows exactly what will change if the change is applied - removed lines prefixed with '-', added lines with '+', and context lines for clarity. Use this with a change ID from list_pending_changes to help humans understand the impact before approving. Essential for reviewing staged modifications. CRITICAL: Always format the diff output in a ```diff code block immediately after calling this tool so the human can clearly see and review the proposed changes before deciding to apply or reject them.",
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
        description: "Apply a staged change after human approval. This writes the new content and removes the change from pending queue. Use this after preview_change when the human approves. The change ID comes from list_pending_changes. Once applied, the change is permanent (trust Git for version control).",
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

      // Patch system tools
      {
        name: "apply_patch",
        description: "Apply a unified diff patch to a file with comprehensive validation and error handling. Supports standard unified diff format (like from 'git diff' or 'diff -u'). Features: 1) Validates patch syntax before applying, 2) Shows detailed analysis of what will change, 3) Provides detailed success/error reporting with hunk counts. Use dry_run=true first to preview changes safely. Perfect for applying patches from external sources, reverting modifications, or collaborative development workflows.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Target file to apply the patch to. File must exist unless patch creates a new file."
            },
            patch: {
              type: "string",
              description: "Unified diff format patch content. Should include --- and +++ headers and @@ hunk markers. Example format:\n--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n line1\n-old line\n+new line\n line3"
            },
            dry_run: {
              type: "boolean",
              description: "If true, analyzes and validates the patch without applying it. Shows what would change and whether the patch can be applied cleanly. ALWAYS use true first to verify the patch before applying."
            }
          },
          required: ["path", "patch"]
        }
      },
      {
        name: "validate_patch",
        description: "Validate a unified diff patch without applying it to any file. This is useful for checking patch syntax, understanding what files are affected, and identifying potential issues before attempting to apply the patch. Returns detailed analysis including affected files, validation status, and any warnings or errors.",
        inputSchema: {
          type: "object",
          properties: {
            patch: {
              type: "string",
              description: "Unified diff format patch content to validate. Should include --- and +++ headers and @@ hunk markers."
            }
          },
          required: ["patch"]
        }
      },
      {
        name: "generate_patch",
        description: "Generate a unified diff patch by comparing two files. Useful for creating patches that can be shared, version controlled, or applied later. The generated patch follows standard unified diff format and can be used with apply_patch.",
        inputSchema: {
          type: "object",
          properties: {
            old_file: {
              type: "string",
              description: "Path to the original/old version of the file"
            },
            new_file: {
              type: "string",
              description: "Path to the modified/new version of the file"
            }
          },
          required: ["old_file", "new_file"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "write_to_terminal": {
        const command = String(request.params.arguments?.command);
        
        if (USE_PYTHON_API) {
          let executor = new PythonCommandExecutor();
          const beforeCommandBuffer = await PythonTtyOutputReader.retrieveBuffer();
          const beforeCommandBufferLines = beforeCommandBuffer.split("\n").length;
          
          await executor.executeCommand(command);
          
          const afterCommandBuffer = await PythonTtyOutputReader.retrieveBuffer();
          const afterCommandBufferLines = afterCommandBuffer.split("\n").length;
          const outputLines = afterCommandBufferLines - beforeCommandBufferLines;
          
          return {
            content: [{
              type: "text",
              text: `${outputLines} lines were output after sending the command to the terminal. Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.`
            }]
          };
        } else {
          let executor = new CommandExecutor();
          const beforeCommandBuffer = await TtyOutputReader.retrieveBuffer();
          const beforeCommandBufferLines = beforeCommandBuffer.split("\n").length;
          
          await executor.executeCommand(command);
          
          const afterCommandBuffer = await TtyOutputReader.retrieveBuffer();
          const afterCommandBufferLines = afterCommandBuffer.split("\n").length;
          const outputLines = afterCommandBufferLines - beforeCommandBufferLines;
          
          return {
            content: [{
              type: "text",
              text: `${outputLines} lines were output after sending the command to the terminal. Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.`
            }]
          };
        }
      }

      case "read_terminal_output": {
        const linesOfOutput = Number(request.params.arguments?.linesOfOutput) || 25
        const output = USE_PYTHON_API 
          ? await PythonTtyOutputReader.call(linesOfOutput)
          : await TtyOutputReader.call(linesOfOutput);
        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      }

      case "send_control_character": {
        const letter = String(request.params.arguments?.letter);
        if (USE_PYTHON_API) {
          const ttyControl = new PythonSendControlCharacter();
          await ttyControl.send(letter);
        } else {
          const ttyControl = new SendControlCharacter();
          await ttyControl.send(letter);
        }
        return {
          content: [{
            type: "text",
            text: `Control character sent: Ctrl+${letter.toUpperCase()}`
          }]
        };
      }

      // File operation handlers
      case "write_file": {
        // Validate required parameters
        if (!request.params.arguments?.path) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'path' for write_file tool"
          );
        }
        
        if (!request.params.arguments?.content) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'content' for write_file tool"
          );
        }
        
        const path = String(request.params.arguments.path);
        const content = String(request.params.arguments.content);
        const mode = request.params.arguments?.mode as 'w' | 'a' || 'w';
        
        const result = await fileOps.writeFile(path, content, mode);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      case "write_file_with_diff": {
        // Validate required parameters
        if (!request.params.arguments?.path) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'path' for write_file_with_diff tool"
          );
        }
        
        if (!request.params.arguments?.content) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'content' for write_file_with_diff tool"
          );
        }
        
        const path = String(request.params.arguments.path);
        const content = String(request.params.arguments.content);
        const showDiff = request.params.arguments?.show_diff !== false;
        const result = await fileOps.writeFileWithDiff(path, content, showDiff);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      // Staging system handlers
      case "stage_changes": {
        // Validate required parameters
        if (!request.params.arguments?.path) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'path' for stage_changes tool"
          );
        }
        
        if (!request.params.arguments?.content) {
          throw new McpError(
            ErrorCode.InternalError,
            "Missing required parameter 'content' for stage_changes tool"
          );
        }
        
        const path = String(request.params.arguments.path);
        const content = String(request.params.arguments.content);
        const description = request.params.arguments?.description as string | undefined;
        const result = await fileOps.stageChanges(path, content, description || 'No description');
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      case "list_pending_changes": {
        const result = await fileOps.listPendingChanges();
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      case "preview_change": {
        const changeId = String(request.params.arguments?.change_id);
        const result = await fileOps.previewChange(changeId);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      case "apply_change": {
        const changeId = String(request.params.arguments?.change_id);
        const result = await fileOps.applyChange(changeId);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      case "reject_change": {
        const changeId = String(request.params.arguments?.change_id);
        const result = await fileOps.rejectChange(changeId);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      // Patch system handlers
      case "apply_patch": {
        const path = String(request.params.arguments?.path);
        const patch = String(request.params.arguments?.patch);
        const dryRun = request.params.arguments?.dry_run !== false;
        const result = await fileOps.applyPatch(path, patch, dryRun);
        
        if (dryRun) {
          return {
            content: [{
              type: "text",
              text: `Dry run analysis:\nSuccess: ${result.success}\nHunks: ${result.hunksApplied}/${result.hunksTotal}\nErrors: ${result.errors.join(', ')}\n\nPreview of changes:\n${result.content?.substring(0, 500)}${result.content && result.content.length > 500 ? '...' : ''}`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `Patch applied: ${result.success ? 'SUCCESS' : 'FAILED'}\nHunks applied: ${result.hunksApplied}/${result.hunksTotal}${result.errors.length > 0 ? '\nErrors: ' + result.errors.join(', ') : ''}`
            }]
          };
        }
      }

      case "validate_patch": {
        const patch = String(request.params.arguments?.patch);
        const result = await fileOps.validatePatch(patch);
        return {
          content: [{
            type: "text",
            text: `Patch validation:\nValid: ${result.isValid}\nAffected files: ${result.affectedFiles.join(', ')}\nErrors: ${result.errors.join(', ')}\nWarnings: ${result.warnings.join(', ')}`
          }]
        };
      }

      case "generate_patch": {
        const oldFile = String(request.params.arguments?.old_file);
        const newFile = String(request.params.arguments?.new_file);
        const result = await fileOps.generatePatchBetweenFiles(oldFile, newFile);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, errorMessage);
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iTerm MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});