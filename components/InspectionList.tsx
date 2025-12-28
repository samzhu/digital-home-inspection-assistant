import React, { useState } from 'react';
import { CheckItem, InspectionStatus } from '../types';
import { ChevronRight, Camera, FileText } from 'lucide-react';

interface InspectionListProps {
  items: CheckItem[];
  onItemClick: (item: CheckItem) => void;
}

const InspectionList: React.FC<InspectionListProps> = ({ items, onItemClick }) => {
  // Simplified rendering since complex grouping fields are removed from CheckItem
  // In a real scenario, we would join with groups/subcategories, but here we just list or group by ID
  
  if (items.length === 0) {
    return (
      <div className="p-10 text-center text-gray-500">
        <p>此分類尚無檢查項目。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {items.map(item => (
        <div 
          key={item.id} 
          onClick={() => onItemClick(item)}
          className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-100 active:bg-gray-50 transition touch-manipulation cursor-pointer hover:shadow-md"
        >
          <div className="flex-1 min-w-0 pr-2">
            <div className="font-medium text-gray-900 truncate">{item.title}</div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              {(item.images?.length || 0) > 0 && (
                <span className="flex items-center gap-1 text-blue-500">
                  <Camera size={12} /> {item.images.length}
                </span>
              )}
              {item.description && (
                <span className="flex items-center gap-1 text-gray-500">
                  <FileText size={12} /> 有備註
                </span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0">
            {item.status === InspectionStatus.PASS && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">合格</span>
            )}
            {item.status === InspectionStatus.FAIL && (
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">缺失</span>
            )}
            {item.status === InspectionStatus.OTHER && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">N/A</span>
            )}
            {item.status === InspectionStatus.PENDING && (
              <div className="w-3 h-3 rounded-full bg-gray-200" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default InspectionList;