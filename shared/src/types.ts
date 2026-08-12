// W3C Web Annotation-aligned types.
// See https://www.w3.org/TR/annotation-model/

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

export type Selector = TextQuoteSelector | TextPositionSelector;

export interface AnnotationTarget {
  source: string; // document id
  selector: Selector[];
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

export interface CanvasNode {
  id: string;
  documentId: string;
  annotationId: string;
  x: number;
  y: number;
  width: number;
  height: number | null;
  createdBy: string;
  createdAt: string;
}

export interface CanvasEdge {
  id: string;
  documentId: string;
  sourceAnnotationId: string;
  targetAnnotationId: string;
  label: string | null;
  createdBy: string;
  createdAt: string;
}
