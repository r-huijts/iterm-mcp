import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

interface PythonBridgeResponse {
  success: boolean;
  error?: string;
}

/**
 * PythonSendControlCharacter sends control characters using the iTerm2 Python API.
 * 
 * This is a much faster alternative to AppleScript for sending control characters.
 * It uses the Python bridge to send control codes directly to iTerm2.
 */

class PythonSendControlCharacter {
  private _execPromise: typeof execPromise;
  private _pythonPath: string;

  constructor(execPromiseOverride?: typeof execPromise) {
    this._execPromise = execPromiseOverride || execPromise;
    this._pythonPath = 'python3';
  }

  // This method is added for testing purposes
  protected async executeCommand(command: string): Promise<void> {
    await this._execPromise(command);
  }

  async send(letter: string): Promise<void> {
    // Validate input for standard control characters
    const validChars = ['c', 'z', 'd', 'l', ']', 'escape', 'esc'];
    const letterLower = letter.toLowerCase();
    
    if (!validChars.includes(letterLower)) {
      throw new Error('Invalid control character letter');
    }

    try {
      const result = await this._callPythonBridge('send_control', letterLower);
      if (!result.success) {
        throw new Error(`Failed to send control character: ${result.error}`);
      }
    } catch (error: unknown) {
      throw new Error(`Failed to send control character: ${(error as Error).message}`);
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

export default PythonSendControlCharacter; 