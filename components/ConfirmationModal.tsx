import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isLoading?: boolean;
  isDangerous?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading = false,
  isDangerous = false,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        <div className={`p-4 flex justify-between items-center border-b ${isDangerous ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <h3 className={`font-bold text-lg flex items-center gap-2 ${isDangerous ? 'text-red-700' : 'text-gray-800'}`}>
            {isDangerous && <AlertTriangle className="w-5 h-5" />}
            {title}
          </h3>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600 transition rounded-full hover:bg-white/50 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 text-base leading-relaxed mb-6">
            {message}
          </p>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-white font-medium shadow-sm hover:shadow transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};