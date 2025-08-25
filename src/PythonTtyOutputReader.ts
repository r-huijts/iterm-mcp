import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

interface PythonBridgeResponse {
  success: boolean;
  error?: string;
  content?: string;
}

/**
 * PythonTtyOutputReader reads terminal output using the iTerm2 Python API.
 * 
 * This is a much faster alternative to AppleScript for reading terminal content.
 * It uses the Python bridge to get screen contents directly from iTerm2.
 */

export default class PythonTtyOutputReader {
  private _execPromise: typeof execPromise;
  private _pythonPath: string;

  constructor(execPromiseOverride?: typeof execPromise) {
    this._execPromise = execPromiseOverride || execPromise;
    this._pythonPath = 'python3';
  }

  static async call(linesOfOutput?: number) {
    const reader = new PythonTtyOutputReader();
    const buffer = await reader.retrieveBuffer();
    if (!linesOfOutput) {
      return buffer;
    }
    const lines = buffer.split('\n');
    return lines.slice(-linesOfOutput - 1).join('\n');
  }

  static async retrieveBuffer(): Promise<string> {
    const reader = new PythonTtyOutputReader();
    return await reader.retrieveBuffer();
  }

  async retrieveBuffer(): Promise<string> {
    try {
      const result = await this._callPythonBridge('get_content');
      if (!result.success) {
        throw new Error(`Failed to retrieve buffer: ${result.error}`);
      }
      return result.content || '';
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve buffer: ${(error as Error).message}`);
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
} 