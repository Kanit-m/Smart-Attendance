import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, LayoutDashboard, History, Building2, LogOut, ArrowLeft, Save, Loader2, CircleUser, X } from 'lucide-react';

type TeacherView = 'check' | 'dashboard' | 'room_history' | 'school_dashboard';

interface TeacherBottomNavProps {
    currentView: TeacherView;
    onViewChange: (view: TeacherView) => void;
    onLogout: () => void;
    onBackToAdmin?: () => void;
    hasChanges?: boolean;
    onSave?: () => void;
    saving?: boolean;
    userName?: string;
    userClass?: string;
    isDataStale?: boolean;
    onRefresh?: () => void;
    missingDaysCount?: number;
    onShowMissingDays?: () => void;
}

export const TeacherBottomNav: React.FC<TeacherBottomNavProps> = ({
    currentView,
    onViewChange,
    onLogout,
    onBackToAdmin,
    hasChanges = false,
    onSave,
    saving = false,
    userName = 'ครู',
    userClass = '',
    isDataStale = false,
    onRefresh,
    missingDaysCount = 0,
    onShowMissingDays,
}) => {
    const [showProfile, setShowProfile] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        if (onRefresh) {
            onRefresh();
        } else {
            // Fallback: Clear all cached data and reload
            localStorage.removeItem('cached_students');
            localStorage.removeItem('cached_students_time');
            localStorage.removeItem('cached_students_version');
            localStorage.removeItem('cached_holidays');
            localStorage.removeItem('cached_holidays_time');
            localStorage.removeItem('cached_activities');
            localStorage.removeItem('cached_activities_time');
            setTimeout(() => window.location.reload(), 500);
        }
    };

    // Show Save button when on check view (always), change color based on hasChanges
    const isOnCheckView = currentView === 'check' && onSave;

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
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'school_dashboard' ? 'text-white bg-[#003060]' : 'text-gray-400'}`}
                    >
                        <Building2 className={`w-5 h-5 transition-transform ${currentView === 'school_dashboard' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">ภาพรวม</span>
                    </button>

                    {/* สรุป */}
                    <button
                        onClick={() => onViewChange('dashboard')}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'dashboard' ? 'text-white bg-[#003060]' : 'text-gray-400'}`}
                    >
                        <LayoutDashboard className={`w-5 h-5 transition-transform ${currentView === 'dashboard' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">สรุป</span>
                    </button>

                    {/* Center Button - เช็คชื่อ หรือ บันทึก */}
                    <div className="relative -mt-5">
                        {isOnCheckView ? (
                            <button
                                onClick={onSave}
                                disabled={saving}
                                className={`
                                    w-14 h-14 rounded-full flex items-center justify-center
                                    shadow-lg transition-all duration-300 ease-out active:scale-95
                                    disabled:opacity-70
                                    ${hasChanges
                                        ? 'bg-emerald-500 hover:bg-emerald-600 ring-4 ring-emerald-200 ring-offset-2'
                                        : 'bg-violet-500 hover:bg-violet-600 ring-2 ring-violet-300 ring-offset-2'
                                    }
                                `}
                                style={{ boxShadow: hasChanges ? '0 4px 20px rgba(16, 185, 129, 0.5)' : '0 4px 15px rgba(139, 92, 246, 0.4)' }}
                            >
                                {saving ? (
                                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                                ) : (
                                    <Save className="w-7 h-7 text-white" />
                                )}
                            </button>
                        ) : (
                            <div className="relative">
                                <button
                                    onClick={() => onViewChange('check')}
                                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ease-out bg-white border-2 border-[#003060] hover:bg-[#003060] hover:border-[#003060] group"
                                    style={{ boxShadow: '0 2px 10px rgba(0, 48, 96, 0.2)' }}
                                >
                                    <ClipboardList className="w-7 h-7 text-[#003060] group-hover:text-white transition-colors" />
                                </button>
                                {/* Missing Days Badge */}
                                {missingDaysCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 shadow-lg animate-pulse pointer-events-none">
                                        {missingDaysCount > 9 ? '9+' : missingDaysCount}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* รายงาน */}
                    <button
                        onClick={() => onViewChange('room_history')}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${currentView === 'room_history' ? 'text-white bg-[#003060]' : 'text-gray-400'}`}
                    >
                        <History className={`w-5 h-5 transition-transform ${currentView === 'room_history' ? 'scale-110' : ''}`} />
                        <span className="text-[10px] font-medium">รายงาน</span>
                    </button>

                    {/* กลับ Admin หรือ โปรไฟล์ */}
                    {onBackToAdmin ? (
                        <button
                            onClick={onBackToAdmin}
                            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] text-[#003060] active:bg-[#68BBE3]/20"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span className="text-[10px] font-medium">กลับ</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowProfile(true)}
                            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] text-gray-400 active:bg-gray-50"
                        >
                            <CircleUser className="w-5 h-5" />
                            <span className="text-[10px] font-medium">โปรไฟล์</span>
                        </button>
                    )}

                </div>
            </div>

            {/* Profile Modal */}
            {showProfile && (
                <div
                    className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowProfile(false)}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up relative"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setShowProfile(false)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>

                        {/* User Info */}
                        <div className="flex items-center gap-4 mb-6 p-4 bg-gradient-to-r from-[#003060] to-[#004a8c] rounded-2xl">
                            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                                <CircleUser className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <div className="text-white font-bold text-lg">{userName}</div>
                                {userClass && (
                                    <div className="text-white/70 text-sm">ประจำชั้น {userClass}</div>
                                )}
                            </div>
                        </div>

                        {/* Refresh Cache Button - Color changes based on staleness */}
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className={`w-full flex items-center justify-center gap-2 py-3.5 mb-3 font-bold rounded-xl transition-all duration-500 active:scale-[0.98] ${isRefreshing
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : isDataStale
                                    ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white animate-pulse shadow-lg'
                                    : 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-md'
                                }`}
                        >
                            <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>
                                {isRefreshing ? 'กำลังรีเฟรช...' : isDataStale ? '⚠️ อัพเดตข้อมูล' : '✓ อัพเดตข้อมูล'}
                            </span>
                        </button>

                        {/* Logout Button */}
                        <button
                            onClick={() => {
                                setShowProfile(false);
                                onLogout();
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition-all active:scale-[0.98]"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>ออกจากระบบ</span>
                        </button>
                    </div>
                </div>
            )}
        </nav>,
        document.body
    );
};
