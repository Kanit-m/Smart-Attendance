import React, { useState, useEffect } from 'react';
import { School, UserCog, GraduationCap, LogOut, RefreshCw } from 'lucide-react';
import { Role } from '../types';

interface HeaderProps {
  currentUser: { role: Role; name: string } | null;
  onLoginAdmin: () => void;
  onLoginTeacher: () => void;
  onLogout: () => void;
  onRefresh?: () => void;
}

// Embedded logo path
const SCHOOL_LOGO = '/Ps logo.png';

export const Header: React.FC<HeaderProps> = ({ currentUser, onLoginAdmin, onLoginTeacher, onLogout, onRefresh }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-brand-200 transition-all no-print shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center py-3 md:h-20 gap-3 md:gap-0">

          {/* Branding Section */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center shadow-md shrink-0 overflow-hidden">
                <img src={SCHOOL_LOGO} alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg md:text-xl font-bold text-official-blue leading-tight tracking-tight">Smart Attendance (A.T)</h1>
                <h2 className="text-xs md:text-sm font-medium text-brand-600">โรงเรียนประชาสามัคคี</h2>
              </div>
            </div>

            {/* Time on Mobile (Top Right) */}
            <div className="md:hidden text-right">
              <div className="text-sm font-bold text-official-blue font-mono">{currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="text-[10px] text-brand-500">{currentTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">

            {/* Time on Desktop */}
            <div className="hidden md:flex flex-col items-end text-right mr-4 border-r border-brand-100 pr-4 py-1">
              <span className="text-xs font-medium text-brand-500 uppercase tracking-wide">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: '2-digit' })}</span>
              <span className="text-lg font-bold text-brand-800 font-mono leading-none">{currentTime.toLocaleTimeString('th-TH')}</span>
            </div>

            {!currentUser ? (
              <div className="flex gap-2 w-full md:w-auto">
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-white border border-brand-200 hover:bg-brand-50 text-brand-600 text-sm font-medium rounded-lg transition-all shadow-sm"
                    title="อัปเดตข้อมูล"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onLoginTeacher}
                  className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
                >
                  <GraduationCap className="w-4 h-4 mr-2" />
                  ครู
                </button>
                <button
                  onClick={onLoginAdmin}
                  className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
                >
                  <UserCog className="w-4 h-4 mr-2" />
                  ผู้ดูแล
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end bg-brand-50 md:bg-transparent p-1 md:p-0 rounded-lg md:rounded-none border md:border-none border-brand-100">
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="p-2 text-brand-400 hover:text-brand-600 hover:bg-brand-100 rounded-lg transition-all"
                    title="อัปเดตข้อมูล"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                )}
                <div className="flex items-center gap-2 px-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${currentUser.role === Role.ADMIN ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {currentUser.role === Role.ADMIN ? <UserCog className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-brand-800 leading-tight">{currentUser.name}</span>
                    <span className="text-[10px] text-brand-600 leading-tight">{currentUser.role === Role.ADMIN ? 'ผู้ดูแลระบบ' : 'คุณครูประจำชั้น'}</span>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-brand-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="ออกจากระบบ"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};