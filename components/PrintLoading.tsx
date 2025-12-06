import React, { useState, useEffect } from 'react';

interface PrintLoadingProps {
    message?: string;
}

// Embedded logo path
const SCHOOL_LOGO = '/Ps logo.png';

export function PrintLoading({ message = 'กำลังโหลดข้อมูล' }: PrintLoadingProps) {
    const [progress, setProgress] = useState(0);
    const [fadeOut, setFadeOut] = useState(false);

    // Animate progress - same timing as main LoadingScreen
    useEffect(() => {
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                const increment = Math.random() * 10 + 5;
                return Math.min(prev + increment, 100);
            });
        }, 200);

        return () => clearInterval(progressInterval);
    }, []);

    // Trigger fade out when loading complete
    useEffect(() => {
        if (progress >= 100) {
            const timer = setTimeout(() => {
                setFadeOut(true);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [progress]);

    return (
        <div
            className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
        >
            {/* Background decorative elements - same as main LoadingScreen */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="relative z-10 text-center px-6 max-w-md w-full">
                {/* School Logo with Bounce Animation and Blue Shadow */}
                <div className="mb-8">
                    <div className="relative inline-block">
                        {/* Blue Shadow underneath */}
                        <div
                            className="absolute inset-0 w-28 h-28 rounded-full bg-blue-400/40 blur-xl animate-pulse"
                            style={{ top: '10px', left: '-2px' }}
                        ></div>
                        {/* Spinning ring */}
                        <div className="absolute inset-0 w-28 h-28 rounded-full border-4 border-blue-200/50 animate-spin" style={{ animationDuration: '3s' }}></div>
                        <div className="absolute inset-0 w-28 h-28 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" style={{ animationDuration: '1s' }}></div>
                        {/* Logo with bounce */}
                        <img
                            src={SCHOOL_LOGO}
                            alt="ตราโรงเรียน"
                            className="w-28 h-28 rounded-full object-cover shadow-xl shadow-blue-200 animate-bounce-slow"
                        />
                    </div>
                </div>

                {/* Loading Text */}
                <h1 className="text-2xl font-bold text-gray-800 mb-2">
                    {message}
                </h1>
                <p className="text-sm text-gray-500 mb-8">โรงเรียนประชาสามัคคี</p>

                {/* Progress Bar Container */}
                <div className="relative mb-6">
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                        </div>
                    </div>
                    <div className="absolute -right-2 -top-8 bg-gray-800 text-white text-xs px-2 py-1 rounded-md font-medium shadow-lg">
                        {Math.round(progress)}%
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                    </div>
                </div>

                {/* Status Text */}
                <p className="text-sm text-gray-500 animate-pulse">
                    {progress < 30 && '🔗 กำลังเชื่อมต่อฐานข้อมูล...'}
                    {progress >= 30 && progress < 60 && '📚 กำลังโหลดข้อมูลนักเรียน...'}
                    {progress >= 60 && progress < 90 && '📊 กำลังประมวลผลสถิติ...'}
                    {progress >= 90 && '✅ เตรียมพร้อมแล้ว!'}
                </p>
            </div>

            {/* Inline Styles for Animations */}
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer {
                    animation: shimmer 1.5s infinite;
                }
                
                @keyframes bounce-slow {
                    0%, 100% { 
                        transform: translateY(0);
                    }
                    50% { 
                        transform: translateY(-10px);
                    }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 1.5s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}

export default PrintLoading;
