import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onLogin: (user: string, pass: string) => Promise<void>;
  buttonColor: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, title, onLogin, buttonColor }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset fields and focus when modal opens
  useEffect(() => {
    if (isOpen) {
      const savedUser = localStorage.getItem('savedUsername');
      if (savedUser) {
        setUsername(savedUser);
        setRememberMe(true);
      } else {
        setUsername('');
        setRememberMe(false);
      }
      setPassword('');
      setError(null);
      setIsLoading(false);
      
      // Small delay to ensure DOM is ready for focus
      setTimeout(() => {
        if (!localStorage.getItem('savedUsername')) {
          inputRef.current?.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    if (rememberMe) {
      localStorage.setItem('savedUsername', username);
    } else {
      localStorage.removeItem('savedUsername');
    }

    try {
      await onLogin(username, password);
      // If successful, the modal will be closed by the parent component unmounting it
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        <div className={`p-4 flex justify-between items-center border-b ${buttonColor === 'red' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <h3 className={`font-bold text-lg ${buttonColor === 'red' ? 'text-red-700' : 'text-green-700'}`}>{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition rounded-full hover:bg-white/50 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-8">
          {/* Error Notification */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-600">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <input 
                  ref={inputRef}
                  type="text" 
                  value={username} 
                  onChange={e => {
                    setUsername(e.target.value);
                    if(error) setError(null);
                  }}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:text-gray-500 bg-white text-black placeholder-gray-400"
                  placeholder="เช่น somchai01"
                  autoComplete="username"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => {
                  setPassword(e.target.value);
                  if(error) setError(null);
                }}
                disabled={isLoading}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:text-gray-500 bg-white text-black placeholder-gray-400"
                placeholder="••••••"
                autoComplete="current-password"
              />
            </div>
            
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 cursor-pointer select-none">
                จำชื่อผู้ใช้
              </label>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-lg text-white font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none ${buttonColor === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> กำลังตรวจสอบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};