import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from './db';
import { Category, Subcategory, CheckGroup, CheckItem, InspectionImage, ItemStatus, ViewMode, SourceType, InspectionStatus } from './types';
import { Plus, ClipboardList, Camera, X, Trash2, Mic, Sparkles, Check, Layers, Loader2, ListFilter, ChevronDown, FileText, Image as ImageIcon, AlertTriangle, MessageSquareQuote, FolderOpen, MoreVertical, LayoutGrid, BoxSelect, ArrowRight } from 'lucide-react';
import ImageAnnotator from './components/ImageAnnotator';
import { compressImage, blobToDataURL } from './utils/image';
import { INSPECTION_TEMPLATES } from './constants';
import { GoogleGenAI } from "@google/genai";
import Dashboard from './components/Dashboard';
import InspectionList from './components/InspectionList';
import AddItemModal from './components/AddItemModal';

const App: React.FC = () => {
  // Data States
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [groups, setGroups] = useState<CheckGroup[]>([]);
  const [items, setItems] = useState<CheckItem[]>([]);
  
  // Selection States
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // UI States
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.ALL);
  const [editingItem, setEditingItem] = useState<CheckItem | null>(null);
  const [annotatingImage, setAnnotatingImage] = useState<{ blob: Blob; id: string } | null>(null);
  
  // Modals
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  
  // Inputs
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  // Editing Item Images
  const [itemDefectImages, setItemDefectImages] = useState<{id: string, url: string}[]>([]);
  const [itemRecordImages, setItemRecordImages] = useState<{id: string, url: string}[]>([]);
  const [itemSourceImages, setItemSourceImages] = useState<{id: string, url: string}[]>([]);
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const prevEditingIdRef = useRef<string | null>(null);

  // AI & Voice
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Initialization & Sync ---
  useEffect(() => {
    const loadData = async () => {
      const cats = await db.categories.orderBy('sortIndex').toArray();
      const subcats = await db.subcategories.orderBy('sortIndex').toArray();
      const gps = await db.groups.orderBy('sortIndex').toArray();
      const allItems = await db.items.orderBy('sortIndex').toArray();
      
      setCategories(cats);
      setSubcategories(subcats);
      setGroups(gps);
      setItems(allItems);
      
      if (cats.length > 0 && !activeCategoryId) {
        setActiveCategoryId(cats[0].id);
      }
    };
    loadData();
  }, []);

  // --- Statistics Logic ---
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; done: number }> = {};
    categories.forEach(cat => {
      const catSubIds = subcategories.filter(s => s.categoryId === cat.id).map(s => s.id);
      const catGroupIds = groups.filter(g => catSubIds.includes(g.subcategoryId)).map(g => g.id);
      const catItems = items.filter(i => catGroupIds.includes(i.groupId));
      
      stats[cat.id] = {
        total: catItems.length,
        done: catItems.filter(i => i.status !== InspectionStatus.PENDING).length
      };
    });
    return stats;
  }, [categories, subcategories, groups, items]);

  // --- Cascading Selection Logic ---
  useEffect(() => {
    if (activeCategoryId) {
      const subs = subcategories.filter(s => s.categoryId === activeCategoryId);
      if (subs.length > 0) {
        if (!activeSubcategoryId || !subs.find(s => s.id === activeSubcategoryId)) {
          setActiveSubcategoryId(subs[0].id);
        }
      } else {
        setActiveSubcategoryId(null);
      }
    } else {
      setActiveSubcategoryId(null);
    }
  }, [activeCategoryId, subcategories]);

  useEffect(() => {
    if (activeSubcategoryId) {
      const gps = groups.filter(g => g.subcategoryId === activeSubcategoryId);
      if (gps.length > 0) {
        if (!activeGroupId || !gps.find(g => g.id === activeGroupId)) {
          setActiveGroupId(gps[0].id);
        }
      } else {
        setActiveGroupId(null);
      }
    } else {
      setActiveGroupId(null);
    }
  }, [activeSubcategoryId, groups]);

  // --- CRUD Handlers ---
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCat = { id: crypto.randomUUID(), title: newCategoryName.trim(), sortIndex: categories.length, createdAt: Date.now() };
    await db.categories.add(newCat);
    setCategories(prev => [...prev, newCat]);
    setNewCategoryName('');
    setIsAddingCategory(false);
    setActiveCategoryId(newCat.id);
  };

  const handleAddSubcategory = async () => {
    if (!newSubcategoryName.trim() || !activeCategoryId) return;
    const newSub = { id: crypto.randomUUID(), categoryId: activeCategoryId, title: newSubcategoryName.trim(), sortIndex: subcategories.filter(s => s.categoryId === activeCategoryId).length, createdAt: Date.now() };
    await db.subcategories.add(newSub);
    setSubcategories(prev => [...prev, newSub]);
    setNewSubcategoryName('');
    setIsAddingSubcategory(false);
    setActiveSubcategoryId(newSub.id);
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim() || !activeSubcategoryId) return;
    const newGroup = { id: crypto.randomUUID(), subcategoryId: activeSubcategoryId, title: newGroupName.trim(), sortIndex: groups.filter(g => g.subcategoryId === activeSubcategoryId).length, createdAt: Date.now() };
    await db.groups.add(newGroup);
    setGroups(prev => [...prev, newGroup]);
    setNewGroupName('');
    setIsAddingGroup(false);
    setActiveGroupId(newGroup.id);
  };

  const handleAddItem = async (title: string) => {
    if (!title.trim() || !activeGroupId) return;
    const newItem: CheckItem = {
      id: crypto.randomUUID(),
      groupId: activeGroupId,
      title: title.trim(),
      status: InspectionStatus.PENDING,
      description: '',
      images: [],
      recordImages: [],
      sourceImages: [],
      sortIndex: items.filter(i => i.groupId === activeGroupId).length,
      updatedAt: Date.now()
    };
    await db.items.add(newItem);
    setItems(prev => [...prev, newItem]);
    setNewItemTitle('');
    setIsAddingItem(false);
  };

  const importTemplate = async () => {
    if (!activeCategoryId) return;
    const category = categories.find(c => c.id === activeCategoryId);
    if (!category || !INSPECTION_TEMPLATES[category.title]) return;
    
    const templateData = INSPECTION_TEMPLATES[category.title];
    const newSubcats: Subcategory[] = [];
    const newGroups: CheckGroup[] = [];
    const newItems: CheckItem[] = [];
    
    let subSort = subcategories.filter(s => s.categoryId === activeCategoryId).length;

    for (const [subTitle, groupData] of Object.entries(templateData)) {
      const subId = crypto.randomUUID();
      newSubcats.push({ id: subId, categoryId: activeCategoryId, title: subTitle, sortIndex: subSort++, createdAt: Date.now() });
      
      let groupSort = 0;
      for (const [groupTitle, itemTitles] of Object.entries(groupData)) {
        const groupId = crypto.randomUUID();
        newGroups.push({ id: groupId, subcategoryId: subId, title: groupTitle, sortIndex: groupSort++, createdAt: Date.now() });
        itemTitles.forEach((itemTitle, itemIdx) => {
          newItems.push({ 
            id: crypto.randomUUID(), groupId: groupId, title: itemTitle, status: InspectionStatus.PENDING, description: '', 
            images: [], recordImages: [], sourceImages: [], sortIndex: itemIdx, updatedAt: Date.now() 
          });
        });
      }
    }

    await db.subcategories.bulkAdd(newSubcats);
    await db.groups.bulkAdd(newGroups);
    await db.items.bulkAdd(newItems);
    
    setSubcategories(prev => [...prev, ...newSubcats]);
    setGroups(prev => [...prev, ...newGroups]);
    setItems(prev => [...prev, ...newItems]);
    
    if (newSubcats.length > 0) setActiveSubcategoryId(newSubcats[0].id);
  };

  const updateItemStatus = async (id: string, status: ItemStatus) => {
    await db.items.update(id, { status, updatedAt: Date.now() });
    setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item));
    if (editingItem?.id === id) setEditingItem(prev => prev ? { ...prev, status } : null);
  };

  const deleteItem = async (id: string) => {
    if (confirm('確定刪除事項？')) {
      await db.items.delete(id);
      await db.images.where('itemId').equals(id).delete();
      setItems(prev => prev.filter(i => i.id !== id));
      setEditingItem(null);
    }
  };

  // --- Image & AI ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'defect' | 'record' | 'source') => {
    if (!e.target.files || !e.target.files[0] || !editingItem) return;
    const file = e.target.files[0];
    const compressedBlob = await compressImage(file);
    const imageId = crypto.randomUUID();
    const newImage: InspectionImage = { id: imageId, itemId: editingItem.id, blob: compressedBlob, annotationData: null, createdAt: Date.now() };
    await db.images.add(newImage);
    const keyMap = { defect: 'images', record: 'recordImages', source: 'sourceImages' } as const;
    const fieldKey = keyMap[type];
    const updatedImages = [...(editingItem[fieldKey] || []), imageId];
    // Cast update object to any or use explicit key construction to avoid TS error
    const updatePayload = { [fieldKey]: updatedImages, updatedAt: Date.now() } as any;
    await db.items.update(editingItem.id, updatePayload);
    setEditingItem(prev => prev ? { ...prev, [fieldKey]: updatedImages } : null);
    setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, [fieldKey]: updatedImages } : i));
    const url = await blobToDataURL(compressedBlob);
    if (type === 'defect') setItemDefectImages(prev => [...prev, { id: imageId, url }]);
    else if (type === 'record') setItemRecordImages(prev => [...prev, { id: imageId, url }]);
    else if (type === 'source') setItemSourceImages(prev => [...prev, { id: imageId, url }]);
  };

  const loadItemImages = useCallback(async (item: CheckItem) => {
    const imgs = await db.images.where('itemId').equals(item.id).toArray();
    const mapImgs = async (ids: string[] = []) => Promise.all(imgs.filter(img => ids.includes(img.id)).map(async i => ({ id: i.id, url: await blobToDataURL(i.blob) })));
    setItemDefectImages(await mapImgs(item.images));
    setItemRecordImages(await mapImgs(item.recordImages));
    setItemSourceImages(await mapImgs(item.sourceImages));
  }, []);

  useEffect(() => {
    if (editingItem) {
      if (prevEditingIdRef.current !== editingItem.id) { setIsSourceExpanded(false); prevEditingIdRef.current = editingItem.id; }
      loadItemImages(editingItem);
    } else {
      setItemDefectImages([]); setItemRecordImages([]); setItemSourceImages([]); prevEditingIdRef.current = null;
    }
  }, [editingItem, loadItemImages]);

  const saveAnnotation = async (data: any, updatedBlob: Blob) => {
    if (!annotatingImage || !editingItem) return;
    await db.images.update(annotatingImage.id, { annotationData: data, blob: updatedBlob });
    setAnnotatingImage(null);
    loadItemImages(editingItem);
  };

  const analyzeDefectWithAi = async () => {
    if (!editingItem || itemDefectImages.length === 0) return;
    setIsAiProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imgRecord = await db.images.get(itemDefectImages[0].id);
      if (!imgRecord) return;
      const base64Data = await blobToDataURL(imgRecord.blob).then(url => url.split(',')[1]);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: `你是專業驗屋助手。針對「${editingItem.title}」缺失，給出簡短精確描述（30字內，繁體中文）。` }, { inlineData: { mimeType: 'image/jpeg', data: base64Data } }]}]
      });
      setAiSuggestion(response.text || null);
    } catch (e) { console.error(e); } finally { setIsAiProcessing(false); }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          setIsAiProcessing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const base64Audio = await blobToDataURL(audioBlob).then(url => url.split(',')[1]);
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ parts: [{ text: "請將以下語音轉錄為繁體中文驗屋描述。" }, { inlineData: { mimeType: 'audio/webm', data: base64Audio } }]}]
          });
          if (response.text) {
            const val = response.text.trim();
            const updatedDesc = editingItem!.description ? `${editingItem!.description}\n${val}` : val;
            setEditingItem(prev => prev ? { ...prev, description: updatedDesc } : null);
            await db.items.update(editingItem!.id, { description: updatedDesc });
          }
          setIsAiProcessing(false);
          stream.getTracks().forEach(t => t.stop());
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) { alert("無法啟動錄音"); }
    }
  };

  // Rendering Data
  const activeSubcategories = subcategories.filter(s => s.categoryId === activeCategoryId);
  const activeGroups = groups.filter(g => g.subcategoryId === activeSubcategoryId);
  const activeGroupItems = items.filter(i => i.groupId === activeGroupId && (viewMode === ViewMode.ALL || i.status !== InspectionStatus.PASS));

  // --- Render Component for Editing View (Shared) ---
  const renderEditView = () => {
    if (!editingItem) return null;
    return (
      <div className="flex flex-col h-full bg-white relative w-full">
        <header className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm shrink-0">
          <button onClick={() => setEditingItem(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"><X /></button>
          <h2 className="font-black text-xs text-gray-400 uppercase tracking-widest">檢查項目詳情</h2>
          <button onClick={() => deleteItem(editingItem.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={20}/></button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:p-6 space-y-6 md:space-y-10 pb-40 w-full">
           {/* Status */}
           <section>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">狀態回饋</label>
              <div className="grid grid-cols-4 gap-2">
                {[InspectionStatus.PENDING, InspectionStatus.PASS, InspectionStatus.FAIL, InspectionStatus.OTHER].map(s => (
                  <button key={s} onClick={() => updateItemStatus(editingItem.id, s as ItemStatus)} className={`py-4 rounded-2xl font-black text-xs border-2 transition-all ${
                    editingItem.status === s ? (
                      s === InspectionStatus.PASS ? 'bg-green-500 border-green-600 text-white shadow-lg' : 
                      s === InspectionStatus.FAIL ? 'bg-red-500 border-red-600 text-white shadow-lg' : 
                      s === InspectionStatus.OTHER ? 'bg-gray-800 border-gray-900 text-white shadow-lg' :
                      'bg-gray-100 border-gray-300 text-gray-800'
                    ) : 'border-gray-50 text-gray-300 hover:border-gray-200'
                  }`}>
                    {s === InspectionStatus.PENDING ? '待驗' : s === InspectionStatus.PASS ? '合格' : s === InspectionStatus.FAIL ? '缺失' : '其他'}
                  </button>
                ))}
              </div>
            </section>

            {/* Source */}
            <section className="bg-gray-50 rounded-3xl overflow-hidden border border-gray-100 shadow-sm w-full">
              <button type="button" onClick={() => setIsSourceExpanded(!isSourceExpanded)} className="w-full p-4 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2"><div className={`p-1.5 rounded-lg text-white ${isSourceExpanded ? 'bg-blue-500' : 'bg-gray-300'}`}><FileText size={14} /></div><span className="text-sm font-black text-gray-800">項目來源</span></div>
                <ChevronDown className={`text-gray-400 transition-transform ${isSourceExpanded ? 'rotate-180' : ''}`} />
              </button>
              {isSourceExpanded && (
                <div className="p-5 space-y-6 border-t border-gray-50 animate-slide-up">
                  <div className="grid grid-cols-3 gap-2">{['contract', 'presale', 'other'].map(t => (<button key={t} onClick={() => { const val = t as SourceType; setEditingItem({...editingItem, sourceType: val}); db.items.update(editingItem.id, {sourceType: val}); }} className={`py-3 rounded-xl text-[10px] font-black border-2 transition-all ${editingItem.sourceType === t ? 'border-blue-500 bg-blue-50 text-blue-600' : 'bg-white text-gray-400'}`}>{t === 'contract' ? '合約' : t === 'presale' ? '預售' : '其他'}</button>))}</div>
                  <textarea className="w-full bg-white border border-gray-100 rounded-2xl p-4 min-h-[80px] text-sm shadow-inner outline-none focus:border-blue-200 transition-colors" placeholder="來源描述..." value={editingItem.sourceText || ''} onChange={e => { const val = e.target.value; setEditingItem({...editingItem, sourceText: val}); db.items.update(editingItem.id, {sourceText: val}); }} />
                  <div className="grid grid-cols-3 gap-2">{itemSourceImages.map(img => (<div key={img.id} className="aspect-square rounded-xl overflow-hidden bg-white border border-gray-100 cursor-pointer hover:opacity-90" onClick={() => db.images.get(img.id).then(i => i && setAnnotatingImage({blob: i.blob, id: i.id}))}><img src={img.url} className="w-full h-full object-cover" /></div>))}<label className="aspect-square rounded-xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-300 bg-white hover:bg-blue-50 cursor-pointer transition-colors"><Plus size={20} /><input type="file" className="hidden" onChange={e => handleFileUpload(e, 'source')} /></label></div>
                </div>
              )}
            </section>

            {/* Description */}
            <section className="space-y-4 w-full">
              <div className="px-2"><div className="flex items-center gap-2 mb-1.5 text-gray-400 uppercase tracking-widest text-[10px] font-black"><Layers size={12} /> 檢查事項</div><h3 className="text-xl font-black text-gray-800">{editingItem.title}</h3></div>
              <div className="bg-white rounded-3xl p-5 border-2 border-gray-50 shadow-sm space-y-4">
                <div className="flex justify-between items-center"><div className="flex items-center gap-2 text-orange-500 font-black text-xs"><MessageSquareQuote size={16} /> 檢查說明</div><div className="flex gap-2"><button onClick={analyzeDefectWithAi} disabled={isAiProcessing || itemDefectImages.length === 0} className="p-2 bg-blue-50 text-blue-600 rounded-xl active:scale-90 transition-transform disabled:opacity-30 hover:bg-blue-100">{isAiProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}</button><button onClick={handleVoiceRecord} disabled={isAiProcessing} className={`p-2 rounded-xl active:scale-90 transition-all hover:opacity-80 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-orange-50 text-orange-500'}`}><Mic size={18} /></button></div></div>
                {aiSuggestion && (<div className="p-4 bg-orange-50 border-2 border-orange-100 rounded-2xl animate-slide-up mb-2"><p className="text-xs font-bold text-orange-800 mb-3">AI 建議：{aiSuggestion}</p><div className="flex gap-2"><button onClick={() => { const updated = editingItem.description ? `${editingItem.description}\n${aiSuggestion}` : aiSuggestion; setEditingItem({...editingItem, description: updated}); db.items.update(editingItem.id, {description: updated}); setAiSuggestion(null); }} className="flex-1 py-2 bg-orange-500 text-white text-[10px] font-black rounded-lg hover:bg-orange-600">套用</button><button onClick={() => setAiSuggestion(null)} className="flex-1 py-2 bg-white text-gray-400 text-[10px] font-black rounded-lg border hover:bg-gray-50">略過</button></div></div>)}
                <textarea className="w-full min-h-[120px] outline-none text-sm text-gray-700 font-medium placeholder:text-gray-300 bg-transparent resize-none" placeholder="輸入檢查細節..." value={editingItem.description} onChange={e => { const val = e.target.value; setEditingItem({...editingItem, description: val}); db.items.update(editingItem.id, {description: val}); }} />
              </div>
            </section>

            {/* Images */}
            <div className="space-y-12 w-full">
              <section><div className="flex items-center gap-2 mb-4"><div className="bg-blue-500 p-1.5 rounded-lg text-white shadow-md shadow-blue-100"><ImageIcon size={14} /></div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">1. 紀錄影像</label></div><div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{itemRecordImages.map(img => (<div key={img.id} className="aspect-square relative rounded-3xl overflow-hidden border-4 border-white shadow-sm bg-gray-50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => db.images.get(img.id).then(i => i && setAnnotatingImage({blob: i.blob, id: i.id}))}><img src={img.url} className="w-full h-full object-cover" /></div>))}<label className="aspect-square rounded-3xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-400 bg-blue-50/20 active:bg-blue-50 hover:bg-blue-50/50 cursor-pointer transition-colors"><Camera size={32} /><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileUpload(e, 'record')} /></label></div></section>
              <section className="bg-red-50/40 rounded-[2.5rem] p-6 border border-red-100 shadow-sm"><div className="flex items-center gap-2 mb-5"><div className="bg-red-500 p-1.5 rounded-lg text-white shadow-md shadow-red-100"><AlertTriangle size={14} /></div><label className="text-[10px] font-black text-red-500 uppercase tracking-widest">2. 缺失影像</label></div><div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{itemDefectImages.map(img => (<div key={img.id} className="aspect-square relative rounded-3xl overflow-hidden border-4 border-white shadow-md bg-gray-50 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => db.images.get(img.id).then(i => i && setAnnotatingImage({blob: i.blob, id: i.id}))}><img src={img.url} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><span className="bg-white/90 text-[10px] px-3 py-1.5 rounded-full font-black text-red-500">標註</span></div></div>))}<label className="aspect-square rounded-3xl border-2 border-dashed border-red-200 flex flex-col items-center justify-center text-red-500 bg-white active:bg-red-50 hover:bg-red-50/50 cursor-pointer transition-colors"><Camera size={32} /><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileUpload(e, 'defect')} /></label></div></section>
            </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white/90 backdrop-blur-md border-t z-10 w-full">
             <button onClick={() => setEditingItem(null)} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-transform hover:bg-black">完成</button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 text-gray-900 font-sans flex flex-col md:flex-row overflow-hidden">
      {/* --- Left Panel (Navigation & List) --- */}
      {/* On Mobile: Hidden if editing. On Desktop: Always visible, fixed width */}
      <div className={`flex flex-col h-full w-full md:w-[400px] lg:w-[450px] shrink-0 border-r border-gray-200 bg-gray-50 relative z-0 transition-all ${editingItem ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Sticky Header inside Left Panel */}
        <header className="sticky top-0 z-30 bg-white border-b shadow-sm shrink-0">
          {/* Row 0: App Bar */}
          <div className="p-3 flex justify-between items-center border-b border-gray-50">
            <h1 className="text-base font-black text-gray-800 flex items-center gap-2">
              <div className="bg-safety-orange p-1 rounded-md text-white"><ClipboardList size={16} /></div>
              數位驗屋
            </h1>
            <div className="flex bg-gray-100 rounded-full p-0.5">
              <button onClick={() => setViewMode(ViewMode.ALL)} className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase transition-all ${viewMode === ViewMode.ALL ? 'bg-white shadow-sm text-safety-orange' : 'text-gray-400'}`}>全部</button>
              <button onClick={() => setViewMode(ViewMode.PENDING)} className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase transition-all ${viewMode === ViewMode.PENDING ? 'bg-white shadow-sm text-safety-orange' : 'text-gray-400'}`}>待驗</button>
            </div>
          </div>
          
          {/* Row 1: L1 Categories (Tabs) */}
          <div className="flex gap-2 overflow-x-auto py-2 px-3 scrollbar-hide border-b border-gray-50">
            {categories.map(cat => {
              const stat = categoryStats[cat.id] || { total: 0, done: 0 };
              const isActive = activeCategoryId === cat.id;
              return (
                <button 
                  key={cat.id} 
                  onClick={() => setActiveCategoryId(cat.id)} 
                  className={`px-4 py-1.5 rounded-lg text-xs font-black border transition-all whitespace-nowrap flex items-center gap-1.5 ${isActive ? 'border-safety-orange bg-safety-orange text-white shadow-sm' : 'border-transparent bg-gray-50 text-gray-400'}`}
                >
                  {cat.title}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {stat.done}/{stat.total}
                  </span>
                </button>
              );
            })}
            <button onClick={() => setIsAddingCategory(true)} className="px-3 py-1.5 rounded-lg border border-dashed border-gray-200 text-gray-300 text-xs font-black hover:bg-gray-50 transition-colors"><Plus size={14} /></button>
          </div>
          
          {/* Row 2: L2 Subcategories (Pills) */}
          {activeCategoryId && (
            <div className="flex gap-2 overflow-x-auto py-2 px-3 scrollbar-hide border-b border-gray-50 bg-gray-50/30">
              {activeSubcategories.map(sub => (
                <button key={sub.id} onClick={() => setActiveSubcategoryId(sub.id)} className={`px-3 py-1 rounded-full text-[10px] font-bold shadow-sm whitespace-nowrap transition-colors ${activeSubcategoryId === sub.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-100'}`}>
                  {sub.title}
                </button>
              ))}
              <button onClick={() => setIsAddingSubcategory(true)} className="px-3 py-1 rounded-full bg-white text-gray-400 border border-dashed border-gray-200 hover:border-gray-300 transition-colors"><Plus size={10} /></button>
            </div>
          )}

          {/* Row 3: L3 Groups (Sub-pills) */}
          {activeSubcategoryId && (
            <div className="flex gap-2 overflow-x-auto py-2 px-3 scrollbar-hide bg-gray-100/50">
              {activeGroups.map(group => (
                <button key={group.id} onClick={() => setActiveGroupId(group.id)} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border whitespace-nowrap transition-all ${activeGroupId === group.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  <BoxSelect size={10} />
                  {group.title}
                </button>
              ))}
              <button onClick={() => setIsAddingGroup(true)} className="px-3 py-1 rounded-full bg-white text-gray-400 border border-dashed border-gray-300 text-[10px] flex items-center gap-1 hover:bg-gray-50 transition-colors"><Plus size={10} /> 群組</button>
            </div>
          )}
        </header>

        {/* List Content */}
        <main className="flex-1 p-4 pb-24 overflow-y-auto space-y-3">
          {activeGroupId ? (
            <>
              {activeGroupItems.length === 0 ? (
                <div className="text-center py-16 px-6 border-2 border-dashed border-gray-200 rounded-2xl">
                   <p className="text-gray-300 font-bold text-xs mb-4">此群組尚無檢查項目</p>
                   <button onClick={() => setIsAddingItem(true)} className="px-6 py-2 bg-blue-50 text-blue-500 rounded-xl text-xs font-black hover:bg-blue-100 transition-colors">立即新增</button>
                </div>
              ) : (
                activeGroupItems.map(item => (
                  <div key={item.id} onClick={() => setEditingItem(item)} className={`bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all ${editingItem?.id === item.id ? 'border-safety-orange ring-1 ring-safety-orange' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-sm truncate text-gray-700">{item.title}</h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        {(item.images.length + (item.recordImages?.length || 0)) > 0 && <span className="text-[8px] text-blue-500 font-black flex items-center gap-0.5"><ImageIcon size={10} />{item.images.length + (item.recordImages?.length || 0)}</span>}
                        {item.description && <span className="text-[8px] text-gray-400 font-black flex items-center gap-0.5"><FileText size={10} /> </span>}
                      </div>
                    </div>
                    
                    {item.status !== InspectionStatus.PENDING && (
                      <div className={`px-3 py-1.5 rounded-lg font-black text-xs whitespace-nowrap ${
                        item.status === InspectionStatus.PASS ? 'bg-green-100 text-green-600' : 
                        item.status === InspectionStatus.FAIL ? 'bg-red-100 text-red-600' : 
                        'bg-gray-700 text-white'
                      }`}>
                        {item.status === InspectionStatus.PASS ? '合格' : item.status === InspectionStatus.FAIL ? '缺失' : '其他'}
                      </div>
                    )}
                    
                    {/* Chevron for desktop to indicate clickable */}
                    <div className="hidden md:block text-gray-300">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                ))
              )}
              {activeGroupItems.length > 0 && (
                 <button onClick={() => setIsAddingItem(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-black text-xs hover:bg-gray-50 hover:border-gray-300 hover:text-gray-500 transition-all">+ 新增項目</button>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center pt-20 opacity-60">
               {activeSubcategoryId ? (
                 activeGroups.length === 0 ? (
                   <>
                     <Sparkles size={48} className="text-orange-200 mb-4" />
                     <button onClick={importTemplate} className="px-6 py-3 bg-white border border-gray-200 text-safety-orange rounded-xl text-xs font-black shadow-sm mb-4 hover:bg-orange-50">導入範本</button>
                     <p className="text-gray-400 font-bold text-xs">或建立新群組開始</p>
                   </>
                 ) : (
                   <p className="text-gray-400 font-bold">請選擇上方群組</p>
                 )
               ) : (
                 <>
                   <Layers size={48} className="text-gray-200 mb-4" />
                   <p className="text-gray-400 font-bold">請選擇分類</p>
                 </>
               )}
            </div>
          )}
        </main>
        
        {/* FAB for Add Item (Attached to Left Panel) */}
        {activeGroupId && (
          <div className="absolute bottom-6 right-6 z-40">
             <button onClick={() => setIsAddingItem(true)} className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 hover:scale-105 transition-all"><Plus size={28} /></button>
          </div>
        )}
      </div>

      {/* --- Right Panel (Editing View) --- */}
      {/* On Mobile: Full screen modal behavior via CSS classes toggled by 'editingItem' */}
      {/* On Desktop: Always visible, shows placeholder if no item selected */}
      <div className={`flex-1 bg-white h-full relative overflow-hidden transition-all ${editingItem ? 'flex' : 'hidden md:flex'}`}>
         {editingItem ? (
           renderEditView()
         ) : (
           <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300 select-none">
              <div className="bg-white p-8 rounded-full shadow-sm mb-6">
                <ClipboardList size={64} className="text-gray-200" />
              </div>
              <p className="font-black text-lg">請選擇檢查項目</p>
              <p className="text-xs font-bold mt-2">點擊左側列表開始編輯詳情</p>
           </div>
         )}
      </div>

      {/* --- Modals (Global Overlays) --- */}
      {/* Category Modal (L1) */}
      {isAddingCategory && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 animate-slide-up shadow-2xl">
            <h2 className="text-lg font-black text-gray-800">新增第一層分類</h2>
            <p className="text-xs text-gray-400 font-bold -mt-3">例如：公區、私區</p>
            <div className="flex flex-wrap gap-2">
              {['公區', '私區', '全室', '戶外'].map(t => (
                <button 
                  key={t} 
                  onClick={() => setNewCategoryName(t)} 
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${newCategoryName === t ? 'border-safety-orange bg-orange-50 text-safety-orange' : 'border-gray-100 bg-gray-50 text-gray-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input autoFocus className="w-full bg-gray-50 border-2 p-4 rounded-2xl outline-none font-bold focus:border-safety-orange/50 transition-colors" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="自訂名稱" />
            <div className="flex gap-2">
              <button onClick={() => setIsAddingCategory(false)} className="flex-1 py-4 text-gray-400 font-bold hover:bg-gray-50 rounded-2xl">取消</button>
              <button onClick={handleAddCategory} className="flex-1 py-4 bg-safety-orange text-white rounded-2xl font-black shadow-lg shadow-orange-200 hover:bg-orange-600">建立</button>
            </div>
          </div>
        </div>
      )}

      {/* Subcategory Modal (L2) */}
      {isAddingSubcategory && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 animate-slide-up shadow-2xl">
            <h2 className="text-lg font-black text-gray-800">新增第二層分類</h2>
            <p className="text-xs text-gray-400 font-bold -mt-3">例如：客廳、廚房、臥室</p>
            <div className="flex flex-wrap gap-2">
              {['客廳', '餐廳', '廚房', '主臥', '次臥', '衛浴', '陽台', '玄關'].map(t => (
                <button 
                  key={t} 
                  onClick={() => setNewSubcategoryName(t)} 
                   className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${newSubcategoryName === t ? 'border-safety-orange bg-orange-50 text-safety-orange' : 'border-gray-100 bg-gray-50 text-gray-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input autoFocus className="w-full bg-gray-50 border-2 p-4 rounded-2xl outline-none font-bold focus:border-gray-300" value={newSubcategoryName} onChange={e => setNewSubcategoryName(e.target.value)} placeholder="自訂名稱" />
            <div className="flex gap-2">
              <button onClick={() => setIsAddingSubcategory(false)} className="flex-1 py-4 text-gray-400 font-bold hover:bg-gray-50 rounded-2xl">取消</button>
              <button onClick={handleAddSubcategory} className="flex-1 py-4 bg-gray-800 text-white rounded-2xl font-black shadow-lg hover:bg-gray-900">建立</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal (L3) */}
      {isAddingGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 animate-slide-up shadow-2xl">
            <h2 className="text-lg font-black text-gray-800">新增群組 (第三層)</h2>
             <p className="text-xs text-gray-400 font-bold -mt-3">例如：插座開關、給水系統...</p>
            <input autoFocus className="w-full bg-gray-50 border-2 p-4 rounded-2xl outline-none font-bold focus:border-blue-500/50" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <div className="flex gap-2"><button onClick={() => setIsAddingGroup(false)} className="flex-1 py-4 text-gray-400 font-bold hover:bg-gray-50 rounded-2xl">取消</button><button onClick={handleAddGroup} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700">建立</button></div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 animate-slide-up shadow-2xl">
            <h2 className="text-lg font-black text-gray-800">新增檢查事項</h2>
            <input autoFocus className="w-full bg-gray-50 border-2 p-4 rounded-2xl outline-none font-bold" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddItem(newItemTitle)} />
            <button onClick={() => handleAddItem(newItemTitle)} className="w-full py-4 bg-safety-orange text-white rounded-2xl font-black hover:bg-orange-600">加入清單</button>
          </div>
        </div>
      )}

      {annotatingImage && <ImageAnnotator imageBlob={annotatingImage.blob} onSave={saveAnnotation} onCancel={() => setAnnotatingImage(null)} />}
    </div>
  );
};

export default App;