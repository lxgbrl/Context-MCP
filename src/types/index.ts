export interface Document {
  id: string;
  title: string;
  content: string;
  path: string;
  type: 'txt' | 'md' | 'pdf' | 'docx' | 'html' | 'json';
  metadata: {
    createdAt: string;
    updatedAt: string;
    size: number;
    tags?: string[];
    summary?: string;
    wordCount?: number;
    charCount?: number;
    // Allow additional properties for format-specific metadata
    [key: string]: any;
  };
}

export interface SearchResult {
  id: string;
  title: string;
  score: number;
  snippet: string;
  path?: string;
  type?: Document['type'];
  size?: number;
  tags?: string[];
  createdAt?: string;
  metadata: Document['metadata'];
}

export interface IndexEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface ProcessedFile {
  content: string;
  type: Document['type'];
  metadata?: Partial<Document['metadata']>;
}

export interface SearchQuery {
  query: string;
  limit?: number;
  filters?: {
    type?: Document['type'][];
    tags?: string[];
  };
}

export interface DocumentSummary {
  id: string;
  title: string;
  type: Document['type'];
  path: string;
  size: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IndexData {
  idx: any; // Lunr index serialized data
  docs: IndexEntry[];
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}