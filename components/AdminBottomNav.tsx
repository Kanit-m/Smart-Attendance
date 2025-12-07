import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Users, Plus, Settings, UserPlus, GraduationCap, Pencil, LogOut } from 'lucide-react';

interface AdminBottomNavProps {
    activeTab: number;
    onTabChange: (tab: number) => void;
    onLogout: () => void;
}

interface SpeedDialItem {
    id: number;
    label: string;
    icon: React.ReactNode;
    color: string;
}

export const AdminBottomNav: React.FC<AdminBottomNavProps> = ({
    activeTab,
    onTabChange,
    onLogout,
}) => {
    const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);

    const speedDialItems: SpeedDialItem[] = [
        { id: 2, label: 'เพิ่มนักเรียน', icon: <UserPlus className="w-5 h-5" />, color: 'bg-blue-500' },
        { id: 3, label: 'เพิ่มครู', icon: <GraduationCap className="w-5 h-5" />, color: 'bg-emerald-500' },
        { id: 4, label: 'ลบ/แก้ไข', icon: <Pencil className="w-5 h-5" />, color: 'bg-amber-500' },
    ];

    const handleSpeedDialItemClick = (tabId: number) => {
        setIsSpeedDialOpen(false);
        onTabChange(tabId);
    };

    // Check if current tab is one of the speed dial tabs
    const isSpeedDialTabActive = [2, 3, 4].includes(activeTab);

    // Use portal to render at body level (fixes fixed positioning inside overflow containers)
    return createPortal(
        <>
            {/* Speed Dial Overlay */}
            {isSpeedDialOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] md:hidden"
                    onClick={() => setIsSpeedDialOpen(false)}
                />
            )}

            {/* Speed Dial Items - Circular Icons */}
            <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[101] md:hidden flex items-center gap-4 transition-all duration-300 ${isSpeedDialOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                {speedDialItems.map((item, index) => (
                    <div
                        key={item.id}
                        className="flex flex-col items-center gap-1"
                        style={{
                            transitionDelay: isSpeedDialOpen ? `${index * 60}ms` : '0ms',
                            transform: isSpeedDialOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.5)',
                            opacity: isSpeedDialOpen ? 1 : 0,
                            transition: 'all 0.3s ease-out',
                        }}
                    >
                        <button
                            onClick={() => handleSpeedDialItemClick(item.id)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg text-white transition-all duration-200 ${item.color} hover:scale-110 active:scale-95`}
                        >
                            {item.icon}
                        </button>
                        <span className="text-[10px] font-medium text-white bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap">{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Bottom Navigation Bar - Fixed at bottom with highest z-index */}
            <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden no-print">
                {/* Background */}
                <div className="absolute inset-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-lg" />

                {/* Safe area padding for iOS */}
                <div className="relative px-1 pb-safe">
                    <div className="flex items-center justify-between h-16 max-w-lg mx-auto">

                        {/* หน้าแรก */}
                        <button
                            onClick={() => { setIsSpeedDialOpen(false); onTabChange(0); }}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${activeTab === 0 ? 'text-white bg-[#821D30]' : 'text-gray-400'}`}
                        >
                            <Home className={`w-5 h-5 ${activeTab === 0 ? 'scale-110' : ''} transition-transform`} />
                            <span className="text-[10px] font-medium">หน้าแรก</span>
                        </button>

                        {/* รายชื่อ */}
                        <button
                            onClick={() => { setIsSpeedDialOpen(false); onTabChange(1); }}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${activeTab === 1 ? 'text-white bg-[#821D30]' : 'text-gray-400'}`}
                        >
                            <Users className={`w-5 h-5 ${activeTab === 1 ? 'scale-110' : ''} transition-transform`} />
                            <span className="text-[10px] font-medium">รายชื่อ</span>
                        </button>

                        {/* FAB Button (center) */}
                        <div className="relative -mt-5">
                            <button
                                onClick={() => setIsSpeedDialOpen(!isSpeedDialOpen)}
                                className={`
                  w-14 h-14 rounded-full flex items-center justify-center
                  shadow-lg transition-all duration-300 ease-out
                  ${isSpeedDialOpen
                                        ? 'bg-gray-800 rotate-45 scale-105'
                                        : isSpeedDialTabActive
                                            ? 'bg-[#821D30] scale-105 ring-2 ring-[#FB6090] ring-offset-2'
                                            : 'bg-[#821D30] hover:scale-105'
                                    }
                `}
                            >
                                <Plus className="w-7 h-7 text-white transition-transform duration-300" />
                            </button>
                        </div>

                        {/* ตั้งค่า */}
                        <button
                            onClick={() => { setIsSpeedDialOpen(false); onTabChange(5); }}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] ${activeTab === 5 ? 'text-white bg-[#821D30]' : 'text-gray-400'}`}
                        >
                            <Settings className={`w-5 h-5 ${activeTab === 5 ? 'scale-110' : ''} transition-transform`} />
                            <span className="text-[10px] font-medium">ตั้งค่า</span>
                        </button>

                        {/* ออกจากระบบ */}
                        <button
                            onClick={() => { setIsSpeedDialOpen(false); onLogout(); }}
                            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] text-red-400 active:bg-red-50 active:text-red-600"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="text-[10px] font-medium">ออก</span>
                        </button>

                    </div>
                </div>
            </nav>
        </>,
        document.body
    );
};
