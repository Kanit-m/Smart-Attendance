import React, { useState, useCallback } from 'react';

interface LandingPageProps {
    onGoToDashboard: () => void;
    onLoginAdmin: () => void;
    onLoginTeacher: () => void;
}

const SCHOOL_LOGO = '/Ps logo.png';

// Button config for cleaner rendering
const LOGIN_BUTTONS = [
    { type: 'admin' as const, icon: '🔐', label: 'ผู้ดูแลระบบ', color: 'red' },
    { type: 'teacher' as const, icon: '👨‍🏫', label: 'ครูประจำชั้น', color: 'green' },
];

export function LandingPage({ onGoToDashboard, onLoginAdmin, onLoginTeacher }: LandingPageProps) {
    const [clickedButton, setClickedButton] = useState<'admin' | 'teacher' | null>(null);

    // Generic click handler
    const handleLoginClick = useCallback((type: 'admin' | 'teacher') => {
        const callback = type === 'admin' ? onLoginAdmin : onLoginTeacher;
        setClickedButton(type);
        setTimeout(() => {
            setClickedButton(null);
            callback();
        }, 600);
    }, [onLoginAdmin, onLoginTeacher]);

    // Divider component
    const Divider = () => (
        <div className="flex items-center gap-4 py-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            <span className="text-xs font-bold uppercase text-gray-400 tracking-widest">เข้าสู่ระบบ</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-100 via-white to-gray-100">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 right-20 w-72 h-72 bg-blue-200/40 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-20 left-20 w-72 h-72 bg-purple-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            <div className="relative z-10 w-full max-w-md">
                {/* Main Card */}
                <div className="rounded-3xl p-8 md:p-10 bg-white/80 backdrop-blur-xl border border-gray-200 shadow-2xl">
                    {/* Logo & Title */}
                    <div className="text-center mb-10">
                        <img src={SCHOOL_LOGO} alt="School Logo" className="w-28 h-28 mx-auto mb-5 rounded-full object-cover ring-4 ring-gray-100 shadow-xl" />
                        <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2 tracking-wide">ระบบบันทึกสถิติการมาเรียน</h1>
                        <p className="text-gray-500 text-sm tracking-widest">โรงเรียนประชาสามัคคี</p>
                    </div>

                    {/* Buttons Container */}
                    <div className="space-y-4">
                        {/* Dashboard Button */}
                        <button onClick={onGoToDashboard} className="fancy-button fancy-button-blue w-full">
                            <span className="fancy-button-content">
                                <span className="text-xl">📊</span>
                                <span>Dashboard</span>
                            </span>
                        </button>

                        <Divider />

                        {/* Login Buttons */}
                        {LOGIN_BUTTONS.map(({ type, icon, label, color }) => (
                            <button
                                key={type}
                                onClick={() => handleLoginClick(type)}
                                disabled={clickedButton !== null}
                                className={`fancy-button fancy-button-${color} w-full ${clickedButton === type ? 'fancy-button-clicked' : ''}`}
                            >
                                <span className="fancy-button-content">
                                    <span className="text-xl">{icon}</span>
                                    <span>{label}</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs mt-10 text-gray-400 tracking-wider">
                        © {new Date().getFullYear()} Smart Attendance System
                    </p>
                </div>
            </div>

            {/* CSS Styles for Fancy Buttons */}
            <style>{`
                .fancy-button {
                    position: relative;
                    padding: 16px 32px;
                    font-size: 16px;
                    font-weight: bold;
                    border-radius: 30px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    overflow: hidden;
                    z-index: 1;
                    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
                }
                .fancy-button-content {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    transition: all 0.3s ease;
                }

                /* Button color variants using CSS variables */
                .fancy-button-blue { --btn-color: #055C9D; }
                .fancy-button-red { --btn-color: #ef4444; }
                .fancy-button-green { --btn-color: #22c55e; }

                .fancy-button-blue, .fancy-button-red, .fancy-button-green {
                    background-color: #f1f5f9;
                    color: var(--btn-color);
                }
                .fancy-button-blue::before, .fancy-button-red::before, .fancy-button-green::before {
                    background-color: var(--btn-color);
                }
                .fancy-button-blue:hover, .fancy-button-red:hover, .fancy-button-green:hover {
                    color: #ffffff;
                }

                .fancy-button::before {
                    content: "";
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 300%;
                    height: 300%;
                    transition: all 0.4s ease;
                    border-radius: 50%;
                    z-index: -1;
                    transform: translate(-50%, -50%) scale(0);
                }
                .fancy-button:hover::before {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 0.95;
                }
                .fancy-button:hover {
                    box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
                    transform: translateY(-3px);
                }
                .fancy-button::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: -75%;
                    width: 50%;
                    height: 100%;
                    background: linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%);
                    transform: skewX(-25deg);
                    transition: all 0.3s ease;
                    z-index: 1;
                }
                .fancy-button:hover::after { left: 125%; transition: all 0.6s ease; }
                .fancy-button:active { transform: translateY(0); box-shadow: 0 5px 10px rgba(0, 0, 0, 0.1); }

                /* Clicked state */
                .fancy-button-clicked::before { transform: translate(-50%, -50%) scale(1) !important; opacity: 0.95 !important; }
                .fancy-button-clicked { box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15) !important; transform: translateY(-3px) !important; color: #ffffff !important; }
                .fancy-button-clicked::after { left: 125% !important; transition: all 0.6s ease !important; }
            `}</style>
        </div>
    );
}
