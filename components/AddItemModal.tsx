import React, { useState } from 'react';
import { X, Save, PlusCircle } from 'lucide-react';
import { db } from '../db';
import { InspectionStatus, Category, Subcategory, CheckGroup } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';

interface AddItemModalProps {
  onClose: () => void;
  defaultCategory?: string;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ onClose, defaultCategory }) => {
  const [categoryTitle, setCategoryTitle] = useState(defaultCategory || '');
  const [subcategoryTitle, setSubcategoryTitle] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch existing structure for suggestions
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []) || [];
  const groups = useLiveQuery(() => db.groups.toArray(), []) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryTitle.trim() || !title.trim()) return;

    setIsSubmitting(true);
    try {
      // 1. Find or Create Category
      let cat = categories.find(c => c.title === categoryTitle.trim());
      if (!cat) {
        cat = { id: crypto.randomUUID(), title: categoryTitle.trim(), sortIndex: categories.length, createdAt: Date.now() };
        await db.categories.add(cat);
      }

      // 2. Find or Create Subcategory
      const subTitle = subcategoryTitle.trim() || '一般';
      let sub = subcategories.find(s => s.categoryId === cat!.id && s.title === subTitle);
      if (!sub) {
        sub = { id: crypto.randomUUID(), categoryId: cat.id, title: subTitle, sortIndex: 0, createdAt: Date.now() };
        await db.subcategories.add(sub);
      }

      // 3. Find or Create Group
      const gTitle = groupTitle.trim() || '其他';
      let grp = groups.find(g => g.subcategoryId === sub!.id && g.title === gTitle);
      if (!grp) {
        grp = { id: crypto.randomUUID(), subcategoryId: sub.id, title: gTitle, sortIndex: 0, createdAt: Date.now() };
        await db.groups.add(grp);
      }

      // 4. Create Item
      await db.items.add({
        id: crypto.randomUUID(),
        groupId: grp.id,
        title: title.trim(),
        status: 'pending', // matches ItemStatus type (string literal)
        description: '',
        images: [],
        recordImages: [],
        sourceImages: [],
        sortIndex: 0,
        updatedAt: Date.now()
      });
      onClose();
    } catch (error) {
      console.error("Failed to add item", error);
      alert("新增失敗，請重試");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <PlusCircle className="text-primary" size={20} />
            新增檢查項目
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-200 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">主分類 (Category)</label>
            <input 
              list="categories-list"
              value={categoryTitle}
              onChange={(e) => setCategoryTitle(e.target.value)}
              className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary outline-none transition"
              placeholder="例如：廚房、衛浴"
              required
            />
            <datalist id="categories-list">
              {categories.map(c => <option key={c.id} value={c.title} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Subcategory */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">子分類</label>
              <input 
                list="subcategories-list"
                value={subcategoryTitle}
                onChange={(e) => setSubcategoryTitle(e.target.value)}
                className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary outline-none transition"
                placeholder="例如：機電"
              />
              <datalist id="subcategories-list">
                {subcategories
                  .filter(s => {
                    const parent = categories.find(c => c.title === categoryTitle);
                    return !parent || s.categoryId === parent.id;
                  })
                  .map(s => <option key={s.id} value={s.title} />)}
              </datalist>
            </div>

            {/* Group */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">群組/設備</label>
              <input 
                list="groups-list"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary outline-none transition"
                placeholder="例如：插座"
              />
              <datalist id="groups-list">
                {groups
                  .filter(g => {
                     // Approximate filtering. Ideally we need selected subcategory ID
                     return true;
                  })
                  .map(g => <option key={g.id} value={g.title} />)}
              </datalist>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">檢查項目名稱</label>
            <input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary outline-none transition"
              placeholder="例如：相位檢查是否正確"
              required
            />
          </div>

          {/* Actions */}
          <div className="pt-4">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? '儲存中...' : <><Save size={18} /> 建立項目</>}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default AddItemModal;