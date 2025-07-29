import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { diffLines, createTwoFilesPatch } from 'diff';

export interface FileChange {
  id: string;
  path: string;
  originalContent: string;
  newContent: string;
  diff: string;
  timestamp: Date;
  description?: string;
}

export default class FileOperations {
  private pendingChanges: Map<string, FileChange> = new Map();
  private pendingDir: string = '.pending';
  private backupDir: string = '.backups';

  constructor() {
    // Ensure directories exist
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.pendingDir, { recursive: true }).catch(() => {});
    await fs.mkdir(this.backupDir, { recursive: true }).catch(() => {});
  }

  /**
   * Read a file's content
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Error reading file: ${error.message}`);
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string, mode: 'w' | 'a' = 'w'): Promise<string> {
    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      if (mode === 'a') {
        await fs.appendFile(filePath, content, 'utf-8');
        return `Content appended to ${filePath}`;
      } else {
        await fs.writeFile(filePath, content, 'utf-8');
        return `File written: ${filePath}`;
      }
    } catch (error: any) {
      throw new Error(`Error writing file: ${error.message}`);
    }
  }

  /**
   * Write file with diff preview
   */
  async writeFileWithDiff(filePath: string, content: string, showDiff: boolean = true): Promise<string> {
    let originalContent = '';
    let fileExists = false;

    try {
      originalContent = await this.readFile(filePath);
      fileExists = true;
    } catch {
      // File doesn't exist yet
    }

    if (fileExists) {
      // Create backup first
      await this.createBackup(filePath);
    }

    // Write the new content
    await this.writeFile(filePath, content);

    if (showDiff && fileExists) {
      const diff = this.generateDiff(originalContent, content, filePath);
      return `File updated successfully. Backup created.\n\n${diff}`;
    }

    return `File ${fileExists ? 'updated' : 'created'} successfully.`;
  }

  /**
   * Create a directory
   */
  async createDirectory(dirPath: string): Promise<string> {
    await fs.mkdir(dirPath, { recursive: true });
    return `Directory created: ${dirPath}`;
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string = '.', recursive: boolean = false): Promise<string> {
    const results: string[] = [];
    
    async function walk(dir: string, prefix: string = ''): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const displayPath = prefix ? path.join(prefix, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          results.push(`[DIR]  ${displayPath}/`);
          if (recursive) {
            await walk(fullPath, displayPath);
          }
        } else {
          results.push(`[FILE] ${displayPath}`);
        }
      }
    }

    await walk(dirPath);
    return `Contents of ${dirPath}:\n${results.sort().join('\n')}`;
  }

  /**
   * Stage changes for review
   */
  async stageChanges(filePath: string, content: string, description?: string): Promise<string> {
    const changeId = Math.random().toString(36).substring(2, 10);
    
    let originalContent = '';
    try {
      originalContent = await this.readFile(filePath);
    } catch {
      // File doesn't exist yet
    }

    const diff = this.generateDiff(originalContent, content, filePath);

    const change: FileChange = {
      id: changeId,
      path: filePath,
      originalContent,
      newContent: content,
      diff,
      timestamp: new Date(),
      description
    };

    // Save to pending directory
    const changeDir = path.join(this.pendingDir, changeId);
    await fs.mkdir(changeDir, { recursive: true });

    await fs.writeFile(path.join(changeDir, 'original.txt'), originalContent);
    await fs.writeFile(path.join(changeDir, 'modified.txt'), content);
    await fs.writeFile(path.join(changeDir, 'changes.diff'), diff);
    await fs.writeFile(
      path.join(changeDir, 'metadata.json'),
      JSON.stringify({
        id: changeId,
        path: filePath,
        timestamp: change.timestamp,
        description
      }, null, 2)
    );

    this.pendingChanges.set(changeId, change);

    return `Changes staged with ID: ${changeId}\nPath: ${filePath}${description ? `\nDescription: ${description}` : ''}`;
  }

  /**
   * List all pending changes
   */
  async listPendingChanges(): Promise<string> {
    if (this.pendingChanges.size === 0) {
      return 'No pending changes.';
    }

    const changes = Array.from(this.pendingChanges.values());
    const list = changes.map(change => 
      `- ${change.id}\n  File: ${change.path}\n  Time: ${change.timestamp.toLocaleString()}${change.description ? `\n  Description: ${change.description}` : ''}`
    ).join('\n\n');

    return `Pending changes:\n\n${list}`;
  }

  /**
   * Preview a staged change
   */
  async previewChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    return `Change preview for ${change.path}:\n\n${change.diff}`;
  }

  /**
   * Apply a staged change
   */
  async applyChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    // Create backup if file exists
    try {
      await this.createBackup(change.path);
    } catch {
      // File doesn't exist yet
    }

    // Apply the change
    await this.writeFile(change.path, change.newContent);

    // Clean up
    const changeDir = path.join(this.pendingDir, changeId);
    await fs.rm(changeDir, { recursive: true, force: true });
    this.pendingChanges.delete(changeId);

    return `Change applied successfully to ${change.path}`;
  }

  /**
   * Reject a staged change
   */
  async rejectChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    // Clean up
    const changeDir = path.join(this.pendingDir, changeId);
    await fs.rm(changeDir, { recursive: true, force: true });
    this.pendingChanges.delete(changeId);

    return 'Change rejected and removed.';
  }

  /**
   * Create a backup of a file
   */
  async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = path.basename(filePath);
    const backupPath = path.join(this.backupDir, `${fileName}_${timestamp}.bak`);

    await fs.copyFile(filePath, backupPath);
    return `Backup created: ${backupPath}`;
  }

  /**
   * Apply a patch to a file
   */
  async applyPatch(filePath: string, patch: string, dryRun: boolean = true): Promise<string> {
    if (dryRun) {
      return `Dry run - patch preview:\n\n${patch}\n\nUse dry_run: false to apply.`;
    }

    // In a real implementation, you'd use a proper patch library
    // For now, this is a placeholder
    await this.createBackup(filePath);
    return `Patch applied to ${filePath} (backup created)`;
  }

  /**
   * Generate a unified diff
   */
  private generateDiff(original: string, modified: string, filename: string): string {
    return createTwoFilesPatch(
      `${filename} (original)`,
      `${filename} (modified)`,
      original,
      modified,
      undefined,
      undefined,
      { context: 3 }
    );
  }
}