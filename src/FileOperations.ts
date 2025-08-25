import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { diffLines, createTwoFilesPatch, parsePatch, reversePatch, applyPatch } from 'diff';
import { PatchProcessor, PatchResult } from './PatchProcessor.js';

export interface FileChange {
  id: string;
  path: string;
  originalContent: string;
  newContent: string;
  diff: string;
  reversePatch?: string; // NEW: Store the reverse patch for undo
  timestamp: Date;
  description?: string;
}

export interface AppliedChange {
  id: string;
  path: string;
  reversePatch: string;
  timestamp: Date;
  description?: string;
}

export default class FileOperations {
  private pendingChanges: Map<string, FileChange> = new Map();
  private appliedChanges: Map<string, AppliedChange> = new Map(); // NEW: Track applied changes
  private pendingDir: string;
  private appliedDir: string; // NEW: Directory for applied changes
  private allowedDirectories: string[] = [];

  constructor() {
    // Initialize allowed directories from environment
    this.initializeAllowedDirectories();
    // Set pendingDir to be in the first allowed directory to avoid path issues
    this.pendingDir = path.join(this.allowedDirectories[0], '.pending');
    this.appliedDir = path.join(this.allowedDirectories[0], '.applied'); // NEW
    // Ensure directories exist (only pending now!)
    this.ensureDirectories();
  }

  /**
   * Initialize allowed directories from environment variable
   */
  private initializeAllowedDirectories(): void {
    const envDirs = process.env.ALLOWED_DIRECTORIES;
    if (envDirs) {
      try {
        // Try to parse as JSON array first
        this.allowedDirectories = JSON.parse(envDirs);
      } catch {
        // Fallback to comma-separated string
        this.allowedDirectories = envDirs.split(',').map(dir => dir.trim());
      }
    } else {
      // Default to current working directory if no allowed directories specified
      this.allowedDirectories = [process.cwd()];
    }

    // Resolve all paths to absolute paths
    this.allowedDirectories = this.allowedDirectories.map(dir => path.resolve(dir));
    
    console.error(`[FileOperations] Initialized with allowed directories: ${this.allowedDirectories.join(', ')}`);
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.pendingDir, { recursive: true });
      await fs.mkdir(this.appliedDir, { recursive: true }); // NEW
      console.error(`[FileOperations] Ensured directories exist: ${this.pendingDir}, ${this.appliedDir}`);
    } catch (error) {
      console.error(`[FileOperations] Error creating directories: ${error}`);
    }
  }

  /**
   * Validate that a file path is within allowed directories
   */
  private validatePath(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    return this.allowedDirectories.some(allowedDir => 
      resolvedPath.startsWith(allowedDir + path.sep) || resolvedPath === allowedDir
    );
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string, mode: 'w' | 'a' = 'w'): Promise<void> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    if (mode === 'a') {
      await fs.appendFile(resolvedPath, content, 'utf8');
    } else {
      await fs.writeFile(resolvedPath, content, 'utf8');
    }
  }

  /**
   * Write file with diff preview
   */
  async writeFileWithDiff(filePath: string, content: string, showDiff: boolean = true): Promise<string> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    let result = "File updated successfully.";
    
    if (showDiff) {
      try {
        // Read existing content
        const existingContent = await fs.readFile(resolvedPath, 'utf8');
        
        // Generate diff
        const diff = createTwoFilesPatch(
          filePath,
          filePath,
          existingContent,
          content
        );
        
        result += "\n\n" + diff;
      } catch (error) {
        // File doesn't exist, it's a new file
        result = "New file created.";
      }
    }
    
    // Write the file
    await this.writeFile(filePath, content);
    
    return result;
  }

  /**
   * Stage changes for human review
   */
  async stageChanges(filePath: string, content: string, description: string): Promise<string> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    let originalContent = '';
    
    // Read existing content if file exists
    try {
      originalContent = await fs.readFile(resolvedPath, 'utf8');
    } catch (error) {
      // File doesn't exist, treat as empty
      originalContent = '';
    }

    // Generate change ID
    const changeId = Math.random().toString(36).substring(2, 10);
    
    // Create forward diff
    const diff = createTwoFilesPatch(
      filePath,
      filePath,
      originalContent,
      content
    );

    // NEW: Create reverse patch for undo functionality
    let reversePatch = '';
    try {
      // Create reverse patch by swapping old and new content
      reversePatch = createTwoFilesPatch(
        filePath,
        filePath,
        content,
        originalContent
      );
    } catch (error) {
      console.error(`[FileOperations] Error creating reverse patch: ${error}`);
    }

    // Create change object
    const change: FileChange = {
      id: changeId,
      path: resolvedPath,
      originalContent,
      newContent: content,
      diff,
      reversePatch, // NEW
      timestamp: new Date(),
      description
    };

    // Store in memory
    this.pendingChanges.set(changeId, change);

    // Also store to disk for persistence
    try {
      await fs.writeFile(
        path.join(this.pendingDir, `${changeId}.json`),
        JSON.stringify(change, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error(`[FileOperations] Error saving staged change to disk: ${error}`);
      // Continue anyway since we have it in memory
    }

    return changeId;
  }

  /**
   * List all pending changes
   */
  async listPendingChanges(): Promise<string> {
    if (this.pendingChanges.size === 0) {
      return "No pending changes.";
    }

    let result = "Pending changes:\n";
    for (const [id, change] of this.pendingChanges) {
      const timeStr = change.timestamp.toLocaleString();
      result += `${id}: ${change.path} (${timeStr}) - ${change.description || 'No description'}\n`;
    }
    
    return result.trim();
  }

  /**
   * List all applied changes that can be undone
   */
  async listAppliedChanges(): Promise<string> {
    if (this.appliedChanges.size === 0) {
      return "No applied changes available for undo.";
    }

    let result = "Applied changes (available for undo):\n";
    // Sort by timestamp, most recent first
    const sortedChanges = Array.from(this.appliedChanges.entries())
      .sort(([,a], [,b]) => b.timestamp.getTime() - a.timestamp.getTime());
    
    for (const [id, change] of sortedChanges) {
      const timeStr = change.timestamp.toLocaleString();
      result += `${id}: ${change.path} (${timeStr}) - ${change.description || 'No description'}\n`;
    }
    
    return result.trim();
  }

  /**
   * Preview a staged change
   */
  async previewChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    return `Change ${changeId}: ${change.path}\n${change.description || 'No description'}\n\nDiff:\n${change.diff}`;
  }

  /**
   * Apply a staged change and store reverse patch for undo
   */
  async applyChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    // Write the new content
    await this.writeFile(change.path, change.newContent);

    // NEW: Store applied change with reverse patch for undo
    if (change.reversePatch) {
      const appliedChange: AppliedChange = {
        id: changeId,
        path: change.path,
        reversePatch: change.reversePatch,
        timestamp: new Date(),
        description: change.description
      };

      this.appliedChanges.set(changeId, appliedChange);

      // Save applied change to disk
      try {
        await fs.writeFile(
          path.join(this.appliedDir, `${changeId}.json`),
          JSON.stringify(appliedChange, null, 2),
          'utf8'
        );
      } catch (error) {
        console.error(`[FileOperations] Error saving applied change to disk: ${error}`);
      }
    }

    // Remove from pending
    this.pendingChanges.delete(changeId);
    await fs.unlink(path.join(this.pendingDir, `${changeId}.json`)).catch(() => {});

    return `Change ${changeId} applied successfully to ${change.path}`;
  }

  /**
   * NEW: Undo an applied change using stored reverse patch
   */
  async undoChange(changeId: string): Promise<string> {
    const appliedChange = this.appliedChanges.get(changeId);
    if (!appliedChange) {
      throw new Error(`Applied change ${changeId} not found or cannot be undone`);
    }

    try {
      // Read current file content
      const currentContent = await fs.readFile(appliedChange.path, 'utf8');
      
      // Apply the reverse patch
      const undoResult = applyPatch(currentContent, appliedChange.reversePatch);
      
      if (undoResult === false) {
        throw new Error(`Failed to apply reverse patch - file may have been modified since the change was applied`);
      }

      // Write the undone content
      await fs.writeFile(appliedChange.path, undoResult, 'utf8');

      // Remove from applied changes
      this.appliedChanges.delete(changeId);
      await fs.unlink(path.join(this.appliedDir, `${changeId}.json`)).catch(() => {});

      return `Change ${changeId} successfully undone. File ${appliedChange.path} reverted to previous state.`;

    } catch (error) {
      throw new Error(`Failed to undo change ${changeId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reject a staged change
   */
  async rejectChange(changeId: string): Promise<string> {
    const change = this.pendingChanges.get(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    // Remove from pending
    this.pendingChanges.delete(changeId);
    await fs.unlink(path.join(this.pendingDir, `${changeId}.json`)).catch(() => {});

    return `Change ${changeId} rejected and removed.`;
  }

  /**
   * Apply a patch to a file using the PatchProcessor (no backup!)
   */
  async applyPatch(filePath: string, patchContent: string, dryRun: boolean = false): Promise<PatchResult> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    return await PatchProcessor.applyPatch(filePath, patchContent, dryRun);
  }

  /**
   * Validate a patch without applying it
   */
  async validatePatch(patchContent: string): Promise<{ isValid: boolean; affectedFiles: string[]; errors: string[]; warnings: string[] }> {
    try {
      const result = PatchProcessor.validatePatch(patchContent);
      return result;
    } catch (error) {
      return {
        isValid: false,
        affectedFiles: [],
        errors: [(error as Error).message],
        warnings: []
      };
    }
  }

  /**
   * Generate a patch between two files
   */
  async generatePatchBetweenFiles(oldFile: string, newFile: string): Promise<string> {
    if (!this.validatePath(oldFile) || !this.validatePath(newFile)) {
      throw new Error(`Access denied: Paths must be within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    try {
      const oldContent = await this.readFile(oldFile);
      const newContent = await this.readFile(newFile);
      
      // Simple diff implementation
      const diff = require('diff');
      const patch = diff.createPatch(
        path.basename(oldFile),
        oldContent,
        newContent,
        'old',
        'new'
      );
      
      return patch;
    } catch (error) {
      throw new Error(`Failed to generate patch: ${(error as Error).message}`);
    }
  }

  /**
   * Copy a file
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    if (!this.validatePath(sourcePath) || !this.validatePath(destinationPath)) {
      throw new Error(`Access denied: Paths must be within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedSource = path.resolve(sourcePath);
    const resolvedDest = path.resolve(destinationPath);
    const destDir = path.dirname(resolvedDest);
    
    // Ensure destination directory exists
    await fs.mkdir(destDir, { recursive: true });
    
    // Use streams for efficient copying
    await pipeline(
      createReadStream(resolvedSource),
      createWriteStream(resolvedDest)
    );
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    await fs.unlink(resolvedPath);
  }

  /**
   * Read a file
   */
  async readFile(filePath: string): Promise<string> {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    return await fs.readFile(resolvedPath, 'utf8');
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    if (!this.validatePath(filePath)) {
      return false;
    }

    try {
      const resolvedPath = path.resolve(filePath);
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath: string) {
    if (!this.validatePath(filePath)) {
      throw new Error(`Access denied: Path '${filePath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(filePath);
    return await fs.stat(resolvedPath);
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    if (!this.validatePath(dirPath)) {
      throw new Error(`Access denied: Path '${dirPath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(dirPath);
    return await fs.readdir(resolvedPath);
  }

  /**
   * Create a directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    if (!this.validatePath(dirPath)) {
      throw new Error(`Access denied: Path '${dirPath}' is not within allowed directories: ${this.allowedDirectories.join(', ')}`);
    }

    const resolvedPath = path.resolve(dirPath);
    await fs.mkdir(resolvedPath, { recursive: true });
  }
}