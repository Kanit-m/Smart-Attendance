import React, { useState, useEffect } from 'react';

interface LoadingScreenProps {
    message?: string;
    showDetails?: boolean;
}

// Embedded logo path - no need to load from Firebase
const SCHOOL_LOGO = '/Ps logo.png';

export function LoadingScreen({
    message = 'กำลังโหลดระบบ...',
    showDetails = true
}: LoadingScreenProps) {
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);

    const loadingSteps = [
        { text: 'กำลังเชื่อมต่อระบบ...', icon: '🔗' },
        { text: 'ตรวจสอบสถานะผู้ใช้...', icon: '👤' },
        { text: 'โหลดการตั้งค่า...', icon: '⚙️' },
        { text: 'เตรียมข้อมูลนักเรียน...', icon: '📚' },
        { text: 'พร้อมใช้งาน!', icon: '✅' },
    ];

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

    useEffect(() => {
        if (progress < 20) setCurrentStep(0);
        else if (progress < 40) setCurrentStep(1);
        else if (progress < 60) setCurrentStep(2);
        else if (progress < 85) setCurrentStep(3);
        else setCurrentStep(4);
    }, [progress]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="relative z-10 text-center px-6 max-w-md w-full">
                {/* App Logo with animation */}
                <div className="mb-8">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-blue-200/50 animate-spin" style={{ animationDuration: '3s' }}></div>
                        <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" style={{ animationDuration: '1s' }}></div>
                        <img
                            src={SCHOOL_LOGO}
                            alt="School Logo"
                            className="w-24 h-24 rounded-full object-cover shadow-xl shadow-blue-200"
                        />
                    </div>
                </div>

                {/* App Title */}
                <h1 className="text-2xl font-bold text-gray-800 mb-2">
                    ระบบบันทึกสถิติการมาเรียน
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

                {/* Loading Steps Detail */}
                {showDetails && (
                    <div className="space-y-2 mb-6">
                        {loadingSteps.map((step, index) => (
                            <div
                                key={index}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 ${index < currentStep
                                    ? 'bg-green-50 text-green-700'
                                    : index === currentStep
                                        ? 'bg-blue-50 text-blue-700 animate-pulse'
                                        : 'bg-gray-50 text-gray-400'
                                    }`}
                            >
                                <span className="text-lg">{step.icon}</span>
                                <span className="text-sm font-medium flex-1 text-left">{step.text}</span>
                                {index < currentStep && (
                                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {index === currentStep && (
                                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-sm text-gray-500 animate-pulse">
                    {loadingSteps[currentStep]?.text || message}
                </p>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer {
                    animation: shimmer 1.5s infinite;
                }
            `}</style>
        </div>
    );
}
