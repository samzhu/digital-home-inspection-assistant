
export interface Category {
  id: string;
  title: string;
  sortIndex: number;
  createdAt: number;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  title: string;
  sortIndex: number;
  createdAt: number;
}

export interface CheckGroup {
  id: string;
  subcategoryId: string; // Links to Level 2
  title: string;
  sortIndex: number;
  createdAt: number;
}

export type ItemStatus = 'pending' | 'pass' | 'fail' | 'other';

export enum InspectionStatus {
  PENDING = 'pending',
  PASS = 'pass',
  FAIL = 'fail',
  OTHER = 'other'
}

export type SourceType = 'contract' | 'presale' | 'other';

export interface CheckItem {
  id: string;
  groupId: string; // Links to Level 3 (CheckGroup)
  title: string;
  status: ItemStatus;
  description: string;
  
  // Image Categories
  images: string[]; // Defect images
  recordImages: string[]; // General record images
  sourceImages?: string[]; // Evidence for source
  
  // Source Info
  sourceType?: SourceType;
  sourceText?: string;
  
  sortIndex: number;
  updatedAt: number;
}

export interface InspectionImage {
  id: string;
  itemId: string;
  blob: Blob;
  annotationData: any; // Fabric.js JSON
  createdAt: number;
}

export enum PhotoType {
  DEFECT = 'defect',
  RECORD = 'record'
}

export interface Photo {
  id: string;
  blob: Blob;
  type: PhotoType;
  timestamp: number;
  isAnnotated: boolean;
}

export enum ViewMode {
  ALL = 'ALL',
  PENDING = 'PENDING'
}
