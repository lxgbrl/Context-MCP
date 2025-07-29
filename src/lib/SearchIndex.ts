import lunr from 'lunr';
import fs from 'fs/promises';
import path from 'path';
import { Document, SearchResult, IndexEntry, IndexData, OperationResult } from '../types/index.js';

export class SearchIndex {
  private index: lunr.Index | null = null;
  private documents: Map<string, IndexEntry> = new Map();
  private indexPath: string;

  constructor(basePath: string = './data') {
    this.indexPath = path.join(basePath, 'index', 'search.json');
  }

  async initialize(): Promise<OperationResult> {
    try {
      await this.loadIndex();
      console.error(`SearchIndex initialized with ${this.documents.size} documents`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`SearchIndex initialization failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const { idx, docs }: IndexData = JSON.parse(data);
      
      // Load the Lunr index
      this.index = lunr.Index.load(idx);
      
      // Load document entries
      this.documents = new Map(docs.map((d: IndexEntry) => [d.id, d]));
      
      console.error(`Loaded search index with ${docs.length} documents`);
    } catch (error) {
      // Index doesn't exist or is corrupted, start fresh
      console.error('No existing search index found, will be created when documents are added');
      this.documents = new Map();
      this.index = null;
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      if (!this.index) {
        console.error('Warning: Attempting to save null index');
        return;
      }

      const data: IndexData = {
        idx: this.index.toJSON(),
        docs: Array.from(this.documents.values())
      };

      await fs.writeFile(this.indexPath, JSON.stringify(data, null, 2), 'utf-8');
      console.error(`Search index saved with ${this.documents.size} documents`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to save search index: ${message}`);
      throw error;
    }
  }

  async addDocument(doc: Document): Promise<OperationResult> {
    try {
      const entry: IndexEntry = {
        id: doc.id,
        title: doc.title,
        content: this.truncateContent(doc.content, 10000), // Limit content size for indexing
        tags: doc.metadata.tags || []
      };

      this.documents.set(doc.id, entry);
      await this.rebuildIndex();
      
      console.error(`Document added to search index: ${doc.id}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to add document to search index: ${message}`);
      return { success: false, error: message };
    }
  }

  async updateDocument(doc: Document): Promise<OperationResult> {
    try {
      // Same as add - rebuild handles updates
      return await this.addDocument(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async removeDocument(id: string): Promise<OperationResult> {
    try {
      if (!this.documents.has(id)) {
        return { success: false, error: `Document not found in index: ${id}` };
      }

      this.documents.delete(id);
      await this.rebuildIndex();
      
      console.error(`Document removed from search index: ${id}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to remove document from search index: ${message}`);
      return { success: false, error: message };
    }
  }

  private async rebuildIndex(): Promise<void> {
    try {
      const documents = Array.from(this.documents.values());
      
      if (documents.length === 0) {
        this.index = null;
        await this.saveIndex();
        return;
      }

      this.index = lunr(function() {
        this.ref('id');
        this.field('title', { boost: 10 });
        this.field('content');
        this.field('tags', { boost: 5 });

        documents.forEach(doc => {
          try {
            this.add({
              id: doc.id,
              title: doc.title,
              content: doc.content,
              tags: doc.tags.join(' ')
            });
          } catch (error) {
            console.error(`Error adding document ${doc.id} to index: ${error}`);
          }
        });
      });

      await this.saveIndex();
      console.error(`Search index rebuilt with ${documents.length} documents`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to rebuild search index: ${message}`);
      throw error;
    }
  }

  search(query: string, limit: number = 10): OperationResult<SearchResult[]> {
    try {
      if (!this.index || !query.trim()) {
        return { success: true, data: [] };
      }

      // Clean and prepare the query
      const cleanQuery = this.cleanQuery(query);
      if (!cleanQuery) {
        return { success: true, data: [] };
      }

      const results = this.index.search(cleanQuery);
      
      const searchResults = results
        .slice(0, limit)
        .map(result => {
          const doc = this.documents.get(result.ref);
          if (!doc) return null;

          // Extract snippet around first match
          const snippet = this.extractSnippet(doc.content, query);

          return {
            id: doc.id,
            title: doc.title,
            score: result.score,
            snippet,
            metadata: {} as any // Will be populated by caller with full metadata
          } as SearchResult;
        })
        .filter((r): r is SearchResult => r !== null);

      return { success: true, data: searchResults };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Search error: ${message}`);
      return { success: false, error: message };
    }
  }

  private cleanQuery(query: string): string {
    // Remove special characters that might break Lunr
    const cleaned = query
      .trim()
      .replace(/[^\w\s\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // For simple queries, add wildcard support
    const words = cleaned.split(' ').filter(word => word.length > 0);
    if (words.length === 1 && words[0].length > 2) {
      return `${words[0]}* ${words[0]}`;
    }

    return cleaned;
  }

  private extractSnippet(content: string, query: string, contextLength: number = 150): string {
    const lowerContent = content.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 1);
    
    // Find the first occurrence of any query word
    let bestIndex = -1;
    let bestWord = '';
    
    for (const word of queryWords) {
      const index = lowerContent.indexOf(word);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
        bestWord = word;
      }
    }

    if (bestIndex === -1) {
      // No match found, return beginning of content
      return this.truncateContent(content, contextLength) + '...';
    }

    // Extract context around the match
    const start = Math.max(0, bestIndex - contextLength / 2);
    const end = Math.min(content.length, bestIndex + bestWord.length + contextLength / 2);

    let snippet = content.slice(start, end);
    
    // Add ellipsis if needed
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }

  async rebuildFromDocuments(documents: Document[]): Promise<OperationResult> {
    try {
      console.error(`Rebuilding search index from ${documents.length} documents`);
      
      // Clear existing index
      this.documents.clear();
      
      // Add all documents
      for (const doc of documents) {
        const entry: IndexEntry = {
          id: doc.id,
          title: doc.title,
          content: this.truncateContent(doc.content, 10000),
          tags: doc.metadata.tags || []
        };
        this.documents.set(doc.id, entry);
      }

      // Rebuild the index
      await this.rebuildIndex();
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to rebuild index from documents: ${message}`);
      return { success: false, error: message };
    }
  }

  getIndexStats(): {
    totalDocuments: number;
    indexExists: boolean;
    indexSize: number;
  } {
    return {
      totalDocuments: this.documents.size,
      indexExists: this.index !== null,
      indexSize: this.index ? JSON.stringify(this.index.toJSON()).length : 0
    };
  }

  async clearIndex(): Promise<OperationResult> {
    try {
      this.documents.clear();
      this.index = null;
      
      // Remove index file
      try {
        await fs.unlink(this.indexPath);
      } catch (error) {
        // File might not exist, that's fine
      }

      console.error('Search index cleared');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}