import React, { useState, useRef, useEffect } from 'react';
import { CheckItem, InspectionStatus, Photo, PhotoType, InspectionImage } from '../types';
import { db } from '../db';
import { Camera, Image as ImageIcon, Mic, X, Trash2, Edit3, Wand2, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';
import PhotoEditor from './PhotoEditor';
import { analyzeDefectImage, transcribeAudio } from '../services/geminiService';

interface DetailModalProps {
  item: CheckItem;
  onClose: () => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ item, onClose }) => {
  const [data, setData] = useState<CheckItem>(item);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Load images from DB
  useEffect(() => {
    const loadPhotos = async () => {
      // Combine all image lists
      const allImageIds = [
        ...(item.images || []),
        ...(item.recordImages || []),
        // sourceImages might be handled differently, but for this modal let's focus on defect/record
      ];
      
      const dbImages = await db.images.where('itemId').equals(item.id).toArray();
      const loadedPhotos: Photo[] = dbImages.map(img => ({
        id: img.id,
        blob: img.blob,
        // Infer type based on which list it belongs to
        type: (item.images || []).includes(img.id) ? PhotoType.DEFECT : PhotoType.RECORD,
        timestamp: img.createdAt,
        isAnnotated: !!img.annotationData
      }));
      setPhotos(loadedPhotos);
    };
    loadPhotos();
  }, [item]);

  const updateField = async (field: keyof CheckItem, value: any) => {
    const updated = { ...data, [field]: value, updatedAt: Date.now() };
    setData(updated);
    if (data.id) await db.items.update(data.id, { [field]: value, updatedAt: Date.now() });
  };

  const handleStatusChange = (status: InspectionStatus) => updateField('status', status);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = data.status === InspectionStatus.FAIL ? PhotoType.DEFECT : PhotoType.RECORD;
      const photoId = crypto.randomUUID();
      
      const newImage: InspectionImage = {
        id: photoId,
        itemId: data.id,
        blob: file,
        annotationData: null,
        createdAt: Date.now()
      };

      await db.images.add(newImage);
      
      // Update item's image list
      const listKey = type === PhotoType.DEFECT ? 'images' : 'recordImages';
      const currentList = data[listKey] || [];
      const updatedList = [...currentList, photoId];
      await updateField(listKey, updatedList);

      const newPhoto: Photo = {
        id: photoId,
        blob: file,
        type: type,
        timestamp: Date.now(),
        isAnnotated: false
      };
      setPhotos(prev => [...prev, newPhoto]);
      
      // Auto-trigger AI if it's a defect
      if (type === PhotoType.DEFECT && !data.description) {
        handleAnalyzeImage(newPhoto);
      }
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    await db.images.delete(photoId);
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    
    // Update IDs in CheckItem
    const newImages = (data.images || []).filter(id => id !== photoId);
    const newRecordImages = (data.recordImages || []).filter(id => id !== photoId);
    
    // Batch update for simplicity
    const updated = { 
        ...data, 
        images: newImages, 
        recordImages: newRecordImages, 
        updatedAt: Date.now() 
    };
    setData(updated);
    await db.items.update(data.id, { 
        images: newImages, 
        recordImages: newRecordImages, 
        updatedAt: Date.now() 
    });
  };

  const saveEditedPhoto = async (blob: Blob) => {
    if (!editingPhoto) return;
    
    // Update Blob in DB
    await db.images.update(editingPhoto.id, { blob: blob });
    
    setPhotos(prev => prev.map(p => 
      p.id === editingPhoto.id 
        ? { ...p, blob: blob, isAnnotated: true, timestamp: Date.now() } 
        : p
    ));
    setEditingPhoto(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setIsProcessingAI(true);
        try {
          const text = await transcribeAudio(audioBlob);
          const currentDesc = data.description ? data.description + '\n' : '';
          await updateField('description', currentDesc + text);
        } catch (err) {
          alert('語音轉錄失敗，請檢查網路或 API Key');
        } finally {
          setIsProcessingAI(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      alert('無法存取麥克風');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleAnalyzeImage = async (photo: Photo) => {
    setIsProcessingAI(true);
    try {
      const analysis = await analyzeDefectImage(photo.blob);
      const currentDesc = data.description ? data.description + '\n' : '';
      await updateField('description', currentDesc + analysis);
    } catch (err) {
      alert('圖片分析失敗');
    } finally {
      setIsProcessingAI(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom-full duration-300">
      {editingPhoto && (
        <PhotoEditor 
          imageBlob={editingPhoto.blob} 
          onSave={saveEditedPhoto} 
          onCancel={() => setEditingPhoto(null)} 
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 sticky top-0">
        <h2 className="text-lg font-bold text-gray-800 truncate pr-4">{data.title}</h2>
        <button onClick={onClose} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition">
          <ChevronDown />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
        {/* Status Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">檢驗結果</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleStatusChange(InspectionStatus.PASS)}
              className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition ${data.status === InspectionStatus.PASS ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}
            >
              <CheckCircle size={32} className={data.status === InspectionStatus.PASS ? 'fill-green-500 text-white' : ''} />
              <span className="font-bold">合格</span>
            </button>
            <button
              onClick={() => handleStatusChange(InspectionStatus.FAIL)}
              className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition ${data.status === InspectionStatus.FAIL ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}
            >
              <AlertCircle size={32} className={data.status === InspectionStatus.FAIL ? 'fill-red-500 text-white' : ''} />
              <span className="font-bold">缺失</span>
            </button>
            <button
              onClick={() => handleStatusChange(InspectionStatus.PENDING)}
              className={`p-3 rounded-lg border text-sm font-medium ${data.status === InspectionStatus.PENDING ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300'}`}
            >
              待驗
            </button>
             <button
              onClick={() => handleStatusChange(InspectionStatus.OTHER)}
              className={`p-3 rounded-lg border text-sm font-medium ${data.status === InspectionStatus.OTHER ? 'bg-gray-400 text-white border-gray-400' : 'bg-white border-gray-300'}`}
            >
              無法檢驗/其他
            </button>
          </div>
        </section>

        {/* Source Section */}
        <section>
           <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">參考依據</h3>
           <div className="flex gap-2">
             {(['contract', 'presale', 'other'] as const).map(type => (
               <button
                 key={type}
                 onClick={() => updateField('sourceType', type)}
                 className={`px-3 py-1.5 rounded-full text-xs font-bold border ${data.sourceType === type ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white border-gray-300 text-gray-500'}`}
               >
                 {type === 'contract' ? '合約' : type === 'presale' ? '預售' : '其他'}
               </button>
             ))}
           </div>
        </section>

        {/* Description Section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">缺失描述 / 備註</h3>
            {isProcessingAI && <span className="text-xs text-primary animate-pulse flex items-center gap-1"><Wand2 size={12}/> AI 處理中...</span>}
          </div>
          <div className="relative">
            <textarea
              className="w-full p-4 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[120px] resize-none"
              placeholder="請輸入描述，或使用語音/照片AI分析..."
              value={data.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
            />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`absolute bottom-3 right-3 p-2 rounded-full shadow-lg transition-all ${isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            >
              <Mic size={20} />
            </button>
          </div>
        </section>

        {/* Photos Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
             <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">照片紀錄 ({photos.length})</h3>
             <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-primary text-sm font-bold bg-orange-50 px-3 py-1.5 rounded-full"
             >
               <Camera size={16} /> 新增照片
             </button>
             <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} capture="environment" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {photos.map(photo => (
              <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-gray-200 shadow-sm aspect-square bg-gray-100">
                <img 
                  src={URL.createObjectURL(photo.blob)} 
                  alt="inspection" 
                  className="w-full h-full object-cover" 
                />
                
                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${photo.type === PhotoType.DEFECT ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {photo.type === PhotoType.DEFECT ? '缺失' : '紀錄'}
                  </span>
                  {photo.isAnnotated && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500 text-white">已標註</span>}
                </div>

                {/* Actions Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                   <button onClick={() => setEditingPhoto(photo)} className="p-2 bg-white rounded-full text-gray-800 hover:text-primary"><Edit3 size={18} /></button>
                   <button onClick={() => handleDeletePhoto(photo.id)} className="p-2 bg-white rounded-full text-red-500 hover:bg-red-50"><Trash2 size={18} /></button>
                </div>
                
                {/* Mobile Friendly Actions */}
                 <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex justify-end gap-2 md:hidden">
                    <button onClick={() => setEditingPhoto(photo)} className="text-white p-1"><Edit3 size={16} /></button>
                 </div>
              </div>
            ))}
             {photos.length === 0 && (
              <div className="col-span-2 py-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl text-gray-400">
                <ImageIcon size={32} className="mb-2 opacity-50" />
                <span className="text-sm">尚無照片</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DetailModal;