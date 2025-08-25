import { parsePatch, applyPatch as diffApplyPatch, applyPatches } from 'diff';

export interface PatchResult {
  success: boolean;
  content?: string;
  errors: string[];
  warnings: string[];
  hunksApplied: number;
  hunksTotal: number;
}

export interface PatchValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  affectedFiles: string[];
}

/**
 * Advanced patch processing with comprehensive error handling and validation
 */
export class PatchProcessor {
  /**
   * Validate a patch without applying it
   */
  static validatePatch(patchContent: string): PatchValidationResult {
    const result: PatchValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      affectedFiles: []
    };

    try {
      const patches = parsePatch(patchContent);
      
      if (patches.length === 0) {
        result.isValid = false;
        result.errors.push('No valid patches found in the provided content');
        return result;
      }

      for (const patch of patches) {
        // Extract file paths
        if (patch.oldFileName) {
          result.affectedFiles.push(patch.oldFileName);
        }
        if (patch.newFileName && patch.newFileName !== patch.oldFileName) {
          result.affectedFiles.push(patch.newFileName);
        }

        // Validate hunks
        if (!patch.hunks || patch.hunks.length === 0) {
          result.warnings.push(`Patch for ${patch.oldFileName || 'unknown file'} contains no hunks`);
          continue;
        }

        // Check for malformed hunks
        for (const hunk of patch.hunks) {
          if (!hunk.lines || hunk.lines.length === 0) {
            result.warnings.push(`Empty hunk found in ${patch.oldFileName || 'unknown file'}`);
          }
          
          // Validate hunk header
          if (hunk.oldStart < 0 || hunk.newStart < 0) {
            result.errors.push(`Invalid hunk header in ${patch.oldFileName || 'unknown file'}: negative line numbers`);
            result.isValid = false;
          }
        }
      }

      // Remove duplicates from affected files
      result.affectedFiles = [...new Set(result.affectedFiles)];

    } catch (error: any) {
      result.isValid = false;
      result.errors.push(`Failed to parse patch: ${error.message}`);
    }

    return result;
  }

  /**
   * Apply a patch to content with detailed result information
   */
  static applyPatchToContent(originalContent: string, patchContent: string): PatchResult {
    const result: PatchResult = {
      success: false,
      errors: [],
      warnings: [],
      hunksApplied: 0,
      hunksTotal: 0
    };

    try {
      // First validate the patch
      const validation = this.validatePatch(patchContent);
      if (!validation.isValid) {
        result.errors = validation.errors;
        return result;
      }

      // Parse the patch
      const patches = parsePatch(patchContent);
      
      if (patches.length === 0) {
        result.errors.push('No patches found to apply');
        return result;
      }

      if (patches.length > 1) {
        result.warnings.push(`Multiple patches found (${patches.length}), only applying the first one`);
      }

      const patch = patches[0];
      result.hunksTotal = patch.hunks?.length || 0;

      // Apply the patch
      const patchResult = diffApplyPatch(originalContent, patch);
      
      if (patchResult === false) {
        result.errors.push('Patch application failed - content may have changed or patch may be malformed');
        return result;
      }

      result.success = true;
      result.content = patchResult as string;
      result.hunksApplied = result.hunksTotal; // If successful, all hunks were applied

    } catch (error: any) {
      result.errors.push(`Patch application error: ${error.message}`);
    }

    return result;
  }

  /**
   * Create a human-readable summary of what a patch would do
   */
  static analyzePatch(patchContent: string): string {
    try {
      const validation = this.validatePatch(patchContent);
      
      if (!validation.isValid) {
        return `❌ Invalid patch:\n${validation.errors.join('\n')}`;
      }

      const patches = parsePatch(patchContent);
      const summary: string[] = [];

      summary.push(`📋 Patch Analysis:`);
      summary.push(`Files affected: ${validation.affectedFiles.length}`);

      for (const patch of patches) {
        const fileName = patch.newFileName || patch.oldFileName || 'unknown';
        summary.push(`\n📄 File: ${fileName}`);
        
        if (patch.hunks) {
          summary.push(`   Hunks: ${patch.hunks.length}`);
          
          let linesAdded = 0;
          let linesRemoved = 0;
          
          for (const hunk of patch.hunks) {
            for (const line of hunk.lines || []) {
              if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
              if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++;
            }
          }
          
          summary.push(`   Changes: +${linesAdded} -${linesRemoved}`);
          
          // Show hunk locations
          for (const hunk of patch.hunks) {
            summary.push(`   📍 @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
          }
        }
      }

      if (validation.warnings.length > 0) {
        summary.push(`\n⚠️  Warnings:`);
        validation.warnings.forEach(warning => summary.push(`   ${warning}`));
      }

      return summary.join('\n');

    } catch (error: any) {
      return `❌ Error analyzing patch: ${error.message}`;
    }
  }

  /**
   * Generate a patch between two content strings
   */
  static createPatch(oldContent: string, newContent: string, fileName: string = 'file'): string {
    const { createTwoFilesPatch } = require('diff');
    
    return createTwoFilesPatch(
      `a/${fileName}`,
      `b/${fileName}`,
      oldContent,
      newContent,
      undefined,
      undefined,
      { context: 3 }
    );
  }

  /**
   * Check if patch would apply cleanly without actually applying it
   */
  static canApplyPatch(originalContent: string, patchContent: string): boolean {
    try {
      const result = this.applyPatchToContent(originalContent, patchContent);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Extract file paths from a patch
   */
  static extractFilePaths(patchContent: string): string[] {
    try {
      const validation = this.validatePatch(patchContent);
      return validation.affectedFiles;
    } catch {
      return [];
    }
  }

  /**
   * Apply a patch to a file
   */
  static async applyPatch(filePath: string, patchContent: string, dryRun: boolean = false): Promise<PatchResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      // Read the original file
      const originalContent = await fs.readFile(filePath, 'utf8');
      
      if (dryRun) {
        // Just validate and analyze without applying
        const validation = this.validatePatch(patchContent);
        const analysis = this.analyzePatch(patchContent);
        
        return {
          success: validation.isValid,
          content: analysis,
          errors: validation.errors,
          warnings: validation.warnings,
          hunksApplied: 0,
          hunksTotal: 0
        };
      }
      
      // Apply the patch
      const result = this.applyPatchToContent(originalContent, patchContent);
      
      if (result.success && result.content) {
        // Write the modified content back to the file
        await fs.writeFile(filePath, result.content, 'utf8');
      }
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        errors: [`Failed to apply patch: ${error.message}`],
        warnings: [],
        hunksApplied: 0,
        hunksTotal: 0
      };
    }
  }
}
