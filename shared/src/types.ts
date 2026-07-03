// W3C Web Annotation-aligned types (simplified for Phase 0).
// See https://www.w3.org/TR/annotation-model/

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface AnnotationTarget {
  source: string; // document id
  selector: TextQuoteSelector[];
}

export type AnnotationBodyType = 'comment' | 'question' | 'highlight' | 'note';

export interface AnnotationBody {
  type: AnnotationBodyType;
  value: string;
}

export type Provenance = 'human' | 'ai-suggested' | 'group-confirmed';

export interface Annotation {
  id: string;
  documentId: string;
  groupId: string;
  creator: string;
  body: AnnotationBody;
  target: AnnotationTarget;
  tags: string[];
  parentId: string | null;
  provenance: Provenance;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  sourceFilename: string | null;
  html: string;
  groupId: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
}
