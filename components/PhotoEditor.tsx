import React, { useRef, useEffect, useState } from 'react';
import { Check, X, Undo, Type, Circle, ArrowRight } from 'lucide-react';

interface PhotoEditorProps {
  imageBlob: Blob;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
}

enum Tool {
  PEN = 'PEN',
  CIRCLE = 'CIRCLE',
  ARROW = 'ARROW'
}

const PhotoEditor: React.FC<PhotoEditorProps> = ({ imageBlob, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>(Tool.PEN);
  const [color, setColor] = useState('#FF0000'); // Default Red
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // Load image onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      // Fit logic
      const maxWidth = window.innerWidth;
      const maxHeight = window.innerHeight * 0.7; // Leave room for toolbar
      
      let width = img.width;
      let height = img.height;

      // Simple aspect ratio scaling
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      saveState(); // Save initial state
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [imageBlob]);

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      setHistory(prev => [...prev.slice(-9), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    }
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];
    setHistory(newHistory);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && previousState) {
      ctx.putImageData(previousState, 0, 0);
    }
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    setStartPos(pos);
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const currentPos = getPos(e);

    // If Pen, draw immediately
    if (activeTool === Tool.PEN) {
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
    } else {
      // For shapes, we need to redraw the history state + the new shape each frame
      // This is a simple implementation. For production, use a second "preview" canvas layer.
      // Here, we just rely on standard canvas behavior which might leave trails if not cleared.
      // To fix trails properly without layers: restore last history item then draw.
      const lastState = history[history.length - 1];
      if (lastState) {
        ctx.putImageData(lastState, 0, 0);
      }
      
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;

      if (activeTool === Tool.CIRCLE) {
        const radius = Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2));
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === Tool.ARROW) {
        // Draw line
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(currentPos.y - startPos.y, currentPos.x - startPos.x);
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(currentPos.x, currentPos.y);
        ctx.lineTo(currentPos.x - headLen * Math.cos(angle - Math.PI / 6), currentPos.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(currentPos.x, currentPos.y);
        ctx.lineTo(currentPos.x - headLen * Math.cos(angle + Math.PI / 6), currentPos.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) onSave(blob);
      }, 'image/jpeg', 0.85);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
        <button onClick={onCancel} className="p-2"><X /></button>
        <span className="font-bold">Edit Photo</span>
        <button onClick={handleSave} className="p-2 text-primary font-bold"><Check /></button>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-black overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="max-w-full max-h-full"
        />
      </div>

      {/* Toolbar */}
      <div className="bg-gray-900 p-4 pb-8 flex flex-col gap-4">
        <div className="flex justify-center gap-6">
          <button onClick={() => setActiveTool(Tool.PEN)} className={`p-3 rounded-full ${activeTool === Tool.PEN ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300'}`}><Type size={20} /></button>
          <button onClick={() => setActiveTool(Tool.CIRCLE)} className={`p-3 rounded-full ${activeTool === Tool.CIRCLE ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300'}`}><Circle size={20} /></button>
          <button onClick={() => setActiveTool(Tool.ARROW)} className={`p-3 rounded-full ${activeTool === Tool.ARROW ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300'}`}><ArrowRight size={20} /></button>
          <button onClick={handleUndo} className="p-3 rounded-full bg-gray-700 text-gray-300"><Undo size={20} /></button>
        </div>
        <div className="flex justify-center gap-4">
          {['#FF0000', '#FFFF00', '#FFFFFF'].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PhotoEditor;