import { Dexie, type Table } from 'dexie';
import { Category, Subcategory, CheckGroup, CheckItem, InspectionImage } from './types';

export class InspectionDatabase extends Dexie {
  categories!: Table<Category, string>;
  subcategories!: Table<Subcategory, string>;
  groups!: Table<CheckGroup, string>;
  items!: Table<CheckItem, string>;
  images!: Table<InspectionImage, string>;

  constructor() {
    super('InspectionDB');
    // Version 3: Added groups table and updated items to use groupId
    (this as Dexie).version(3).stores({
      categories: 'id, sortIndex',
      subcategories: 'id, categoryId, sortIndex',
      groups: 'id, subcategoryId, sortIndex',
      items: 'id, groupId, status, sortIndex',
      images: 'id, itemId'
    });
  }
}

export const db = new InspectionDatabase();