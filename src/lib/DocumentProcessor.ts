import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import matter from 'gray-matter';
import { ProcessedFile, OperationResult, Document } from '../types/index.js';

export class DocumentProcessor {
  private readonly supportedExtensions = new Set([
    '.txt', '.md', '.pdf', '.docx', '.html', '.htm', '.json'
  ]);

  async processFile(filePath: string): Promise<OperationResult<ProcessedFile>> {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      const ext = path.extname(filePath).toLowerCase();
      
      if (!this.supportedExtensions.has(ext)) {
        return { 
          success: false, 
          error: `Unsupported file type: ${ext}. Supported types: ${Array.from(this.supportedExtensions).join(', ')}` 
        };
      }

      const buffer = await fs.readFile(filePath);
      const fileStats = await fs.stat(filePath);

      let result: ProcessedFile;

      switch (ext) {
        case '.txt':
          result = await this.processTxt(buffer, fileStats);
          break;
        case '.md':
          result = await this.processMarkdown(buffer, fileStats);
          break;
        case '.pdf':
          result = await this.processPdf(buffer, fileStats);
          break;
        case '.docx':
          result = await this.processDocx(buffer, fileStats);
          break;
        case '.html':
        case '.htm':
          result = await this.processHtml(buffer, fileStats);
          break;
        case '.json':
          result = await this.processJson(buffer, fileStats);
          break;
        default:
          return { success: false, error: `Unsupported file type: ${ext}` };
      }

      // Add common metadata
      result.metadata = {
        ...result.metadata,
        originalPath: filePath,
        fileSize: fileStats.size,
        fileModified: fileStats.mtime.toISOString(),
        processedAt: new Date().toISOString()
      };

      console.error(`Processed ${ext} file: ${path.basename(filePath)} (${result.content.length} chars)`);
      return { success: true, data: result };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to process file ${filePath}: ${message}`);
      return { success: false, error: message };
    }
  }

  private async processTxt(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    const content = buffer.toString('utf-8');
    return {
      content: content.trim(),
      type: 'txt',
      metadata: {
        encoding: 'utf-8'
      }
    };
  }

  private async processMarkdown(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    const rawContent = buffer.toString('utf-8');
    
    try {
      // Parse frontmatter if present
      const { data: frontmatter, content } = matter(rawContent);
      
      // Convert markdown to plain text for indexing
      const htmlContent = await marked(content);
      const $ = cheerio.load(htmlContent);
      const plainText = $.root().text();

      return {
        content: plainText.trim(),
        type: 'md',
        metadata: {
          frontmatter,
          hasCodeBlocks: /```/.test(content),
          headingCount: (content.match(/^#{1,6}\s/gm) || []).length,
          linkCount: (content.match(/\[.*?\]\(.*?\)/g) || []).length,
          summary: frontmatter.description || frontmatter.summary || this.extractSummary(plainText)
        }
      };
    } catch (error) {
      // Fallback: treat as plain text
      console.error(`Markdown parsing failed, treating as plain text: ${error}`);
      return {
        content: rawContent.trim(),
        type: 'md',
        metadata: {
          parsingError: 'Treated as plain text due to parsing error'
        }
      };
    }
  }

  private async processPdf(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    try {
      // Dynamic import to avoid debug mode issue
      const { default: pdf } = await import('pdf-parse');
      const pdfData = await pdf(buffer);
      
      return {
        content: pdfData.text.trim(),
        type: 'pdf',
        metadata: {
          pages: pdfData.numpages,
          pdfInfo: {
            title: pdfData.info?.Title,
            author: pdfData.info?.Author,
            subject: pdfData.info?.Subject,
            creator: pdfData.info?.Creator,
            producer: pdfData.info?.Producer,
            creationDate: pdfData.info?.CreationDate,
            modificationDate: pdfData.info?.ModDate
          },
          summary: this.extractSummary(pdfData.text)
        }
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processDocx(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      // Check for conversion warnings
      const warnings = result.messages.filter(m => m.type === 'warning');
      if (warnings.length > 0) {
        console.error(`DOCX conversion warnings: ${warnings.map(w => w.message).join(', ')}`);
      }

      return {
        content: result.value.trim(),
        type: 'docx',
        metadata: {
          conversionWarnings: warnings.length > 0 ? warnings.map(w => w.message) : undefined,
          summary: this.extractSummary(result.value)
        }
      };
    } catch (error) {
      throw new Error(`DOCX processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processHtml(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    try {
      const html = buffer.toString('utf-8');
      const $ = cheerio.load(html);
      
      // Remove scripts, styles, and comments
      $('script').remove();
      $('style').remove();
      $('noscript').remove();
      
      // Extract text content
      const textContent = $.root().text().trim();
      
      // Extract metadata
      const title = $('title').text().trim();
      const metaDescription = $('meta[name="description"]').attr('content');
      const metaKeywords = $('meta[name="keywords"]').attr('content');
      const headings = $('h1, h2, h3, h4, h5, h6').map((_, el) => $(el).text().trim()).get();
      
      return {
        content: textContent,
        type: 'html',
        metadata: {
          title: title || undefined,
          description: metaDescription || undefined,
          keywords: metaKeywords ? metaKeywords.split(',').map(k => k.trim()) : undefined,
          headings: headings.length > 0 ? headings : undefined,
          summary: metaDescription || this.extractSummary(textContent)
        }
      };
    } catch (error) {
      throw new Error(`HTML processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processJson(buffer: Buffer, stats: any): Promise<ProcessedFile> {
    try {
      const jsonText = buffer.toString('utf-8');
      const jsonData = JSON.parse(jsonText);
      
      // Convert JSON to searchable text
      const searchableText = this.jsonToSearchableText(jsonData);
      
      return {
        content: searchableText,
        type: 'json',
        metadata: {
          originalJson: jsonData,
          jsonSize: Object.keys(jsonData).length,
          dataTypes: this.analyzeJsonTypes(jsonData),
          summary: this.extractJsonSummary(jsonData)
        }
      };
    } catch (error) {
      throw new Error(`JSON processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private jsonToSearchableText(obj: any, prefix: string = ''): string {
    const texts: string[] = [];
    
    const traverse = (value: any, path: string) => {
      if (typeof value === 'string') {
        texts.push(`${path}: ${value}`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        texts.push(`${path}: ${value.toString()}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          traverse(item, `${path}[${index}]`);
        });
      } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(key => {
          const newPath = path ? `${path}.${key}` : key;
          traverse(value[key], newPath);
        });
      }
    };
    
    traverse(obj, prefix);
    return texts.join('\n');
  }

  private analyzeJsonTypes(obj: any): Record<string, number> {
    const types: Record<string, number> = {};
    
    const countTypes = (value: any) => {
      const type = Array.isArray(value) ? 'array' : typeof value;
      types[type] = (types[type] || 0) + 1;
      
      if (Array.isArray(value)) {
        value.forEach(countTypes);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(countTypes);
      }
    };
    
    countTypes(obj);
    return types;
  }

  private extractJsonSummary(obj: any): string {
    if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj);
      if (keys.length > 0) {
        const keyList = keys.slice(0, 5).join(', ');
        const moreKeys = keys.length > 5 ? ` and ${keys.length - 5} more` : '';
        return `JSON object with keys: ${keyList}${moreKeys}`;
      }
    }
    return 'JSON data';
  }

  private extractSummary(content: string, maxLength: number = 200): string {
    if (!content) return '';
    
    // Clean the content
    const cleaned = content
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    // Try to cut at sentence boundary
    const sentences = cleaned.split(/[.!?]+/);
    let summary = '';
    
    for (const sentence of sentences) {
      const potential = summary + sentence + '.';
      if (potential.length > maxLength) {
        break;
      }
      summary = potential;
    }
    
    if (summary.length === 0) {
      // Fallback: cut at word boundary
      const words = cleaned.split(' ');
      summary = words.slice(0, 30).join(' ');
      if (words.length > 30) {
        summary += '...';
      }
    }
    
    return summary.trim();
  }

  async extractMetadata(content: string, type: Document['type']): Promise<any> {
    const metadata: any = {
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      charCount: content.length,
      lineCount: content.split('\n').length
    };

    // Extract summary
    metadata.summary = this.extractSummary(content);

    // Type-specific metadata extraction
    switch (type) {
      case 'md':
        metadata.headingCount = (content.match(/^#{1,6}\s/gm) || []).length;
        metadata.linkCount = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
        metadata.codeBlockCount = (content.match(/```/g) || []).length / 2;
        break;
        
      case 'html':
        metadata.estimatedReadingTime = Math.ceil(metadata.wordCount / 200); // words per minute
        break;
        
      case 'json':
        try {
          const parsed = JSON.parse(content);
          metadata.jsonKeys = Object.keys(parsed).length;
          metadata.dataTypes = this.analyzeJsonTypes(parsed);
        } catch {
          // Invalid JSON, skip specific metadata
        }
        break;
    }

    return metadata;
  }

  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.has(ext);
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.supportedExtensions);
  }
}