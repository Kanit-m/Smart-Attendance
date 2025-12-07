import React from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, LayoutDashboard, History, Building2, LogOut, ArrowLeft } from 'lucide-react';

type TeacherView = 'check' | 'dashboard' | 'room_history' | 'school_dashboard';

interface TeacherBottomNavProps {
    currentView: TeacherView;
    onViewChange: (view: TeacherView) => void;
    onLogout: () => void;
    onBackToAdmin?: () => void;
}

export const TeacherBottomNav: React.FC<TeacherBottomNavProps> = ({
    currentView,
    onViewChange,
    onLogout,
    onBackToAdmin,
}) => {
    // Use portal to render at body level
    return createPortal(
        <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden no-print">
            {/* Background */}
            <div className="absolute inset-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-lg" />

            {/* Safe area padding for iOS */}
            <div className="relative px-1 pb-safe">
                <div className="flex items-center justify-between h-16 max-w-lg mx-auto">

                    {/* ภาพรวม */}
                    <button
                        onClick={() => onViewChange('school_dashboard')}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'school_dashboard' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}
                    >
                        <Building2 className={`w-5 h-5 transition-transform ${currentView === 'school_dashboard' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">ภาพรวม</span>
                    </button>

                    {/* สรุป */}
                    <button
                        onClick={() => onViewChange('dashboard')}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'dashboard' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}
                    >
                        <LayoutDashboard className={`w-5 h-5 transition-transform ${currentView === 'dashboard' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">สรุป</span>
                    </button>

                    {/* เช็คชื่อ - Center Big Button */}
                    <div className="relative -mt-5">
                        <button
                            onClick={() => onViewChange('check')}
                            className={`
                w-14 h-14 rounded-full flex items-center justify-center
                shadow-lg transition-all duration-300 ease-out
                ${currentView === 'check'
                                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 scale-105 ring-2 ring-emerald-300 ring-offset-2'
                                    : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:scale-105'
                                }
              `}
                        >
                            <ClipboardList className="w-7 h-7 text-white" />
                        </button>
                    </div>

                    {/* รายงาน */}
                    <button
                        onClick={() => onViewChange('room_history')}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'room_history' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}
                    >
                        <History className={`w-5 h-5 transition-transform ${currentView === 'room_history' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">รายงาน</span>
                    </button>

                    {/* กลับ Admin หรือ ออก */}
                    {onBackToAdmin ? (
                        <button
                            onClick={onBackToAdmin}
                            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] text-indigo-500 active:bg-indigo-50"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span className="text-[10px] font-medium">กลับ</span>
                        </button>
                    ) : (
                        <button
                            onClick={onLogout}
                            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] text-red-400 active:bg-red-50 active:text-red-600"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="text-[10px] font-medium">ออก</span>
                        </button>
                    )}

                </div>
            </div>
        </nav>,
        document.body
    );
};
