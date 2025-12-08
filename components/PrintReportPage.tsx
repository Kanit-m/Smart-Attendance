import React, { useState, useEffect, useMemo } from 'react';
import { getDocs, collection, query, orderBy, where } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord } from '../types';
import { mapStudentData } from '../utils';
import { DailyReportPreview } from './DailyReportPreview';
import { PrintLoading } from './PrintLoading';
import { Printer, ArrowLeft, AlertTriangle, X, RefreshCw } from 'lucide-react';

export const PrintReportPage: React.FC = () => {
    // Cache Configuration
    const STUDENTS_CACHE_KEY = 'cached_students';
    const getAttendanceCacheKey = (d: string) => `cached_attendance_${d}`;
    const getAttendanceTimeKey = (d: string) => `cached_attendance_time_${d}`;
    const ATTENDANCE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    const [students, setStudents] = useState<Student[]>([]);
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [dutyLog, setDutyLog] = useState({
        topic1: '', topic2: '', afternoonTopic: '', otherTopic: '', teacherName: ''
    });
    const [isInitialized, setIsInitialized] = useState(false);
    const [showWarningModal, setShowWarningModal] = useState(false);

    // Helper: Load students from cache or Firestore
    const loadStudents = async () => {
        const cached = localStorage.getItem(STUDENTS_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached) as Student[];
        }
        const q = query(collection(db, 'students'), orderBy('grade'), orderBy('number'));
        const snap = await getDocs(q);
        return snap.docs.map(doc => mapStudentData(doc.id, doc.data()));
    };

    // Helper: Load attendance from cache or Firestore
    const loadAttendance = async (targetDate: string, forceRefresh = false) => {
        const cacheKey = getAttendanceCacheKey(targetDate);
        const timeKey = getAttendanceTimeKey(targetDate);
        const now = Date.now();

        if (!forceRefresh) {
            const cached = localStorage.getItem(cacheKey);
            const cachedTime = localStorage.getItem(timeKey);
            if (cached && cachedTime && (now - parseInt(cachedTime)) < ATTENDANCE_CACHE_DURATION) {
                return JSON.parse(cached) as AttendanceRecord[];
            }
        }

        // Fetch fresh data
        const q = query(collection(db, 'attendance'), where('date', '==', targetDate));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => doc.data() as AttendanceRecord);

        // Save to cache
        try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(timeKey, now.toString());
        } catch { /* ignore cache errors */ }

        return data;
    };

    // Get date from URL on initial load
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const dateParam = params.get('date');
        if (dateParam) setDate(dateParam);
        setIsInitialized(true);
    }, []);

    // Fetch Data when date changes
    useEffect(() => {
        if (!isInitialized) return;

        const fetchData = async () => {
            setLoading(true);
            const startTime = Date.now();

            try {
                const [studentsData, attendanceData] = await Promise.all([
                    loadStudents(),
                    loadAttendance(date)
                ]);
                setStudents(studentsData);
                setAttendances(attendanceData);
            } catch (error) {
                console.error("Error fetching report data:", error);
            } finally {
                const elapsed = Date.now() - startTime;
                setTimeout(() => setLoading(false), Math.max(0, 3000 - elapsed));
            }
        };

        if (date) fetchData();
    }, [date, isInitialized]);

    // Calculate missing classes
    const missingClasses = useMemo(() => {
        const grades = [...new Set<string>(students.map(s => s.grade))];
        return grades
            .filter(grade => {
                const hasStudents = students.some(s => s.grade === grade);
                const hasAttendance = attendances.some(a => a.grade === grade);
                return hasStudents && !hasAttendance;
            })
            .sort((a, b) => {
                const isKA = a.includes('อนุบาล'), isKB = b.includes('อนุบาล');
                if (isKA && !isKB) return -1;
                if (!isKA && isKB) return 1;
                return parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0');
            });
    }, [students, attendances]);

    const handlePrintClick = () => {
        missingClasses.length > 0 ? setShowWarningModal(true) : window.print();
    };

    // Refresh data - clear cache and fetch fresh
    const handleRefreshData = async () => {
        setLoading(true);
        const startTime = Date.now();

        try {
            // Clear cache for current date
            localStorage.removeItem(getAttendanceCacheKey(date));
            localStorage.removeItem(getAttendanceTimeKey(date));

            const [studentsData, attendanceData] = await Promise.all([
                loadStudents(),
                loadAttendance(date, true)
            ]);
            setStudents(studentsData);
            setAttendances(attendanceData);
        } catch (error) {
            console.error("Error refreshing data:", error);
        } finally {
            const elapsed = Date.now() - startTime;
            setTimeout(() => setLoading(false), Math.max(0, 1000 - elapsed));
        }
    };

    if (loading) {
        return <PrintLoading message="กำลังโหลดข้อมูล" />;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row animate-fade-in">
            {/* Left: Control Panel (Hidden in Print) */}
            <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r p-6 overflow-y-auto h-screen sticky top-0 print:hidden shadow-lg z-10">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800">ตั้งค่ารายงาน</h2>
                    <button
                        onClick={() => window.close()}
                        className="text-gray-500 hover:text-red-500"
                        title="ปิดหน้าต่าง"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Date Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่รายงาน</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="flex-1 border rounded-md p-2"
                            />
                            <button
                                onClick={handleRefreshData}
                                className="px-3 py-2 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors"
                                title="รีเฟรชข้อมูล"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-red-500 mt-1">
                            * กดปุ่มรีเฟรช 🔄 เพื่อโหลดข้อมูลใหม่หลังจากมีการบันทึกเพิ่ม
                        </p>
                    </div>

                    <hr />

                    {/* Duty Log Inputs */}
                    <div>
                        <h3 className="font-semibold mb-2">บันทึกครูเวร</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-500">อบรมหน้าเสาธง (เรื่อง 1)</label>
                                <input
                                    type="text"
                                    value={dutyLog.topic1}
                                    onChange={(e) => setDutyLog({ ...dutyLog, topic1: e.target.value })}
                                    className="w-full border rounded-md p-2 text-sm"
                                    placeholder="เรื่องที่ 1..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">อบรมหน้าเสาธง (เรื่อง 2)</label>
                                <input
                                    type="text"
                                    value={dutyLog.topic2}
                                    onChange={(e) => setDutyLog({ ...dutyLog, topic2: e.target.value })}
                                    className="w-full border rounded-md p-2 text-sm"
                                    placeholder="เรื่องที่ 2..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">อบรมช่วงบ่าย</label>
                                <input
                                    type="text"
                                    value={dutyLog.afternoonTopic}
                                    onChange={(e) => setDutyLog({ ...dutyLog, afternoonTopic: e.target.value })}
                                    className="w-full border rounded-md p-2 text-sm"
                                    placeholder="เรื่อง..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">เรื่องอื่นๆ</label>
                                <input
                                    type="text"
                                    value={dutyLog.otherTopic}
                                    onChange={(e) => setDutyLog({ ...dutyLog, otherTopic: e.target.value })}
                                    className="w-full border rounded-md p-2 text-sm"
                                    placeholder="ระบุเรื่องอื่นๆ..."
                                />
                            </div>
                        </div>
                    </div>

                    <hr />

                    {/* Signatures */}
                    <div>
                        <h3 className="font-semibold mb-2">ลงชื่อ</h3>
                        <div>
                            <label className="block text-xs text-gray-500">ชื่อครูเวร</label>
                            <input
                                type="text"
                                value={dutyLog.teacherName}
                                onChange={(e) => setDutyLog({ ...dutyLog, teacherName: e.target.value })}
                                className="w-full border rounded-md p-2 text-sm"
                                placeholder="ชื่อ-นามสกุล..."
                            />
                        </div>
                    </div>

                    {/* Print Button */}
                    <button
                        onClick={handlePrintClick}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 flex items-center justify-center gap-2 mt-8"
                    >
                        <Printer className="w-5 h-5" />
                        พิมพ์รายงาน
                    </button>

                    {/* Missing Classes Warning */}
                    {missingClasses.length > 0 && (
                        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-amber-700 font-bold text-sm mb-2">
                                <AlertTriangle className="w-4 h-4" />
                                ยังมีห้องที่ไม่ได้บันทึก ({missingClasses.length} ห้อง)
                            </div>
                            <div className="text-xs text-amber-600">
                                {missingClasses.join(', ')}
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-gray-400 text-center mt-4">
                        * กดพิมพ์แล้วแผงควบคุมนี้จะถูกซ่อนอัตโนมัติ
                    </p>
                </div>
            </div>

            {/* Right: Preview Area */}
            <div className="flex-1 bg-gray-500 p-8 overflow-y-auto h-screen flex justify-center print:p-0 print:h-auto print:overflow-visible">
                <DailyReportPreview
                    students={students.filter(s => !s.status || s.status === 'active')}
                    attendances={attendances}
                    date={date}
                    dutyLog={dutyLog}
                />
            </div>

            {/* Fade In Animation Styles */}
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out forwards;
                }
            `}</style>

            {/* Warning Modal - Incomplete Data */}
            {showWarningModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-amber-50">
                            <h3 className="font-bold text-lg text-amber-800 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                ไม่สามารถพิมพ์ได้
                            </h3>
                            <button
                                onClick={() => setShowWarningModal(false)}
                                className="p-1 hover:bg-amber-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-amber-600" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                                    <AlertTriangle className="w-8 h-8 text-amber-600" />
                                </div>
                                <h4 className="text-lg font-bold text-gray-800 mb-2">
                                    ยังมีห้องที่ไม่ได้บันทึก
                                </h4>
                                <p className="text-sm text-gray-500">
                                    กรุณาบันทึกข้อมูลการเช็คชื่อให้ครบก่อนพิมพ์รายงาน
                                </p>
                            </div>

                            {/* Missing Classes List */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                                <div className="text-xs font-bold text-amber-700 mb-2">
                                    ห้องเรียนที่ยังไม่ได้บันทึก ({missingClasses.length} ห้อง):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {missingClasses.map((grade, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"
                                        >
                                            {grade}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 bg-gray-50">
                            <button
                                onClick={() => setShowWarningModal(false)}
                                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors"
                            >
                                เข้าใจแล้ว
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
