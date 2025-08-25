import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, closeSync } from 'node:fs';
import ProcessTracker from './ProcessTracker.js';
import TtyOutputReader from './TtyOutputReader.js';

/**
 * PythonCommandExecutor handles sending commands to iTerm2 via the Python API.
 * 
 * This is a much faster alternative to AppleScript, using the iTerm2 Python API
 * through a bridge script. It provides the same functionality but with significantly
 * better performance.
 */

const execPromise = promisify(exec);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface PythonBridgeResponse {
  success: boolean;
  error?: string;
  content?: string;
  tty?: string;
  processing?: boolean;
}

class PythonCommandExecutor {
  private _execPromise: typeof execPromise;
  private _pythonPath: string;

  constructor(execPromiseOverride?: typeof execPromise) {
    this._execPromise = execPromiseOverride || execPromise;
    this._pythonPath = 'python3';
  }

  /**
   * Executes a command in the iTerm2 terminal using the Python API.
   * 
   * This method uses the Python bridge to send commands to iTerm2, which is
   * much faster than AppleScript. It handles both single-line and multiline commands
   * without the complex escaping required by AppleScript.
   * 
   * @param command The command to execute (can contain newlines)
   * @returns A promise that resolves to the terminal output after command execution
   */
  async executeCommand(command: string): Promise<string> {
    try {
      // Send the command using the Python bridge
      const writeResult = await this._callPythonBridge('write_text', command);
      if (!writeResult.success) {
        throw new Error(`Failed to write command: ${writeResult.error}`);
      }
      
      // Wait until iTerm2 reports that command processing is complete
      while (await this.isProcessing()) {
        await sleep(100);
      }
      
      // Get the TTY path and check if it's waiting for user input
      const ttyPath = await this.retrieveTtyPath();
      while (await this.isWaitingForUserInput(ttyPath) === false) {
        await sleep(100);
      }

      // Give a small delay for output to settle
      await sleep(200);
      
      // Retrieve the terminal output after command execution
      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer()
      return afterCommandBuffer
    } catch (error: unknown) {
      throw new Error(`Failed to execute command: ${(error as Error).message}`);
    }
  }

  async isWaitingForUserInput(ttyPath: string): Promise<boolean> {
    let fd;
    try {
      // Open the TTY file descriptor in non-blocking mode
      fd = openSync(ttyPath, 'r');
      const tracker = new ProcessTracker();
      let belowThresholdTime = 0;
      
      while (true) {
        try {
          const activeProcess = await tracker.getActiveProcess(ttyPath);
          
          if (!activeProcess) return true;

          if (activeProcess.metrics.totalCPUPercent < 1) {
            belowThresholdTime += 350;
            if (belowThresholdTime >= 1000) return true;
          } else {
            belowThresholdTime = 0;
          }

        } catch {
          return true;
        }

        await sleep(350);
      }
    } catch (error: unknown) {
      return true;
    } finally {
      if (fd !== undefined) {
        closeSync(fd);
      }
      return true;
    }
  }

  /**
   * Calls the Python bridge script with the given command and arguments.
   * 
   * @param command The command to execute (write_text, get_content, send_control, etc.)
   * @param arg Optional argument for the command
   * @returns A promise that resolves to the Python bridge response
   */
  private async _callPythonBridge(command: string, arg?: string): Promise<PythonBridgeResponse> {
    try {
      // Get the project root by going up from build/ to the project root
      const projectRoot = new URL('../', import.meta.url).pathname;
      const scriptPath = `${projectRoot}src/iterm2_bridge.py`;
      const venvPath = `${projectRoot}venv/bin/activate`;
      const cmd = arg 
        ? `source "${venvPath}" && ${this._pythonPath} "${scriptPath}" ${command} "${arg.replace(/"/g, '\\"')}"`
        : `source "${venvPath}" && ${this._pythonPath} "${scriptPath}" ${command}`;
      
      const { stdout } = await this._execPromise(cmd);
      return JSON.parse(stdout.trim());
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      return {
        success: false,
        error: `Python bridge call failed: ${errorMessage}`
      };
    }
  }

  private async retrieveTtyPath(): Promise<string> {
    try {
      const result = await this._callPythonBridge('get_tty');
      if (!result.success) {
        throw new Error(`Failed to retrieve TTY path: ${result.error}`);
      }
      return result.tty || '';
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve TTY path: ${(error as Error).message}`);
    }
  }

  private async isProcessing(): Promise<boolean> {
    try {
      const result = await this._callPythonBridge('is_processing');
      if (!result.success) {
        throw new Error(`Failed to check processing status: ${result.error}`);
      }
      return result.processing || false;
    } catch (error: unknown) {
      throw new Error(`Failed to check processing status: ${(error as Error).message}`);
    }
  }
}

export default PythonCommandExecutor; 