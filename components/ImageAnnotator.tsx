import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, RotateCw, Save, Square, Circle as CircleIcon, MousePointer2, Pencil, Type } from 'lucide-react';
import { blobToDataURL } from '../utils/image';

interface Props {
  imageBlob: Blob;
  initialData?: any;
  onSave: (data: any, updatedBlob: Blob) => void;
  onCancel: () => void;
}

declare const fabric: any;

const ImageAnnotator: React.FC<Props> = ({ imageBlob, initialData, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const [activeColor, setActiveColor] = useState('#FF0000');
  const [tool, setTool] = useState<'select' | 'pencil' | 'circle' | 'arrow'>('pencil');

  useEffect(() => {
    if (!canvasRef.current) return;

    const initFabric = async () => {
      const dataUrl = await blobToDataURL(imageBlob);
      
      // Calculate responsive dimensions
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight - 160; // Leave room for UI

      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const scale = Math.min(screenWidth / img.width, screenHeight / img.height);
        const width = img.width * scale;
        const height = img.height * scale;

        fabricRef.current = new fabric.Canvas(canvasRef.current, {
          width,
          height,
          isDrawingMode: true
        });

        fabric.Image.fromURL(dataUrl, (fImg: any) => {
          fImg.scale(scale);
          fabricRef.current.setBackgroundImage(fImg, fabricRef.current.renderAll.bind(fabricRef.current));
          
          if (initialData) {
            fabricRef.current.loadFromJSON(initialData, fabricRef.current.renderAll.bind(fabricRef.current));
          }
        });

        // Configure brush
        fabricRef.current.freeDrawingBrush = new fabric.PencilBrush(fabricRef.current);
        fabricRef.current.freeDrawingBrush.width = 5;
        fabricRef.current.freeDrawingBrush.color = activeColor;
      };
    };

    initFabric();

    return () => {
      fabricRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.isDrawingMode = tool === 'pencil';
    fabricRef.current.freeDrawingBrush.color = activeColor;
  }, [tool, activeColor]);

  const addCircle = () => {
    const circle = new fabric.Circle({
      radius: 40,
      fill: 'transparent',
      stroke: activeColor,
      strokeWidth: 4,
      left: 100,
      top: 100
    });
    fabricRef.current.add(circle);
    setTool('select');
  };

  const addArrow = () => {
    // Simplified arrow using a path
    const path = new fabric.Path('M 0 0 L 50 25 L 0 50 L 10 25 z', {
      left: 100,
      top: 100,
      fill: activeColor,
      stroke: activeColor,
      strokeWidth: 2,
      scaleX: 1.5,
      scaleY: 1.5
    });
    fabricRef.current.add(path);
    setTool('select');
  };

  const handleSave = () => {
    const json = fabricRef.current.toJSON();
    fabricRef.current.getElement().toBlob((blob: Blob) => {
      onSave(json, blob);
    }, 'image/jpeg', 0.8);
  };

  const undo = () => {
    const objects = fabricRef.current.getObjects();
    if (objects.length > 0) {
      fabricRef.current.remove(objects[objects.length - 1]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="p-4 flex justify-between items-center bg-gray-900 text-white">
        <button onClick={onCancel} className="p-2"><ArrowLeft /></button>
        <h2 className="font-bold">影像標註</h2>
        <button onClick={handleSave} className="bg-safety-orange px-4 py-2 rounded-lg font-bold">儲存</button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} />
      </div>

      <div className="p-4 bg-gray-900 grid grid-cols-4 gap-4 thumb-zone">
        <div className="col-span-4 flex justify-center gap-6 mb-2">
          {['#FF0000', '#FFFF00', '#FFFFFF'].map(color => (
            <button
              key={color}
              className={`w-8 h-8 rounded-full border-2 ${activeColor === color ? 'border-blue-400' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
              onClick={() => setActiveColor(color)}
            />
          ))}
        </div>
        <button 
          onClick={() => setTool('pencil')} 
          className={`p-3 rounded-lg flex flex-col items-center gap-1 ${tool === 'pencil' ? 'bg-safety-orange text-white' : 'text-gray-400'}`}
        >
          <Pencil size={20} />
          <span className="text-xs">畫筆</span>
        </button>
        <button 
          onClick={addCircle} 
          className={`p-3 rounded-lg flex flex-col items-center gap-1 ${tool === 'circle' ? 'bg-safety-orange text-white' : 'text-gray-400'}`}
        >
          <CircleIcon size={20} />
          <span className="text-xs">圓圈</span>
        </button>
        <button 
          onClick={addArrow} 
          className={`p-3 rounded-lg flex flex-col items-center gap-1 ${tool === 'arrow' ? 'bg-safety-orange text-white' : 'text-gray-400'}`}
        >
          <MousePointer2 size={20} />
          <span className="text-xs">箭頭</span>
        </button>
        <button 
          onClick={undo} 
          className="p-3 rounded-lg flex flex-col items-center gap-1 text-gray-400"
        >
          <RotateCcw size={20} />
          <span className="text-xs">撤銷</span>
        </button>
      </div>
    </div>
  );
};

export default ImageAnnotator;