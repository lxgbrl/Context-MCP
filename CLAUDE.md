# MCP Document Server - Project Instructions

## Project Overview

This project implements a local TypeScript MCP (Model Context Protocol) server that enables Claude Code to index, search, and retrieve documents from your local filesystem. The server provides semantic search capabilities across multiple document formats including PDF, DOCX, Markdown, HTML, TXT, and JSON files.

### Core Objectives
1. **Document Indexing**: Automatically process and index documents from local directories
2. **Full-Text Search**: Provide fast, accurate search across all indexed content  
3. **MCP Integration**: Seamless integration with Claude Code via MCP protocol
4. **Multi-Format Support**: Handle PDF, DOCX, MD, HTML, TXT, and JSON files
5. **Persistent Storage**: Maintain document metadata and search indices locally
6. **Real-time Updates**: Watch directories for file changes and update indices automatically

## Architecture

### Core Components
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────►│   MCP Server     │────►│ Document Store  │
│  (MCP Client)   │     │  (TypeScript)    │     │  (Local Files)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌──────────────┐          ┌──────────────┐
                        │ Search Index │          │   Metadata   │
                        │   (Lunr.js)  │          │    (JSON)    │
                        └──────────────┘          └──────────────┘
```

### Module Structure
- **DocumentStore**: Manages document storage, metadata, and CRUD operations
- **SearchIndex**: Handles full-text indexing and search using Lunr.js
- **DocumentProcessor**: Extracts content from various file formats
- **FileWatcher**: Monitors directories for file changes
- **MCP Server**: Exposes tools and resources via MCP protocol

### Data Flow
1. Files are processed by DocumentProcessor to extract content
2. Documents are stored in DocumentStore with metadata
3. Content is indexed by SearchIndex for fast retrieval
4. MCP Server exposes tools for document operations
5. Claude Code interacts via MCP tools and resources

## Technology Stack

### Core Dependencies
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **TypeScript**: Type-safe development
- **Node.js**: Runtime environment
- **Lunr.js**: Full-text search indexing
- **Zod**: Runtime type validation

### Document Processing
- **pdf-parse**: PDF content extraction
- **mammoth**: DOCX content extraction  
- **cheerio**: HTML parsing and content extraction
- **marked**: Markdown processing
- **gray-matter**: Frontmatter parsing

### File Management
- **chokidar**: File system watching
- **glob**: File pattern matching
- **nanoid**: Unique ID generation

## File Structure

```
mcp-document-server/
├── src/
│   ├── index.ts                 # Main MCP server entry point
│   ├── lib/
│   │   ├── DocumentStore.ts     # Document storage and metadata
│   │   ├── SearchIndex.ts       # Search indexing with Lunr.js
│   │   ├── DocumentProcessor.ts # File content extraction
│   │   └── FileWatcher.ts       # Directory monitoring
│   ├── tools/                   # MCP tool implementations
│   ├── resources/               # MCP resource handlers
│   ├── types/
│   │   └── index.ts            # TypeScript type definitions
│   └── utils/                  # Utility functions
├── data/
│   ├── documents/              # Processed document storage
│   ├── metadata/               # Document metadata (JSON)
│   └── index/                  # Search index files
├── tests/                      # Test suites
├── docs/                       # Project documentation
│   ├── architecture.md         # Architecture details
│   ├── api.md                  # MCP API documentation
│   └── usage.md               # Usage examples
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## Development Workflow

### Setup Process
1. **Initialize Project**: Create directory structure and package.json
2. **Install Dependencies**: Add all required packages
3. **Configure TypeScript**: Set up strict typing and module resolution
4. **Implement Core Classes**: DocumentStore, SearchIndex, DocumentProcessor
5. **Build MCP Server**: Implement tools and resources
6. **Test Integration**: Verify Claude Code compatibility
7. **Add Advanced Features**: File watching, batch processing

### Code Organization Principles
- **Single Responsibility**: Each class handles one specific concern
- **Dependency Injection**: Pass dependencies explicitly to constructors
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Async/Await**: Use async/await consistently for asynchronous operations
- **Type Safety**: Leverage TypeScript for compile-time safety

## Code Standards

### TypeScript Guidelines
- Use strict TypeScript configuration
- Define explicit interfaces for all data structures
- Avoid `any` type - use proper typing or `unknown`
- Use const assertions where appropriate
- Implement proper error types

### File Naming Conventions
- PascalCase for class files: `DocumentStore.ts`
- camelCase for utility files: `fileUtils.ts`
- kebab-case for configuration: `tsconfig.json`
- Descriptive names that indicate purpose

### Error Handling Pattern
```typescript
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  console.error(`Operation failed: ${error.message}`);
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Unknown error' 
  };
}
```

### Logging Standards
- Use `console.error()` for server-side logging (MCP best practice)
- Include context in log messages
- Log errors with stack traces for debugging
- Avoid logging sensitive document content

## MCP Implementation Guidelines

### Tool Design Principles
- **Clear Names**: Tool names should be self-explanatory
- **Comprehensive Schemas**: Use Zod for input validation
- **Detailed Descriptions**: Provide helpful descriptions for Claude Code
- **Consistent Responses**: Return structured, predictable responses
- **Error Context**: Include helpful error messages

### Resource Implementation
- Use `doc://` URI scheme for document resources
- Provide meaningful resource names and descriptions
- Support streaming for large documents
- Include appropriate MIME types

### Required MCP Tools
1. `add_document` - Index a new document
2. `search_documents` - Full-text search
3. `get_document` - Retrieve specific document
4. `list_documents` - List all indexed documents
5. `update_document` - Update document metadata
6. `delete_document` - Remove document from index

## Testing Strategy

### Unit Testing
- Test each class in isolation
- Mock external dependencies
- Cover edge cases and error conditions
- Test TypeScript type safety

### Integration Testing
- Test MCP protocol compliance
- Verify document processing pipeline
- Test search accuracy and performance
- Validate file watching functionality

### Manual Testing Checklist
- [ ] Add documents of each supported format
- [ ] Verify search results are accurate and ranked properly
- [ ] Test Claude Code integration via MCP inspector
- [ ] Confirm file watching updates indices correctly
- [ ] Test error handling for corrupted files

## Security Considerations

### File Access
- Validate file paths to prevent directory traversal
- Restrict access to designated document directories
- Sanitize extracted content before indexing
- Handle file permissions appropriately

### Content Processing
- Validate file formats before processing
- Limit memory usage for large documents
- Sanitize HTML content to prevent XSS
- Handle malformed documents gracefully

### Data Storage
- Store documents in isolated directory structure  
- Use secure file permissions for data directory
- Avoid logging sensitive document content
- Implement proper cleanup for temporary files

## Performance Guidelines

### Indexing Optimization
- Process documents asynchronously
- Batch index updates for better performance
- Implement content truncation for very large documents
- Use streaming for large file processing

### Search Performance
- Limit search result counts
- Implement query optimization
- Cache frequently accessed documents
- Monitor memory usage during searches

### Memory Management
- Stream large files instead of loading entirely into memory
- Clean up temporary buffers after processing
- Monitor search index size and implement rotation if needed
- Use weak references where appropriate

## Claude Code Integration

### Configuration
The server must be registered in Claude Code's MCP configuration:

```json
{
  "mcpServers": {
    "document-index": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "WATCH_DIRECTORIES": "/Users/Alex/Documents/knowledge-base,/Users/Alex/Projects/docs",
        "DATA_PATH": "/Users/Alex/Documents/PROJEKTE/Context-MCP/data"
      }
    }
  }
}
```

### Environment Variables
- `WATCH_DIRECTORIES`: Comma-separated list of directories to monitor
- `DATA_PATH`: Where to store indexed documents and metadata
- `AUTO_INDEX`: Set to "true" to enable automatic indexing (default: true)

### Document Addition Methods

#### Method 1: Automatic Folder Watching (Recommended)
Simply drop files into your configured watch directories:

```bash
# Copy documents to watched folder
cp ~/Downloads/api-specification.pdf ~/Documents/knowledge-base/
cp ~/Downloads/user-manual.docx ~/Documents/knowledge-base/manuals/

# Documents are automatically indexed within seconds
# No manual commands needed!
```

Supported formats: `.pdf`, `.docx`, `.md`, `.html`, `.txt`, `.json`

#### Method 2: Claude Code Commands
Use MCP tools directly in Claude Code:

```
Add the file ~/Documents/project-spec.pdf to the document index with tags ["project", "specification"]

Search for documents about "authentication implementation"

List all indexed documents
```

### Usage Patterns
- **Zero-Token Access**: Documents are pre-indexed and accessible without re-processing
- **Instant Search**: Full-text search across all documents via `search_documents` tool
- **Direct Access**: Reference specific documents via `@document-index:doc://doc-id`
- **Resource Streaming**: Large documents streamed efficiently via MCP resources
- **Metadata Support**: Automatic tagging, summaries, and custom metadata

### Key Benefits vs. Context7 Approach

1. **Local Control**: Documents stay on your machine, no external dependencies
2. **No Token Costs**: Pre-indexed content doesn't consume tokens during conversations  
3. **Real-time Updates**: File changes automatically update the index
4. **Multi-format Support**: PDF, DOCX, Markdown, HTML, TXT, JSON
5. **MCP Native**: Seamless integration with Claude Code's architecture
6. **Searchable Archive**: Full-text search across your entire document collection

### Typical Workflow

```bash
# 1. Set up watched directories
mkdir -p ~/Documents/knowledge-base/{projects,research,manuals,references}

# 2. Configure MCP server with watch paths
# (done in Claude Code configuration)

# 3. Start using - just drop files!
cp ~/Downloads/*.pdf ~/Documents/knowledge-base/research/
# → Files automatically indexed

# 4. Use in Claude Code
# "Search my knowledge base for information about OAuth implementation"
# → Instant results from indexed documents, zero tokens
```

## Deployment

### Build Process
1. Compile TypeScript to JavaScript
2. Ensure executable permissions on main file
3. Verify all dependencies are included
4. Test MCP protocol compliance

### Directory Setup
- Create `data/` directory structure
- Set appropriate file permissions
- Initialize empty metadata files
- Configure file watching directories

## Maintenance

### Index Management
- Monitor index size and performance
- Implement index rebuilding functionality
- Handle corrupted index recovery
- Optimize search queries over time

### Document Cleanup
- Remove orphaned documents from index
- Clean up temporary processing files
- Validate document metadata integrity
- Implement backup and restore functionality

## Key Implementation Notes

1. **MCP Protocol**: Follow MCP specification exactly for tool schemas and responses
2. **File Processing**: Handle all supported formats robustly with proper error handling
3. **Search Quality**: Implement relevance scoring and result ranking
4. **Real-time Updates**: Ensure file watching updates indices immediately
5. **TypeScript Strict Mode**: Use strict TypeScript settings for maximum type safety
6. **Error Recovery**: Implement graceful handling of corrupted files and indices
7. **Performance**: Optimize for fast search and indexing of large document collections

This project prioritizes reliability, performance, and seamless integration with Claude Code while maintaining a clean, maintainable TypeScript codebase.