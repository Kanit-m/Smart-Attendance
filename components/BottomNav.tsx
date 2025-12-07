import React from 'react';
import { Home, ClipboardList, Settings, User } from 'lucide-react';

type View = 'landing' | 'dashboard' | 'admin' | 'teacher';

interface NavItem {
    id: View;
    label: string;
    icon: React.ReactNode;
    requiresAuth?: boolean;
    allowedRoles?: ('admin' | 'teacher')[];
}

interface BottomNavProps {
    currentView: View;
    onNavigate: (view: View) => void;
    isLoggedIn: boolean;
    userRole?: 'admin' | 'teacher' | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({
    currentView,
    onNavigate,
    isLoggedIn,
    userRole,
}) => {
    const navItems: NavItem[] = [
        {
            id: 'dashboard',
            label: 'หน้าหลัก',
            icon: <Home className="w-5 h-5" />,
        },
        {
            id: 'teacher',
            label: 'ครู',
            icon: <ClipboardList className="w-5 h-5" />,
            requiresAuth: true,
            allowedRoles: ['admin', 'teacher'],
        },
        {
            id: 'admin',
            label: 'ผู้ดูแล',
            icon: <Settings className="w-5 h-5" />,
            requiresAuth: true,
            allowedRoles: ['admin'],
        },
    ];

    // Filter items based on auth and role
    const visibleItems = navItems.filter(item => {
        if (!item.requiresAuth) return true;
        if (!isLoggedIn) return false;
        if (item.allowedRoles && userRole) {
            return item.allowedRoles.includes(userRole);
        }
        return false;
    });

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden no-print">
            {/* Backdrop blur background */}
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-t border-gray-200 shadow-lg" />

            {/* Safe area padding for iOS */}
            <div className="relative px-4 pb-safe">
                <div className="flex items-center justify-around h-16 max-w-md mx-auto">
                    {visibleItems.map((item) => {
                        const isActive = currentView === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-full
                  transition-all duration-300 ease-out
                  ${isActive
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 scale-105'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                    }
                `}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {/* Icon with animation */}
                                <span className={`
                  transition-transform duration-300
                  ${isActive ? 'scale-110' : 'scale-100'}
                `}>
                                    {item.icon}
                                </span>

                                {/* Label - only visible when active */}
                                <span
                                    className={`
                    font-medium text-sm whitespace-nowrap
                    transition-all duration-300 origin-left
                    ${isActive
                                            ? 'opacity-100 max-w-[80px] translate-x-0'
                                            : 'opacity-0 max-w-0 -translate-x-2'
                                        }
                  `}
                                    style={{
                                        overflow: 'hidden',
                                    }}
                                >
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};
