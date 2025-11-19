export enum AppStep {
  Upload = 'UPLOAD',
  Download = 'DOWNLOAD',
}

export interface FileContent {
  name: string;
  content: string;
}

export interface DocumentPair {
  id: number;
  rfp: File[];
  proposal: File | null;
}