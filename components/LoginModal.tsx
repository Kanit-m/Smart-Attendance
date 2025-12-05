import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2, Shield, GraduationCap } from 'lucide-react';

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

    const isAdmin = buttonColor === 'red';
    const accentColor = isAdmin ? '#ef4444' : '#22c55e';

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
        } catch (err: any) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-200 p-4 animate-fade-in">
            <div className="login-container" style={{ '--accent-color': accentColor } as React.CSSProperties}>
                <div className="login-border-spin"></div>

                <div className="login-box">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-full hover:bg-gray-100"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="login-form">
                        <div className="login-logo" style={{ borderColor: accentColor }}>
                            {isAdmin ? (
                                <Shield className="w-8 h-8" style={{ color: accentColor }} />
                            ) : (
                                <GraduationCap className="w-8 h-8" style={{ color: accentColor }} />
                            )}
                        </div>

                        <h2 className="login-header">{title}</h2>

                        {error && (
                            <div className="login-error">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="w-full space-y-4">
                            <input
                                ref={inputRef}
                                type="text"
                                value={username}
                                onChange={e => {
                                    setUsername(e.target.value);
                                    if (error) setError(null);
                                }}
                                disabled={isLoading}
                                className="login-input"
                                placeholder="ชื่อผู้ใช้"
                                autoComplete="username"
                            />

                            <input
                                type="password"
                                value={password}
                                onChange={e => {
                                    setPassword(e.target.value);
                                    if (error) setError(null);
                                }}
                                disabled={isLoading}
                                className="login-input"
                                placeholder="รหัสผ่าน"
                                autoComplete="current-password"
                            />

                            <div className="flex items-center gap-2">
                                <input
                                    id="remember-me"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    disabled={isLoading}
                                    className="w-4 h-4 rounded bg-gray-100 border-gray-300 accent-blue-500"
                                />
                                <label htmlFor="remember-me" className="text-sm text-gray-600 cursor-pointer select-none">
                                    จำชื่อผู้ใช้
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="login-button"
                                style={{ '--btn-color': accentColor } as React.CSSProperties}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>กำลังตรวจสอบ...</span>
                                    </>
                                ) : (
                                    <span>เข้าสู่ระบบ</span>
                                )}
                            </button>
                        </form>

                        <p className="login-footer">
                            Smart Attendance System © {new Date().getFullYear()}
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
        .login-container {
          --form-width: 340px;
          --box-color: #e0e5ec;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
          overflow: hidden;
          background: var(--box-color);
          border-radius: 24px;
          width: calc(var(--form-width) + 4px);
          padding: 2px;
          box-shadow: 12px 12px 24px #b8bec7, -12px -12px 24px #ffffff;
        }

        .login-border-spin {
          position: absolute;
          inset: -50px;
          z-index: 0;
          background: conic-gradient(from 0deg, transparent 60%, var(--accent-color), transparent 100%);
          animation: spin 3s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        .login-box {
          background: var(--box-color);
          border-radius: 22px;
          padding: 32px 28px;
          width: var(--form-width);
          position: relative;
          z-index: 10;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .login-logo {
          width: 70px;
          height: 70px;
          background: var(--box-color);
          box-shadow: 6px 6px 12px #b8bec7, -6px -6px 12px #ffffff, inset 2px 2px 4px #ffffff, inset -2px -2px 4px #b8bec7;
          border-radius: 20px;
          border: none;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .login-header {
          font-size: 22px;
          font-weight: bold;
          color: #1f2937;
          text-align: center;
          margin-bottom: 8px;
        }

        .login-error {
          width: 100%;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          color: #dc2626;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .login-input {
          width: 100%;
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          background: var(--box-color);
          color: #1f2937;
          outline: none;
          font-size: 15px;
          transition: all 0.3s ease;
          box-shadow: inset 4px 4px 8px #b8bec7, inset -4px -4px 8px #ffffff;
        }

        .login-input::placeholder { color: #9ca3af; }
        .login-input:focus { 
          box-shadow: inset 6px 6px 12px #b8bec7, inset -6px -6px 12px #ffffff;
        }
        .login-input:disabled { opacity: 0.6; cursor: not-allowed; }

        .login-button {
          width: 100%;
          height: 48px;
          border: none;
          border-radius: 24px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          background: var(--btn-color);
          color: white;
          transition: all 0.3s ease;
          margin-top: 8px;
          box-shadow: 6px 6px 12px #b8bec7, -6px -6px 12px #ffffff;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 8px 8px 16px #b8bec7, -8px -8px 16px #ffffff;
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: inset 4px 4px 8px rgba(0,0,0,0.2);
        }

        .login-button:disabled { opacity: 0.7; cursor: not-allowed; }

        .login-footer {
          margin-top: 16px;
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
        }
      `}</style>
        </div>
    );
};
