# Context-MCP Document Server

A powerful local TypeScript MCP (Model Context Protocol) server that enables Claude Code to index, search, and retrieve documents from your local filesystem. Supports PDF, DOCX, Markdown, HTML, TXT, and JSON files with full-text search capabilities and automatic file watching.

## ✨ Features

- **📁 Multi-format Support**: PDF, DOCX, Markdown, HTML, TXT, and JSON files
- **🔍 Full-text Search**: Fast search with relevance scoring using Lunr.js
- **💾 Persistent Storage**: Local document storage with metadata
- **🔗 MCP Integration**: Seamless integration with Claude Code
- **📄 Content Extraction**: Intelligent content parsing for each file type
- **🌐 Resource Access**: Documents accessible via `doc://` URIs
- **👀 File Watching**: Automatically index new files when added to watched directories
- **⚙️ Configurable**: Environment-based configuration for data paths and watch directories

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** 
- **npm** or **yarn**
- **Claude Code** with MCP support

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/lxgbrl/Context-MCP.git
   cd Context-MCP
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Server**
   ```bash
   npm run build
   ```

4. **Test the Server (Optional)**
   ```bash
   # Test with MCP inspector
   npm run inspect
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Directory where documents and indices are stored (optional)
DATA_PATH="/path/to/your/document-storage"

# Comma-separated list of directories to watch for new files (optional)
WATCH_DIRECTORIES="/Users/you/Documents/knowledge-base,/Users/you/Projects/docs"
```

### Claude Code Integration

Add the server to your Claude Code MCP configuration:

#### macOS
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "document-index": {
      "command": "node",
      "args": ["/absolute/path/to/Context-MCP/dist/index.js"],
      "env": {
        "DATA_PATH": "/Users/you/Documents/Context-MCP/data",
        "WATCH_DIRECTORIES": "/Users/you/Documents/knowledge-base,/Users/you/Projects/docs"
      }
    }
  }
}
```

#### Windows
Edit `%APPDATA%/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "document-index": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\Context-MCP\\dist\\index.js"],
      "env": {
        "DATA_PATH": "C:\\Users\\you\\Documents\\Context-MCP\\data",
        "WATCH_DIRECTORIES": "C:\\Users\\you\\Documents\\knowledge-base,C:\\Users\\you\\Projects\\docs"
      }
    }
  }
}
```

#### Linux
Edit `~/.config/Claude/claude_desktop_config.json` with the same format as macOS.

**Important**: 
- Replace paths with your actual installation directory
- Use absolute paths only
- Restart Claude Code after configuration changes

## 📖 Usage

### Method 1: Automatic File Watching (Recommended)

The easiest way to use the document server is through automatic file watching:

1. **Configure Watch Directories** in your MCP configuration (see above)
2. **Drop Files** into your watched directories:
   ```bash
   # Just copy files to watched folders
   cp ~/Downloads/api-documentation.pdf ~/Documents/knowledge-base/
   cp ~/Downloads/user-manual.docx ~/Documents/knowledge-base/manuals/
   
   # Files are automatically indexed within seconds!
   ```

3. **Use in Claude Code**:
   ```
   Search my knowledge base for "authentication implementation"
   
   Using @document-index, find documents about OAuth and explain the setup process
   ```

### Method 2: Manual Document Management

Use these commands directly in Claude Code:

#### Add Documents
```
Add the file /Users/me/documents/research-paper.pdf to the document index with tags ["research", "ai"]
```

#### Search Documents
```
Search for documents about "machine learning algorithms"
```

#### List All Documents
```
Show me all indexed documents
```

#### Get Specific Document
```
Get the content of document with ID abc123
```

#### Update Document Metadata
```
Update document abc123 with title "New Title" and tags ["updated", "important"]
```

#### Delete Documents
```
Delete document with ID abc123
```

#### Server Statistics
```
Show me document server statistics
```

### Using Documents as Resources

Access documents directly as MCP resources:

```
Using @document-index:doc://abc123 as reference, explain the implementation details

Summarize the key points from @document-index:doc://xyz789
```

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `add_document` | Index a new document from file path |
| `search_documents` | Full-text search with relevance scoring |
| `get_document` | Retrieve complete document content |
| `list_documents` | List all indexed documents |
| `update_document` | Update document metadata (title, tags) |
| `delete_document` | Remove document from index |
| `get_server_stats` | View server statistics |

## 📄 Supported File Types

| Format | Extensions | Features |
|--------|------------|----------|
| **PDF** | `.pdf` | Text extraction, metadata, page count |
| **Word Documents** | `.docx` | Plain text extraction |
| **Markdown** | `.md` | Frontmatter parsing, heading analysis |
| **HTML** | `.html`, `.htm` | Content extraction, metadata tags |
| **Text Files** | `.txt` | Plain text content |
| **JSON** | `.json` | Structured data to searchable text |

## 🏗️ Development

### Project Structure
```
Context-MCP/
├── src/
│   ├── index.ts              # Main MCP server
│   ├── lib/
│   │   ├── DocumentStore.ts  # Document storage & metadata
│   │   ├── SearchIndex.ts    # Search indexing with Lunr.js
│   │   ├── DocumentProcessor.ts # File content extraction
│   │   └── FileWatcher.ts    # Directory monitoring
│   ├── resources/            # MCP resource handlers
│   ├── tools/               # MCP tool implementations
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utility functions
├── data/                    # Generated - document storage
├── dist/                    # Generated - compiled output
├── docs/                    # Project documentation
└── tests/                   # Test suites
```

### Development Commands
```bash
# Build the project
npm run build

# Development mode with auto-reload
npm run dev

# Test with MCP inspector
npm run inspect

# Clean build files
npm run clean
```

### Adding New File Types

1. Update `DocumentProcessor.ts`:
   - Add extension to `supportedExtensions` set
   - Implement processing method
   - Add to `processFile()` switch statement

2. Update type definitions in `types/index.ts` if needed

3. Test with various file samples

## 💡 Best Practices

### Directory Organization

```bash
~/Documents/knowledge-base/
├── projects/
│   ├── project-a/
│   │   ├── api-docs.md
│   │   └── specifications.pdf
│   └── project-b/
│       └── user-manual.docx
├── references/
│   ├── programming-guides/
│   └── api-references/
└── manuals/
    ├── tools/
    └── frameworks/
```

### File Naming
- Use descriptive filenames: `oauth-implementation-guide.md` vs `guide.md`
- Include version info: `api-v2-reference.pdf`
- Use consistent naming patterns

### Content Quality
- **Clear headings** for better search results
- **Good structure** with logical sections  
- **Relevant keywords** in content
- **Meaningful tags** when adding documents

## 🔧 Data Storage

Documents are stored locally in the configured data directory:

```
data/
├── documents/    # Full document content (JSON files)
├── metadata/     # Document metadata index
└── index/        # Search index files
```

- **Privacy**: All data stays on your local machine
- **Persistence**: Data survives server restarts
- **Backup**: Simply backup the data directory
- **Migration**: Move data directory to transfer documents

## 🐛 Troubleshooting

### Server Won't Start

**Check Node.js Version**
```bash
node --version  # Should be 18+
```

**Verify Installation**
```bash
npm install
npm run build
ls -la dist/index.js  # Should exist and be executable
```

**Check Permissions**
```bash
# Ensure data directory is writable
mkdir -p data
chmod 755 data
```

### Claude Code Can't Connect

1. **Verify Configuration Path**
   - Use absolute paths only
   - Check `dist/index.js` exists
   - Ensure paths match your system

2. **Test Server Independently**
   ```bash
   npm run inspect
   # Should show server tools and resources
   ```

3. **Check Environment Variables**
   ```bash
   # Test server startup with explicit paths
   DATA_PATH="/full/path/to/data" node dist/index.js
   ```

4. **Restart Claude Code** after configuration changes

### File Processing Issues

**PDF Files Not Processing**
- Ensure PDF files are not password-protected
- Check file permissions are readable
- Large PDFs may take time to process

**File Watching Not Working**
- Verify `WATCH_DIRECTORIES` paths exist
- Check directory permissions
- Restart server after changing watch directories

**Search Not Finding Documents**
```bash
# Check if documents are indexed
# Use list_documents tool in Claude Code

# Verify search index
# Use get_server_stats tool
```

### Common Error Solutions

| Error | Solution |
|-------|----------|
| `ENOENT: no such file or directory` | Use absolute file paths |
| `pdf-parse test file not found` | Already fixed in this version |
| `DocumentStore initialization failed` | Check DATA_PATH directory permissions |
| `Permission denied` | Ensure directories are readable/writable |

## 🔄 Migration & Backup

### Backup Your Documents
```bash
# Backup document data
tar -czf document-backup.tar.gz data/

# Restore from backup
tar -xzf document-backup.tar.gz
```

### Moving to New Machine
1. Copy the `data/` directory
2. Install Context-MCP on new machine
3. Configure Claude Code with new paths
4. Documents and search index will be preserved

## 🤝 Contributing

1. **Fork the Repository**
2. **Create Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Commit Changes**: `git commit -m 'Add amazing feature'`
4. **Push to Branch**: `git push origin feature/amazing-feature`
5. **Open Pull Request**

### Development Setup
```bash
git clone https://github.com/lxgbrl/Context-MCP.git
cd Context-MCP
npm install
npm run dev  # Start development server
```

## 📚 Documentation

- **[Architecture Documentation](docs/architecture.md)** - System design and components
- **[API Documentation](docs/api.md)** - MCP tools and resources reference
- **[Usage Examples](docs/usage.md)** - Detailed usage scenarios

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Model Context Protocol](https://modelcontextprotocol.io/)** - MCP specification and SDK
- **[Claude Code](https://claude.ai/code)** - MCP client integration
- **[Lunr.js](https://lunrjs.com/)** - Full-text search engine
- **Open Source Libraries** - All the amazing libraries that make this possible

---

**Made with ❤️ for the Claude Code community**

*Transform your local documents into an intelligent, searchable knowledge base accessible directly in Claude Code conversations.*