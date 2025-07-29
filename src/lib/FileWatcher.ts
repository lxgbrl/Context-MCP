import chokidar from 'chokidar';
import path from 'path';
import { DocumentProcessor } from './DocumentProcessor.js';
import { DocumentStore } from './DocumentStore.js';
import { SearchIndex } from './SearchIndex.js';
import { OperationResult } from '../types/index.js';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private watchPaths: string[] = [];
  private processor: DocumentProcessor;
  private documentStore: DocumentStore;
  private searchIndex: SearchIndex;
  private isWatching = false;

  constructor(
    processor: DocumentProcessor,
    documentStore: DocumentStore,
    searchIndex: SearchIndex
  ) {
    this.processor = processor;
    this.documentStore = documentStore;
    this.searchIndex = searchIndex;
  }

  /**
   * Start watching directories for file changes
   */
  async startWatching(directories: string[]): Promise<OperationResult<void>> {
    try {
      if (this.isWatching) {
        await this.stopWatching();
      }

      this.watchPaths = directories.filter(dir => dir && dir.trim());
      
      if (this.watchPaths.length === 0) {
        console.error('No valid watch directories provided');
        return { success: true, data: undefined }; // Not an error, just nothing to watch
      }

      // Get supported extensions for filtering
      const supportedExtensions = this.processor.getSupportedExtensions();
      const globPattern = supportedExtensions.length > 1 
        ? `**/*.{${supportedExtensions.map(ext => ext.replace('.', '')).join(',')}}` 
        : `**/*${supportedExtensions[0]}`;

      console.error(`Starting file watcher for directories: ${this.watchPaths.join(', ')}`);
      console.error(`Watching for files: ${globPattern}`);

      this.watcher = chokidar.watch(this.watchPaths, {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.DS_Store',
          '**/Thumbs.db',
          '**/*.tmp',
          '**/*.temp'
        ],
        persistent: true,
        ignoreInitial: false, // Process existing files on startup
        followSymlinks: false,
        depth: 10, // Reasonable depth limit
        awaitWriteFinish: {
          stabilityThreshold: 1000, // Wait 1s for file to stabilize
          pollInterval: 100
        }
      });

      // Set up event handlers
      this.watcher
        .on('add', (filePath) => this.handleFileAdded(filePath))
        .on('change', (filePath) => this.handleFileChanged(filePath))
        .on('unlink', (filePath) => this.handleFileDeleted(filePath))
        .on('error', (error) => {
          console.error(`File watcher error: ${error.message}`);
        })
        .on('ready', () => {
          console.error('File watcher initialized and ready');
        });

      this.isWatching = true;
      return { success: true, data: undefined };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to start file watcher: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Stop watching directories
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.isWatching = false;
    console.error('File watcher stopped');
  }

  /**
   * Get current watching status
   */
  getStatus(): { isWatching: boolean; watchPaths: string[] } {
    return {
      isWatching: this.isWatching,
      watchPaths: [...this.watchPaths]
    };
  }

  /**
   * Handle new file added
   */
  private async handleFileAdded(filePath: string): Promise<void> {
    try {
      // Check if file type is supported
      if (!this.processor.isSupported(filePath)) {
        return; // Silently ignore unsupported files
      }

      console.error(`New file detected: ${filePath}`);
      
      // Check if document already exists by path
      const existingDoc = await this.documentStore.getDocumentByPath(filePath);
      if (existingDoc.success && existingDoc.data) {
        console.error(`Document already indexed: ${filePath}, skipping`);
        return;
      }

      // Process the file
      const processResult = await this.processor.processFile(filePath);
      if (!processResult.success) {
        console.error(`Failed to process file ${filePath}: ${processResult.error}`);
        return;
      }

      const { content, type, metadata } = processResult.data!;
      
      // Add to document store
      const addResult = await this.documentStore.addDocument(
        filePath,
        content,
        type,
        metadata
      );

      if (!addResult.success) {
        console.error(`Failed to add document ${filePath}: ${addResult.error}`);
        return;
      }

      const doc = addResult.data!;
      
      // Add to search index
      const indexResult = await this.searchIndex.addDocument(doc);
      if (!indexResult.success) {
        console.error(`Failed to index document ${filePath}: ${indexResult.error}`);
      } else {
        console.error(`Successfully indexed: ${doc.title} (${doc.id})`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error handling file addition ${filePath}: ${message}`);
    }
  }

  /**
   * Handle file changed
   */
  private async handleFileChanged(filePath: string): Promise<void> {
    try {
      // Check if file type is supported
      if (!this.processor.isSupported(filePath)) {
        return;
      }

      console.error(`File changed: ${filePath}`);
      
      // Get existing document
      const existingDoc = await this.documentStore.getDocumentByPath(filePath);
      if (!existingDoc.success || !existingDoc.data) {
        // File not in index, treat as new file
        await this.handleFileAdded(filePath);
        return;
      }

      // Process the updated file
      const processResult = await this.processor.processFile(filePath);
      if (!processResult.success) {
        console.error(`Failed to process updated file ${filePath}: ${processResult.error}`);
        return;
      }

      const { content, type, metadata } = processResult.data!;
      const doc = existingDoc.data;
      
      // Update document in store
      const updateResult = await this.documentStore.updateDocument(doc.id, {
        content,
        metadata: {
          ...doc.metadata,
          ...metadata,
          updatedAt: new Date().toISOString()
        }
      });

      if (!updateResult.success) {
        console.error(`Failed to update document ${filePath}: ${updateResult.error}`);
        return;
      }

      const updatedDoc = updateResult.data!;
      
      // Update search index
      const indexResult = await this.searchIndex.updateDocument(updatedDoc);
      if (!indexResult.success) {
        console.error(`Failed to update index for ${filePath}: ${indexResult.error}`);
      } else {
        console.error(`Successfully updated: ${updatedDoc.title} (${updatedDoc.id})`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error handling file change ${filePath}: ${message}`);
    }
  }

  /**
   * Handle file deleted
   */
  private async handleFileDeleted(filePath: string): Promise<void> {
    try {
      console.error(`File deleted: ${filePath}`);
      
      // Find document by path
      const existingDoc = await this.documentStore.getDocumentByPath(filePath);
      if (!existingDoc.success || !existingDoc.data) {
        return; // Document not in index
      }

      const doc = existingDoc.data;
      
      // Remove from document store
      const deleteResult = await this.documentStore.deleteDocument(doc.id);
      if (!deleteResult.success) {
        console.error(`Failed to delete document ${filePath}: ${deleteResult.error}`);
        return;
      }
      
      // Remove from search index
      const indexResult = await this.searchIndex.removeDocument(doc.id);
      if (!indexResult.success) {
        console.error(`Failed to remove from index ${filePath}: ${indexResult.error}`);
      } else {
        console.error(`Successfully removed: ${doc.title} (${doc.id})`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error handling file deletion ${filePath}: ${message}`);
    }
  }
}