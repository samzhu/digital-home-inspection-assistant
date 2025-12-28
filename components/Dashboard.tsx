import React from 'react';
import { CheckItem } from '../types';

interface Props {
  items: CheckItem[];
}

const Dashboard: React.FC<Props> = ({ items }) => {
  const total = items.length;
  const passed = items.filter(i => i.status === 'pass').length;
  const failed = items.filter(i => i.status === 'fail').length;
  const pending = items.filter(i => i.status === 'pending').length;
  
  const progress = total === 0 ? 0 : Math.round((passed / total) * 100);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">檢查進度</h2>
          <p className="text-gray-500 text-sm">共 {total} 個項目</p>
        </div>
        <div className="relative w-20 h-20">
          <svg className="w-full h-full" viewBox="0 0 36 36">
            <path
              className="text-gray-100"
              strokeDasharray="100, 100"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="text-safety-orange"
              strokeDasharray={`${progress}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <text x="18" y="20.35" className="text-[8px] font-bold" textAnchor="middle" fill="#374151">
              {progress}%
            </text>
          </svg>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 p-3 rounded-xl border border-green-100">
          <p className="text-xs text-green-600 font-medium">合格</p>
          <p className="text-xl font-bold text-green-700">{passed}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100">
          <p className="text-xs text-red-600 font-medium">缺失</p>
          <p className="text-xl font-bold text-red-700">{failed}</p>
        </div>
        <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
          <p className="text-xs text-orange-600 font-medium">待驗</p>
          <p className="text-xl font-bold text-orange-700">{pending}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;