import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { Document, DocumentSummary, OperationResult } from '../types/index.js';

export class DocumentStore {
  private basePath: string;
  private metadataPath: string;
  private metadata: Map<string, Document> = new Map();

  constructor(basePath: string = './data') {
    this.basePath = basePath;
    this.metadataPath = path.join(basePath, 'metadata', 'documents.json');
  }

  async initialize(): Promise<OperationResult> {
    try {
      // Ensure directories exist
      await fs.mkdir(path.join(this.basePath, 'documents'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'metadata'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'index'), { recursive: true });

      // Load existing metadata
      await this.loadMetadata();

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`DocumentStore initialization failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(this.metadataPath, 'utf-8');
      const documents = JSON.parse(data) as Document[];
      
      // Validate and load documents
      documents.forEach(doc => {
        if (this.validateDocument(doc)) {
          this.metadata.set(doc.id, doc);
        } else {
          console.error(`Invalid document found in metadata: ${(doc as any)?.id || 'unknown'}`);
        }
      });
      
      console.error(`Loaded ${this.metadata.size} documents from metadata`);
    } catch (error) {
      // File doesn't exist yet or is corrupted, start fresh
      console.error('No existing metadata found, starting with empty store');
      this.metadata = new Map();
    }
  }

  private validateDocument(doc: any): doc is Document {
    return (
      doc &&
      typeof doc.id === 'string' &&
      typeof doc.title === 'string' &&
      typeof doc.content === 'string' &&
      typeof doc.path === 'string' &&
      typeof doc.type === 'string' &&
      doc.metadata &&
      typeof doc.metadata.createdAt === 'string' &&
      typeof doc.metadata.updatedAt === 'string' &&
      typeof doc.metadata.size === 'number'
    );
  }

  private async saveMetadata(): Promise<void> {
    try {
      const documents = Array.from(this.metadata.values());
      await fs.writeFile(
        this.metadataPath,
        JSON.stringify(documents, null, 2),
        'utf-8'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to save metadata: ${message}`);
      throw error;
    }
  }

  async addDocument(
    filePath: string,
    content: string,
    type: Document['type'],
    metadata?: Partial<Document['metadata']>
  ): Promise<OperationResult<Document>> {
    try {
      const id = nanoid();
      const filename = path.basename(filePath);
      
      const doc: Document = {
        id,
        title: metadata?.tags?.[0] || filename,
        content,
        path: filePath,
        type,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          size: Buffer.byteLength(content, 'utf8'),
          wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
          charCount: content.length,
          ...metadata
        }
      };

      // Save document content to file
      const docPath = path.join(this.basePath, 'documents', `${id}.json`);
      await fs.writeFile(docPath, JSON.stringify(doc, null, 2), 'utf-8');

      // Update in-memory metadata
      this.metadata.set(id, doc);
      
      // Save metadata index
      await this.saveMetadata();

      console.error(`Document added: ${id} (${doc.title})`);
      return { success: true, data: doc };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to add document: ${message}`);
      return { success: false, error: message };
    }
  }

  async getDocument(id: string): Promise<OperationResult<Document>> {
    try {
      const doc = this.metadata.get(id);
      if (!doc) {
        return { success: false, error: `Document not found: ${id}` };
      }

      // Optionally verify the file still exists
      const docPath = path.join(this.basePath, 'documents', `${id}.json`);
      try {
        await fs.access(docPath);
      } catch {
        // File missing, remove from metadata
        this.metadata.delete(id);
        await this.saveMetadata();
        return { success: false, error: `Document file missing: ${id}` };
      }

      return { success: true, data: doc };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async getDocumentByPath(filePath: string): Promise<OperationResult<Document>> {
    try {
      // Find document by path
      for (const doc of this.metadata.values()) {
        if (doc.path === filePath) {
          // Verify the file still exists
          const docPath = path.join(this.basePath, 'documents', `${doc.id}.json`);
          try {
            await fs.access(docPath);
            return { success: true, data: doc };
          } catch {
            // File missing, remove from metadata
            this.metadata.delete(doc.id);
            await this.saveMetadata();
            return { success: false, error: `Document file missing: ${doc.id}` };
          }
        }
      }
      
      return { success: false, error: `No document found for path: ${filePath}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async getAllDocuments(): Promise<OperationResult<Document[]>> {
    try {
      const documents = Array.from(this.metadata.values());
      return { success: true, data: documents };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async getDocumentSummaries(): Promise<OperationResult<DocumentSummary[]>> {
    try {
      const summaries = Array.from(this.metadata.values()).map(doc => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        path: doc.path,
        size: doc.metadata.size,
        tags: doc.metadata.tags,
        createdAt: doc.metadata.createdAt,
        updatedAt: doc.metadata.updatedAt
      }));

      return { success: true, data: summaries };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<OperationResult<Document>> {
    try {
      const existingDoc = this.metadata.get(id);
      if (!existingDoc) {
        return { success: false, error: `Document not found: ${id}` };
      }

      const updatedDoc = {
        ...existingDoc,
        ...updates,
        id: existingDoc.id, // Prevent ID changes
        metadata: {
          ...existingDoc.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString()
        }
      };

      // Update document file
      const docPath = path.join(this.basePath, 'documents', `${id}.json`);
      await fs.writeFile(docPath, JSON.stringify(updatedDoc, null, 2), 'utf-8');

      // Update in-memory metadata
      this.metadata.set(id, updatedDoc);
      
      // Save metadata index
      await this.saveMetadata();

      console.error(`Document updated: ${id} (${updatedDoc.title})`);
      return { success: true, data: updatedDoc };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to update document: ${message}`);
      return { success: false, error: message };
    }
  }

  async deleteDocument(id: string): Promise<OperationResult<boolean>> {
    try {
      const doc = this.metadata.get(id);
      if (!doc) {
        return { success: false, error: `Document not found: ${id}` };
      }

      // Delete document file
      const docPath = path.join(this.basePath, 'documents', `${id}.json`);
      try {
        await fs.unlink(docPath);
      } catch (error) {
        console.error(`Warning: Could not delete document file ${docPath}: ${error}`);
      }

      // Remove from metadata
      this.metadata.delete(id);
      
      // Save updated metadata
      await this.saveMetadata();

      console.error(`Document deleted: ${id} (${doc.title})`);
      return { success: true, data: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to delete document: ${message}`);
      return { success: false, error: message };
    }
  }

  async getDocumentsByType(type: Document['type']): Promise<OperationResult<Document[]>> {
    try {
      const documents = Array.from(this.metadata.values()).filter(doc => doc.type === type);
      return { success: true, data: documents };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async getDocumentsByTags(tags: string[]): Promise<OperationResult<Document[]>> {
    try {
      const documents = Array.from(this.metadata.values()).filter(doc => 
        doc.metadata.tags && 
        tags.some(tag => doc.metadata.tags!.includes(tag))
      );
      return { success: true, data: documents };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  getStats(): { 
    totalDocuments: number; 
    documentsByType: Record<string, number>; 
    totalSize: number; 
  } {
    const documents = Array.from(this.metadata.values());
    const documentsByType: Record<string, number> = {};
    let totalSize = 0;

    documents.forEach(doc => {
      documentsByType[doc.type] = (documentsByType[doc.type] || 0) + 1;
      totalSize += doc.metadata.size;
    });

    return {
      totalDocuments: documents.length,
      documentsByType,
      totalSize
    };
  }
}