#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DocumentStore } from './lib/DocumentStore.js';
import { SearchIndex } from './lib/SearchIndex.js';
import { DocumentProcessor } from './lib/DocumentProcessor.js';
import { FileWatcher } from './lib/FileWatcher.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize components
const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const documentStore = new DocumentStore(dataPath);
const searchIndex = new SearchIndex();
const processor = new DocumentProcessor();
const fileWatcher = new FileWatcher(processor, documentStore, searchIndex);

// Create MCP server
const server = new Server(
  {
    name: 'document-index-server',
    version: '1.0.0'
  }
);

// Initialize server components
async function initialize() {
  console.error('Initializing MCP Document Server...');
  
  const storeResult = await documentStore.initialize();
  if (!storeResult.success) {
    throw new Error(`DocumentStore initialization failed: ${storeResult.error}`);
  }

  const indexResult = await searchIndex.initialize();
  if (!indexResult.success) {
    throw new Error(`SearchIndex initialization failed: ${indexResult.error}`);
  }
  
  // Sync search index with existing documents
  const docsResult = await documentStore.getAllDocuments();
  if (docsResult.success && docsResult.data) {
    const rebuildResult = await searchIndex.rebuildFromDocuments(docsResult.data);
    if (!rebuildResult.success) {
      console.error(`Warning: Failed to rebuild search index: ${rebuildResult.error}`);
    }
  }

  const stats = documentStore.getStats();
  console.error(`Server initialized with ${stats.totalDocuments} documents`);
  
  // Start file watching if directories are configured
  const watchDirectories = process.env.WATCH_DIRECTORIES;
  if (watchDirectories && watchDirectories.trim()) {
    const directories = watchDirectories.split(',').map(dir => dir.trim()).filter(Boolean);
    if (directories.length > 0) {
      const watchResult = await fileWatcher.startWatching(directories);
      if (!watchResult.success) {
        console.error(`Warning: Failed to start file watching: ${watchResult.error}`);
      }
    }
  } else {
    console.error('No WATCH_DIRECTORIES configured, file watching disabled');
  }
}

// Tool input schemas
const addDocumentSchema = z.object({
  path: z.string().describe('Path to the document file'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  title: z.string().optional().describe('Custom title for the document')
});

const searchDocumentsSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(10).describe('Maximum results to return (default: 10)')
});

const getDocumentSchema = z.object({
  id: z.string().describe('Document ID')
});

const updateDocumentSchema = z.object({
  id: z.string().describe('Document ID'),
  title: z.string().optional().describe('New title'),
  tags: z.array(z.string()).optional().describe('New tags')
});

const deleteDocumentSchema = z.object({
  id: z.string().describe('Document ID')
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add_document',
        description: 'Add a document to the index from a file path. Supports PDF, DOCX, Markdown, HTML, TXT, and JSON files.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { 
              type: 'string', 
              description: 'Absolute path to the document file' 
            },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Optional tags for categorization'
            },
            title: { 
              type: 'string', 
              description: 'Optional custom title (defaults to filename)' 
            }
          },
          required: ['path']
        }
      },
      {
        name: 'search_documents',
        description: 'Search for documents using full-text search with relevance scoring',
        inputSchema: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Search query (supports partial matching)' 
            },
            limit: { 
              type: 'number', 
              description: 'Maximum results to return (default: 10, max: 50)',
              default: 10,
              minimum: 1,
              maximum: 50
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_document',
        description: 'Get the full content and metadata of a specific document by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document ID from search results' }
          },
          required: ['id']
        }
      },
      {
        name: 'list_documents',
        description: 'List all indexed documents with basic metadata (summaries without full content)',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'update_document',
        description: 'Update document metadata (title, tags) without changing content',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document ID' },
            title: { type: 'string', description: 'New title' },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'New tags (replaces existing tags)'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_document',
        description: 'Remove a document from the index permanently',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'get_server_stats',
        description: 'Get statistics about the document server (total documents, types, index size)',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'add_document': {
        const { path: filePath, tags, title } = addDocumentSchema.parse(args);
        
        // Check if processor supports this file type
        if (!processor.isSupported(filePath)) {
          const supportedTypes = processor.getSupportedExtensions();
          return {
            content: [
              {
                type: 'text',
                text: `Error: Unsupported file type. Supported extensions: ${supportedTypes.join(', ')}`
              }
            ]
          };
        }
        
        // Process the file
        const processResult = await processor.processFile(filePath);
        if (!processResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Error processing file: ${processResult.error}`
              }
            ]
          };
        }

        const { content, type, metadata } = processResult.data!;
        
        // Add to document store
        const addResult = await documentStore.addDocument(
          filePath,
          content,
          type,
          {
            tags: tags || [],
            ...metadata
          }
        );

        if (!addResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Error adding document: ${addResult.error}`
              }
            ]
          };
        }

        const doc = addResult.data!;
        
        // Update title if provided
        if (title && title !== doc.title) {
          const updateResult = await documentStore.updateDocument(doc.id, { title });
          if (updateResult.success) {
            doc.title = title;
          }
        }
        
        // Add to search index
        const indexResult = await searchIndex.addDocument(doc);
        if (!indexResult.success) {
          console.error(`Warning: Failed to add document to search index: ${indexResult.error}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Document added successfully!\n\nID: ${doc.id}\nTitle: ${doc.title}\nType: ${doc.type}\nSize: ${doc.metadata.size} bytes\nWords: ${doc.metadata.wordCount || 0}\nTags: ${doc.metadata.tags?.join(', ') || 'none'}\n\nSummary: ${doc.metadata.summary || 'No summary available'}`
            }
          ]
        };
      }

      case 'search_documents': {
        const { query, limit } = searchDocumentsSchema.parse(args);
        
        const searchResult = searchIndex.search(query, Math.min(limit, 50));
        if (!searchResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Search error: ${searchResult.error}`
              }
            ]
          };
        }

        const results = searchResult.data!;
        
        // Enrich results with full metadata
        const enrichedResults = await Promise.all(
          results.map(async (result) => {
            const docResult = await documentStore.getDocument(result.id);
            if (docResult.success && docResult.data) {
              const doc = docResult.data;
              return {
                id: result.id,
                title: result.title,
                score: Math.round(result.score * 100) / 100,
                snippet: result.snippet,
                path: doc.path,
                type: doc.type,
                size: doc.metadata.size,
                tags: doc.metadata.tags || [],
                createdAt: doc.metadata.createdAt
              };
            }
            return result;
          })
        );
        
        if (enrichedResults.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No documents found matching "${query}". Try different search terms or check if documents are indexed.`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Found ${enrichedResults.length} document(s) matching "${query}":\n\n` + 
                    enrichedResults.map((result, index) => 
                      `${index + 1}. **${result.title}** (ID: ${result.id})\n` +
                      `   Score: ${result.score} | Type: ${result.type} | Size: ${result.size} bytes\n` +
                      `   Tags: ${result.tags?.join(', ') || 'none'}\n` +
                      `   Snippet: ${result.snippet}\n`
                    ).join('\n')
            }
          ]
        };
      }

      case 'get_document': {
        const { id } = getDocumentSchema.parse(args);
        
        const docResult = await documentStore.getDocument(id);
        if (!docResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Document not found: ${docResult.error}`
              }
            ]
          };
        }

        const doc = docResult.data!;
        
        return {
          content: [
            {
              type: 'text',
              text: `**${doc.title}**\n\n` +
                    `ID: ${doc.id}\n` +
                    `Type: ${doc.type}\n` +
                    `Path: ${doc.path}\n` +
                    `Size: ${doc.metadata.size} bytes\n` +
                    `Words: ${doc.metadata.wordCount || 0}\n` +
                    `Tags: ${doc.metadata.tags?.join(', ') || 'none'}\n` +
                    `Created: ${new Date(doc.metadata.createdAt).toLocaleString()}\n` +
                    `Updated: ${new Date(doc.metadata.updatedAt).toLocaleString()}\n\n` +
                    `**Content:**\n${doc.content}`
            }
          ]
        };
      }

      case 'list_documents': {
        const summariesResult = await documentStore.getDocumentSummaries();
        if (!summariesResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Error listing documents: ${summariesResult.error}`
              }
            ]
          };
        }

        const summaries = summariesResult.data!;
        
        if (summaries.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No documents indexed yet. Use add_document to add your first document.'
              }
            ]
          };
        }

        // Sort by creation date (newest first)
        summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          content: [
            {
              type: 'text',
              text: `**Indexed Documents (${summaries.length} total):**\n\n` +
                    summaries.map((doc, index) => 
                      `${index + 1}. **${doc.title}** (ID: ${doc.id})\n` +
                      `   Type: ${doc.type} | Size: ${doc.size} bytes\n` +
                      `   Path: ${doc.path}\n` +
                      `   Tags: ${doc.tags?.join(', ') || 'none'}\n` +
                      `   Created: ${new Date(doc.createdAt).toLocaleString()}\n`
                    ).join('\n')
            }
          ]
        };
      }

      case 'update_document': {
        const { id, title, tags } = updateDocumentSchema.parse(args);
        
        const updates: any = {};
        if (title) updates.title = title;
        if (tags) updates.metadata = { tags };
        
        const updateResult = await documentStore.updateDocument(id, updates);
        if (!updateResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Error updating document: ${updateResult.error}`
              }
            ]
          };
        }

        const doc = updateResult.data!;
        
        // Update search index
        const indexResult = await searchIndex.updateDocument(doc);
        if (!indexResult.success) {
          console.error(`Warning: Failed to update search index: ${indexResult.error}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Document updated successfully!\n\nID: ${doc.id}\nTitle: ${doc.title}\nTags: ${doc.metadata.tags?.join(', ') || 'none'}\nUpdated: ${new Date(doc.metadata.updatedAt).toLocaleString()}`
            }
          ]
        };
      }

      case 'delete_document': {
        const { id } = deleteDocumentSchema.parse(args);
        
        // Get document info before deleting
        const docResult = await documentStore.getDocument(id);
        const docTitle = docResult.success ? docResult.data!.title : id;
        
        const deleteResult = await documentStore.deleteDocument(id);
        if (!deleteResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Error deleting document: ${deleteResult.error}`
              }
            ]
          };
        }
        
        // Remove from search index
        const indexResult = await searchIndex.removeDocument(id);
        if (!indexResult.success) {
          console.error(`Warning: Failed to remove from search index: ${indexResult.error}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Document "${docTitle}" (ID: ${id}) deleted successfully!`
            }
          ]
        };
      }

      case 'get_server_stats': {
        const docStats = documentStore.getStats();
        const indexStats = searchIndex.getIndexStats();
        
        const typesList = Object.entries(docStats.documentsByType)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
        
        return {
          content: [
            {
              type: 'text',
              text: `**Document Server Statistics:**\n\n` +
                    `Total Documents: ${docStats.totalDocuments}\n` +
                    `Total Size: ${Math.round(docStats.totalSize / 1024)} KB\n` +
                    `Documents by Type: ${typesList || 'none'}\n\n` +
                    `**Search Index:**\n` +
                    `Index Status: ${indexStats.indexExists ? 'Active' : 'Empty'}\n` +
                    `Indexed Documents: ${indexStats.totalDocuments}\n` +
                    `Index Size: ${Math.round(indexStats.indexSize / 1024)} KB`
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`
            }
          ]
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tool execution error for ${name}: ${message}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${message}`
        }
      ]
    };
  }
});

// Register resources for document access
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const docsResult = await documentStore.getAllDocuments();
    if (!docsResult.success) {
      return { resources: [] };
    }

    const docs = docsResult.data!;
    
    return {
      resources: docs.map(doc => ({
        uri: `doc://${doc.id}`,
        name: doc.title,
        description: doc.metadata.summary || `${doc.type.toUpperCase()} document (${doc.metadata.size} bytes)`,
        mimeType: `text/${doc.type}`
      }))
    };
  } catch (error) {
    console.error(`Error listing resources: ${error}`);
    return { resources: [] };
  }
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    const { uri } = request.params;
    
    if (!uri.startsWith('doc://')) {
      throw new Error('Invalid resource URI. Expected format: doc://[document-id]');
    }
    
    const id = uri.replace('doc://', '');
    const docResult = await documentStore.getDocument(id);
    
    if (!docResult.success) {
      throw new Error(`Document not found: ${docResult.error}`);
    }

    const doc = docResult.data!;
    
    return {
      contents: [
        {
          uri,
          mimeType: `text/${doc.type}`,
          text: `Title: ${doc.title}\nPath: ${doc.path}\nType: ${doc.type}\nTags: ${doc.metadata.tags?.join(', ') || 'none'}\n\n${doc.content}`
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read resource: ${message}`);
  }
});

// Main function
async function main() {
  try {
    await initialize();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('MCP Document Index Server running');
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down gracefully...');
  await fileWatcher.stopWatching();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  await fileWatcher.stopWatching();
  process.exit(0);
});

// Start server
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});