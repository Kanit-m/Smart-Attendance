
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
    Users, UserCheck, UserX, Sun,
    ChevronRight, ChevronLeft, LayoutGrid,
    Baby, BookOpen, Activity,
    ClipboardCheck, AlertTriangle, Clock, Printer,
    ChevronDown, ChevronUp, CalendarCheck, CalendarDays
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AttendanceStatus, Gender, Holiday, StudentStatus, SchoolActivity } from '../types';
import { DailyReport } from './DailyReport';

interface DashboardProps {
    embedded?: boolean;
    students?: Student[];
    holidays?: Holiday[];  // Pass from parent to avoid refetch on remount
}

interface GradeStats {
    grade: string;
    male: number;
    female: number;
    total: number;
    present: number;
    presentMale: number;
    presentFemale: number;
    absent: number;
    absentMale: number;
    absentFemale: number;
    absentList: AttendanceRecord[];
    isSubmitted: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ embedded = false, students = [], holidays: parentHolidays }) => {
    // Initialize with Today's date
    const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const dateInputRef = useRef<HTMLInputElement>(null);

    const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    // todayHoliday is now derived below

    // Carousel State for Kindergarten (K) and Primary (P)
    const [kIndex, setKIndex] = useState(0);
    const [pIndex, setPIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Flip Card State for mobile tap toggle
    const [flippedCards, setFlippedCards] = useState<{ [key: string]: boolean }>({});
    const toggleFlip = useCallback((cardId: string) => {
        setFlippedCards(prev => ({ ...prev, [cardId]: !prev[cardId] }));
    }, []);



    // Touch State for Swipe
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);

    // Holidays Collapsible State - REMOVED (Merged into Calendar)
    // Activities State - REMOVED (Merged into Calendar)
    // Reusing isActivitiesExpanded for the new Calendar Section to avoid renaming everything now
    const [isActivitiesExpanded, setIsActivitiesExpanded] = useState(true);

    // Use parent holidays if provided, otherwise cache locally
    const [holidaysCache, setHolidaysCache] = useState<Holiday[] | null>(parentHolidays || null);

    // --- Cache Configuration (Shared with other components) ---
    const HOLIDAYS_CACHE_KEY = 'cached_holidays';
    const HOLIDAYS_TIME_KEY = 'cached_holidays_time';
    const HOLIDAYS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const ACTIVITIES_CACHE_KEY = 'cached_activities';
    const ACTIVITIES_TIME_KEY = 'cached_activities_time';
    const ACTIVITIES_CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour

    // Derived holiday state to ensure reactivity when props change
    const [calendarItems, setCalendarItems] = useState<{ type: 'holiday' | 'activity', date: string, title: string, description?: string, id: string }[]>([]);

    const todayHoliday = useMemo(() => {
        const activeHolidays = parentHolidays || holidaysCache || [];
        return activeHolidays.find(h => h.date === currentDate) || null;
    }, [parentHolidays, holidaysCache, currentDate]);

    useEffect(() => {
        fetchData(currentDate);
    }, [currentDate]); // Only re-fetch when date changes

    const fetchData = async (targetDate: string) => {
        setLoading(true);
        const now = Date.now();

        try {
            // --- HOLIDAYS: Use shared cache ---
            let holidays = parentHolidays || holidaysCache;
            if (!holidays) {
                // Try localStorage cache first
                const cachedHolidays = localStorage.getItem(HOLIDAYS_CACHE_KEY);
                const cachedHolidaysTime = localStorage.getItem(HOLIDAYS_TIME_KEY);

                if (cachedHolidays && cachedHolidaysTime && (now - parseInt(cachedHolidaysTime)) < HOLIDAYS_CACHE_DURATION) {
                    holidays = JSON.parse(cachedHolidays);
                    setHolidaysCache(holidays);
                } else {
                    // Fetch from Firestore
                    const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
                    holidays = holidaysSnapshot.docs.map(doc => doc.data() as Holiday);
                    setHolidaysCache(holidays);
                    // Save to localStorage
                    try {
                        localStorage.setItem(HOLIDAYS_CACHE_KEY, JSON.stringify(holidays));
                        localStorage.setItem(HOLIDAYS_TIME_KEY, now.toString());
                    } catch { /* ignore */ }
                }
            }

            // Check if it's a weekend - skip fetching attendance data
            const dateObj = new Date(targetDate);
            const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
            const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

            if (isWeekendDay) {
                setAttendances([]); // No attendance on weekends
                return;
            }

            // Students are passed via props, no need to fetch here

            const q = query(collection(db, 'attendance'), where('date', '==', targetDate));
            const attSnapshot = await getDocs(q);
            const attData = attSnapshot.docs.map(doc => doc.data() as AttendanceRecord);
            setAttendances(attData);

            // --- ACTIVITIES: Use localStorage cache ---
            try {
                const cachedActs = localStorage.getItem(ACTIVITIES_CACHE_KEY);
                const cachedActsTime = localStorage.getItem(ACTIVITIES_TIME_KEY);

                let acts: SchoolActivity[];

                if (cachedActs && cachedActsTime && (now - parseInt(cachedActsTime)) < ACTIVITIES_CACHE_DURATION) {
                    acts = JSON.parse(cachedActs);
                } else {
                    // Fetch from Firestore
                    const qAct = query(collection(db, 'school_activities'), orderBy('date', 'desc'));
                    const actSnapshot = await getDocs(qAct);
                    acts = actSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolActivity));
                    // Save to cache
                    try {
                        localStorage.setItem(ACTIVITIES_CACHE_KEY, JSON.stringify(acts));
                        localStorage.setItem(ACTIVITIES_TIME_KEY, now.toString());
                    } catch { /* ignore */ }
                }

                // Filter for relevant activities (from today onwards, current month)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();

                const relevantActs = acts.filter(a => {
                    // Parse date correctly for local timezone
                    const [y, m, d] = a.date.split('-').map(Number);
                    const actDate = new Date(y, m - 1, d);
                    return a.date >= todayStr && actDate.getMonth() === currentMonth && actDate.getFullYear() === currentYear;
                }).map(a => ({
                    type: 'activity' as const,
                    date: a.date,
                    title: a.title,
                    description: a.description,
                    id: a.id
                }));

                // Merge with upcoming holidays (from today onwards, current month only)
                const relevantHolidays = holidays!.filter(h => {
                    // Parse date correctly for local timezone
                    const [y, m, d] = h.date.split('-').map(Number);
                    const hDate = new Date(y, m - 1, d);
                    return h.date >= todayStr && hDate.getMonth() === currentMonth && hDate.getFullYear() === currentYear;
                }).map(h => ({
                    type: 'holiday' as const,
                    date: h.date,
                    title: h.description,
                    description: 'วันหยุด',
                    id: h.id
                }));

                // Combine and Sort
                const combined = [...relevantActs, ...relevantHolidays].sort((a, b) => a.date.localeCompare(b.date));
                setCalendarItems(combined);

            } catch (err) {
                console.error("Error fetching activities", err);
            }

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Filter students based on currentDate - include students who hadn't withdrawn by that date
    const activeStudents = useMemo(() => {
        const viewingTimestamp = new Date(currentDate).getTime() + (24 * 60 * 60 * 1000); // End of viewing day
        return students.filter(s => {
            // Include if never withdrawn
            if (s.status !== StudentStatus.WITHDRAWN || !s.withdrawnAt) return true;
            // Include if withdrew AFTER the viewing date
            return s.withdrawnAt > viewingTimestamp;
        });
    }, [students, currentDate]);

    // Memoize expensive grade statistics calculation
    const allStats = useMemo((): GradeStats[] => {
        const uniqueGrades = Array.from(new Set(activeStudents.map(s => s.grade))) as string[];
        // Custom sort: Anuban first, then Prathom
        const grades = uniqueGrades.sort((a, b) => {
            const isKA = a.includes('อนุบาล');
            const isKB = b.includes('อนุบาล');
            if (isKA && !isKB) return -1;
            if (!isKA && isKB) return 1;

            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });

        return grades.map(grade => {
            const studentsInGrade = activeStudents.filter(s => s.grade === grade);
            const male = studentsInGrade.filter(s => s.gender === Gender.MALE).length;
            const female = studentsInGrade.filter(s => s.gender === Gender.FEMALE).length;

            const absentRecords = attendances.filter(a =>
                a.grade === grade &&
                (a.status === AttendanceStatus.ABSENT || a.status === AttendanceStatus.SICK || a.status === AttendanceStatus.PERSONAL)
            );

            const absentCount = absentRecords.length;
            const absentMale = absentRecords.filter(a => a.gender === Gender.MALE).length;
            const absentFemale = absentRecords.filter(a => a.gender === Gender.FEMALE).length;

            const presentRecords = attendances.filter(a =>
                a.grade === grade &&
                (a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE)
            );
            const presentCount = presentRecords.length;
            const presentMale = presentRecords.filter(a => a.gender === Gender.MALE).length;
            const presentFemale = presentRecords.filter(a => a.gender === Gender.FEMALE).length;

            return {
                grade,
                male,
                female,
                total: studentsInGrade.length,
                absent: absentCount,
                present: presentCount,
                presentMale,
                presentFemale,
                absentMale,
                absentFemale,
                absentList: absentRecords,
                isSubmitted: presentCount + absentCount > 0
            };
        });
    }, [activeStudents, attendances]);

    // Memoize filtered stats for Kindergarten and Primary
    const kStats = useMemo(() => allStats.filter(s => s.grade.includes('อนุบาล')), [allStats]);
    const pStats = useMemo(() => allStats.filter(s => !s.grade.includes('อนุบาล')), [allStats]);

    // Memoize class submission status
    const { totalClasses, submittedClasses, missingClasses, isAllSubmitted } = useMemo(() => {
        const total = allStats.length;
        const submitted = allStats.filter(s => s.isSubmitted).length;
        const missing = allStats.filter(s => !s.isSubmitted);
        return {
            totalClasses: total,
            submittedClasses: submitted,
            missingClasses: missing,
            isAllSubmitted: total > 0 && submitted === total
        };
    }, [allStats]);

    // Check if current date is a school day (not weekend or holiday)
    const isSchoolDay = useMemo(() => {
        const dateObj = new Date(currentDate);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        return !isWeekend && !todayHoliday;
    }, [currentDate, todayHoliday]);

    // Carousel Auto-Scroll Logic
    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            if (kStats.length > 0) setKIndex(prev => (prev + 1) % kStats.length);
            if (pStats.length > 0) setPIndex(prev => (prev + 1) % pStats.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [kStats.length, pStats.length, isPaused]);

    // Memoize student totals
    const { totalStudents, totalMale, totalFemale } = useMemo(() => ({
        totalStudents: activeStudents.length,
        totalMale: activeStudents.filter(s => s.gender === Gender.MALE).length,
        totalFemale: activeStudents.filter(s => s.gender === Gender.FEMALE).length
    }), [activeStudents]);

    // Memoize attendance totals
    const { totalAbsent, totalPresent, percentPresent } = useMemo(() => {
        const absentCount = attendances.filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status)).length;
        const presentCount = attendances.filter(a => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
        return {
            totalAbsent: absentCount,
            totalPresent: presentCount,
            percentPresent: activeStudents.length > 0 ? ((presentCount / activeStudents.length) * 100).toFixed(1) : '0.0'
        };
    }, [attendances, activeStudents.length]);

    // Swipe Handlers - memoized to prevent recreation
    const handleTouchStart = useCallback((e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX), []);
    const handleTouchMove = useCallback((e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX), []);
    const handleTouchEnd = useCallback((_type: 'K' | 'P', length: number, setIndex: React.Dispatch<React.SetStateAction<number>>) => {
        setTouchStart(prev => {
            setTouchEnd(end => {
                if (!prev || !end) return end;
                const distance = prev - end;
                const isLeftSwipe = distance > 50;
                const isRightSwipe = distance < -50;

                if (isLeftSwipe) {
                    setIndex(p => (p + 1) % length);
                } else if (isRightSwipe) {
                    setIndex(p => (p - 1 + length) % length);
                }
                return 0;
            });
            return 0;
        });
    }, []);



    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[300px]">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-600 border-t-transparent"></div>
            </div>
        );
    }

    const containerClass = embedded
        ? "w-full space-y-6 animate-fade-in text-black"
        : "max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in text-black";

    // Render Helper for Carousel
    const renderCarousel = (title: string, icon: any, stats: GradeStats[], index: number, setIndex: any, type: 'K' | 'P', gradientClass: string) => (
        <div
            className={`rounded-3xl p-1 shadow-lg overflow-hidden relative group bg-white border border-gray-200 flex flex-col`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd(type, stats.length, setIndex)}
        >
            <div className={`px-5 py-3 flex justify-between items-center text-white rounded-t-[20px] ${gradientClass}`}>
                <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">{icon} {title}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">{stats.length > 0 ? index + 1 : 0} / {stats.length}</span>
            </div>

            <div className="relative" style={{ minHeight: '180px' }}>
                {stats.length > 0 ? (
                    <div className="absolute inset-0">
                        {stats.map((stat, idx) => (
                            <div
                                key={idx}
                                className={`absolute inset-0 p-4 flex flex-col transition-all duration-500 ease-in-out transform ${idx === index ? 'opacity-100 translate-x-0' : idx < index ? 'opacity-0 -translate-x-full' : 'opacity-0 translate-x-full'
                                    }`}
                            >
                                {/* Top Section: Grade Info */}
                                <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                    <div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase">ห้องเรียน</div>
                                        <div className="text-lg font-bold text-brand-700">{stat.grade}</div>
                                    </div>
                                    <div className="text-right bg-gray-50 px-3 py-1 rounded-lg">
                                        <div className="text-[10px] text-gray-400 font-bold uppercase">นักเรียนทั้งหมด</div>
                                        <div className="text-lg font-bold text-gray-800">{stat.total}</div>
                                    </div>
                                </div>

                                {/* Middle Section: Stats Grid */}
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-emerald-700">มาเรียน</span>
                                            <UserCheck className="w-3 h-3 text-emerald-500" />
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <div className="text-xl font-bold text-emerald-600">{stat.present}</div>
                                            <div className="text-[10px] font-medium text-emerald-400">
                                                (ช {stat.presentMale} / ญ {stat.presentFemale})
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-rose-50 rounded-xl p-2 border border-rose-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-rose-700">ขาด/ลา</span>
                                            <UserX className="w-3 h-3 text-rose-500" />
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xl font-bold text-rose-600">{stat.absent}</span>
                                            <div className="text-[10px] font-medium text-rose-400">
                                                (ช {stat.absentMale} / ญ {stat.absentFemale})
                                            </div>
                                        </div>
                                    </div>
                                </div>


                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">ไม่มีข้อมูล</div>
                )}

                {/* Waiting for Data Overlay - Only show on school days */}
                {isSchoolDay && stats.length > 0 && !stats[index].isSubmitted && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-4 animate-fade-in">
                        <div className="bg-amber-100 p-4 rounded-full mb-3 shadow-sm animate-pulse">
                            <Clock className="w-8 h-8 text-amber-600" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-800 mb-1">รอการบันทึกข้อมูล</h4>
                        <p className="text-sm text-gray-500">
                            ห้อง <span className="font-bold text-brand-600">{stats[index].grade}</span> ยังไม่ได้ส่งข้อมูลวันนี้
                        </p>
                    </div>
                )}

                {/* Holiday Overlay - Show when not a school day */}
                {!isSchoolDay && stats.length > 0 && (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50/95 to-amber-50/95 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-4 animate-fade-in">
                        <div className="bg-orange-100 p-4 rounded-full mb-3 shadow-sm">
                            <Sun className="w-8 h-8 text-orange-500" />
                        </div>
                        <h4 className="text-xl font-bold text-orange-700 mb-1">
                            🏖️ {todayHoliday ? todayHoliday.description : 'วันหยุดสุดสัปดาห์'}
                        </h4>
                        <p className="text-sm text-orange-500">ไม่มีการบันทึกข้อมูลในวันนี้</p>
                    </div>
                )}

                {/* Navigation Buttons */}
                <button
                    onClick={(e) => { e.stopPropagation(); setIndex((prev: number) => (prev - 1 + stats.length) % stats.length); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-lg text-gray-600 hover:text-brand-600 hover:scale-110 transition-all z-20 opacity-0 group-hover:opacity-100"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); setIndex((prev: number) => (prev + 1) % stats.length); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-lg text-gray-600 hover:text-brand-600 hover:scale-110 transition-all z-20 opacity-0 group-hover:opacity-100"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );

    return (
        <div
            className={containerClass}
            style={{
                backgroundImage: 'url(/circle-scatter-haikei.svg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            }}
        >
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-5 h-5 text-brand-600" />
                        <span className="text-sm font-bold text-brand-600 uppercase tracking-wider">Real-time Dashboard</span>
                    </div>
                    <h2 className="text-3xl font-bold text-black">ภาพรวมสถานศึกษา</h2>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    {/* Print Report Button - Hidden on mobile */}
                    <button
                        onClick={() => window.open(`/print-report?date=${currentDate}`, '_blank')}
                        className="hidden md:flex w-full sm:w-auto items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 hover:shadow-md transition-all font-bold text-sm active:scale-95 border border-transparent"
                    >
                        <Printer className="w-4 h-4" />
                        <span>พิมพ์รายงาน</span>
                    </button>

                    {/* DATE PICKER COMPONENT */}
                    <div
                        className="relative group w-full sm:w-auto cursor-pointer"
                        onClick={() => dateInputRef.current?.showPicker?.()}
                    >
                        {/* Hidden Date Input */}
                        <input
                            ref={dateInputRef}
                            type="date"
                            value={currentDate}
                            onChange={(e) => setCurrentDate(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                        />
                        <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 group-hover:border-brand-400 group-hover:shadow-md transition-all">
                            <CalendarDays className="w-5 h-5 text-brand-600 group-hover:text-brand-700" />
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">วันที่ข้อมูล</span>
                                <span className="text-sm font-bold text-black group-hover:text-brand-800 leading-none">
                                    {new Date(currentDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Weekend Alert - Auto detect Saturday/Sunday */}
            {(() => {
                const dateObj = new Date(currentDate);
                const dayOfWeek = dateObj.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const dayName = dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์';

                if (isWeekend) {
                    return (
                        <div className="bg-gradient-to-r from-slate-100 to-gray-100 border border-slate-200 text-slate-700 px-6 py-4 rounded-2xl shadow-sm flex items-center gap-4 animate-slide-up">
                            <div className="bg-white/50 p-3 rounded-full shadow-sm backdrop-blur-sm">
                                <CalendarDays className="w-6 h-6 text-slate-500" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight">{dayName} - วันหยุดสุดสัปดาห์</h3>
                                <p className="text-xs text-slate-500 font-medium">ไม่มีการบันทึกข้อมูลการมาเรียน</p>
                            </div>
                        </div>
                    );
                }
                return null;
            })()}

            {/* TODAY'S STATUS - Holiday or Submission Summary */}
            {totalClasses > 0 && (
                todayHoliday ? (
                    // HOLIDAY STATUS
                    <div className="rounded-2xl shadow-sm border overflow-hidden animate-slide-up bg-gradient-to-r from-orange-100 to-amber-100 border-orange-200">
                        <div className="px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-full bg-orange-200">
                                    <Sun className="w-6 h-6 text-orange-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-orange-800">
                                        🏖️ วันหยุด: {todayHoliday.description}
                                    </h3>
                                    <p className="text-sm text-orange-600">
                                        ไม่มีการบันทึกข้อมูลการมาเรียนในวันนี้
                                    </p>
                                </div>
                            </div>
                            <div className="text-3xl">🌴</div>
                        </div>
                        <div className="h-1.5 bg-orange-400" />
                    </div>
                ) : isSchoolDay ? (
                    // SCHOOL DAY - RECORDING STATUS
                    <div className={`rounded-2xl shadow-sm border overflow-hidden animate-slide-up ${isAllSubmitted
                        ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
                        : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                        }`}>
                        <div className="px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full ${isAllSubmitted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                    {isAllSubmitted ? (
                                        <ClipboardCheck className="w-6 h-6 text-emerald-600" />
                                    ) : (
                                        <Clock className="w-6 h-6 text-amber-600" />
                                    )}
                                </div>
                                <div>
                                    <h3 className={`font-bold text-lg ${isAllSubmitted ? 'text-emerald-800' : 'text-amber-800'}`}>
                                        {isAllSubmitted ? '✅ บันทึกครบทุกห้องแล้ว!' : `📊 บันทึกแล้ว ${submittedClasses}/${totalClasses} ห้อง`}
                                    </h3>
                                    {isAllSubmitted ? (
                                        <p className="text-sm text-emerald-600">ข้อมูลวันนี้ครบถ้วน สามารถดูรายงานได้</p>
                                    ) : (
                                        <div className="text-sm text-amber-700">
                                            <span>รอข้อมูลจาก:</span>
                                            <div className="flex flex-col gap-0.5 mt-1 text-xs font-medium text-amber-800">
                                                {missingClasses.map(c => (
                                                    <span key={c.grade}>• {c.grade}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={`text-3xl font-bold ${isAllSubmitted ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {Math.round((submittedClasses / totalClasses) * 100)}%
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-white/50">
                            <div
                                className={`h-full transition-all duration-1000 ${isAllSubmitted ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${(submittedClasses / totalClasses) * 100}%` }}
                            />
                        </div>
                    </div>
                ) : null
            )}

            {/* UPCOMING EVENT ALERT - Tomorrow or Next Few Days */}
            {(() => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // Get tomorrow's date
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

                // Find events in the next 3 days (excluding today)
                const upcomingAlerts = calendarItems.filter(item => {
                    // Parse date correctly for local timezone
                    const [y, m, d] = item.date.split('-').map(Number);
                    const eventDate = new Date(y, m - 1, d);
                    const diffDays = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays > 0 && diffDays <= 3;
                });

                if (upcomingAlerts.length === 0) return null;

                // Get the most urgent alert (soonest)
                const urgentAlert = upcomingAlerts[0];
                // Parse date correctly for local timezone
                const [aY, aM, aD] = urgentAlert.date.split('-').map(Number);
                const alertDate = new Date(aY, aM - 1, aD);
                const daysUntil = Math.ceil((alertDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isTomorrow = urgentAlert.date === tomorrowStr;
                const isHoliday = urgentAlert.type === 'holiday';

                return (
                    <div className={`rounded-2xl shadow-sm border px-5 py-4 flex items-center gap-4 animate-slide-up ${isHoliday
                        ? 'bg-gradient-to-r from-orange-100 to-amber-100 border-orange-300'
                        : 'bg-gradient-to-r from-indigo-100 to-blue-100 border-indigo-300'
                        }`}>
                        <div className={`p-3 rounded-full ${isHoliday ? 'bg-orange-200' : 'bg-indigo-200'}`}>
                            {isHoliday ? (
                                <Sun className="w-6 h-6 text-orange-600" />
                            ) : (
                                <CalendarDays className="w-6 h-6 text-indigo-600" />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isTomorrow
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : 'bg-gray-200 text-gray-700'
                                    }`}>
                                    {isTomorrow ? '⚡ พรุ่งนี้!' : `อีก ${daysUntil} วัน`}
                                </span>
                                {isHoliday && <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">วันหยุด</span>}
                            </div>
                            <h3 className={`font-bold text-lg mt-1 ${isHoliday ? 'text-orange-800' : 'text-indigo-800'}`}>
                                {urgentAlert.title}
                            </h3>
                            <p className={`text-sm ${isHoliday ? 'text-orange-600' : 'text-indigo-600'}`}>
                                {alertDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                        </div>
                        {upcomingAlerts.length > 1 && (
                            <div className="text-right">
                                <div className="bg-white/50 px-3 py-1.5 rounded-xl border border-white/30">
                                    <span className="text-xs text-gray-600">+{upcomingAlerts.length - 1} อื่นๆ</span>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Combined School Calendar Section */}
            {calendarItems.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-slide-up">
                    <button
                        onClick={() => setIsActivitiesExpanded(!isActivitiesExpanded)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                        {(() => {
                            const now = new Date();
                            now.setHours(0, 0, 0, 0);
                            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            const todayItem = calendarItems.find(i => i.date === todayStr);

                            // If collapsed and has today's event, show it prominently
                            if (!isActivitiesExpanded && todayItem) {
                                const isHoliday = todayItem.type === 'holiday';
                                return (
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${isHoliday ? 'bg-orange-100' : 'bg-indigo-100'}`}>
                                            {isHoliday ? (
                                                <Sun className={`w-5 h-5 text-orange-600`} />
                                            ) : (
                                                <CalendarDays className={`w-5 h-5 text-indigo-600`} />
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <h3 className={`font-bold text-lg ${isHoliday ? 'text-orange-700' : 'text-indigo-700'}`}>
                                                {todayItem.title}
                                            </h3>
                                            <p className={`text-xs font-medium ${isHoliday ? 'text-orange-500' : 'text-indigo-500'}`}>
                                                📍 วันนี้ {todayItem.description && todayItem.description !== 'วันหยุด' ? `• ${todayItem.description}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                );
                            }

                            // Default view (expanded or no today event)
                            return (
                                <div className="flex items-center gap-3">
                                    <div className="bg-brand-100 p-2 rounded-full">
                                        <CalendarDays className="w-5 h-5 text-brand-600" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-gray-900 text-sm">
                                            ปฏิทินโรงเรียน
                                            <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                                                {calendarItems.length} รายการ
                                            </span>
                                        </h3>
                                        {(() => {
                                            if (todayItem) {
                                                return (
                                                    <p className={`text-xs font-medium flex items-center gap-1 ${todayItem.type === 'holiday' ? 'text-orange-600' : 'text-indigo-600'}`}>
                                                        <Sun className="w-3 h-3" /> วันนี้: {todayItem.title}
                                                    </p>
                                                );
                                            }

                                            const nextItem = calendarItems.find(i => i.date > todayStr);
                                            if (nextItem) {
                                                const [nY, nM, nD] = nextItem.date.split('-').map(Number);
                                                const days = Math.ceil((new Date(nY, nM - 1, nD).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                                const daysText = days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`;
                                                return (
                                                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {nextItem.title} ({daysText})
                                                    </p>
                                                );
                                            }
                                            return <p className="text-xs text-gray-400">ไม่มีรายการเร็วๆ นี้</p>;
                                        })()}
                                    </div>
                                </div>
                            );
                        })()}
                        {isActivitiesExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                    </button>

                    {isActivitiesExpanded && (
                        <div className="px-4 pb-3 border-t border-gray-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                                {calendarItems.map((item) => {
                                    // Parse date correctly for local timezone
                                    const [iY, iM, iD] = item.date.split('-').map(Number);
                                    const itemDate = new Date(iY, iM - 1, iD);
                                    const nowLocal = new Date();
                                    const todayStrLocal = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
                                    const isToday = item.date === todayStrLocal;
                                    const isHoliday = item.type === 'holiday';

                                    // Activity Styles (Blue/Indigo) vs Holiday Styles (Orange/Amber)
                                    const baseClass = isHoliday
                                        ? "bg-orange-50/50 border-orange-100 hover:border-orange-200"
                                        : "bg-indigo-50/50 border-indigo-100 hover:border-indigo-200";

                                    const activeClass = isHoliday
                                        ? "bg-orange-50 border-orange-300 shadow-md transform scale-[1.02]"
                                        : "bg-indigo-50 border-indigo-300 shadow-md transform scale-[1.02]";

                                    const iconClass = isHoliday
                                        ? "bg-orange-100 text-orange-600"
                                        : "bg-indigo-100 text-indigo-600";

                                    const activeIconClass = isHoliday
                                        ? "bg-orange-500 text-white"
                                        : "bg-indigo-500 text-white";

                                    return (
                                        <div key={`${item.type}-${item.id}`} className={`flex gap-3 p-3 rounded-xl border transition-all ${isToday ? activeClass : baseClass}`}>
                                            <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg shrink-0 ${isToday ? activeIconClass : iconClass}`}>
                                                <span className="text-lg font-bold leading-none">{itemDate.getDate()}</span>
                                                <span className="text-[9px] uppercase font-bold leading-none mt-1">{itemDate.toLocaleDateString('th-TH', { month: 'short' })}</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex justify-between items-start">
                                                    <h4 className={`font-bold text-sm truncate ${isToday ? (isHoliday ? 'text-orange-900' : 'text-indigo-900') : 'text-gray-800'}`}>
                                                        {item.title}
                                                    </h4>
                                                    {isHoliday && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-200 text-orange-800 font-bold ml-2">หยุด</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 line-clamp-1">{item.description || '-'}</p>
                                                <p className={`text-[10px] mt-1 ${isToday ? (isHoliday ? 'text-orange-600 font-bold' : 'text-indigo-600 font-bold') : 'text-gray-400'}`}>
                                                    {isToday ? 'วันนี้' : itemDate.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric' })}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Top Stats Grid - Smart Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                {/* Card 1: Total Students - Flip Card */}
                <div
                    className={`flip-card h-28 md:h-36 cursor-pointer ${flippedCards['students'] ? 'flipped' : ''}`}
                    onClick={() => toggleFlip('students')}
                >
                    <div className="flip-card-inner">
                        {/* Front */}
                        <div className="flip-card-front bg-white border border-gray-100 p-3 md:p-6 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-16 md:w-24 h-16 md:h-24 bg-blue-50 rounded-bl-full -mr-2 md:-mr-4 -mt-2 md:-mt-4"></div>
                            <div className="relative z-10 text-left">
                                <p className="text-gray-500 text-xs md:text-sm font-bold mb-0.5 md:mb-1">นักเรียนทั้งหมด</p>
                                <h3 className="text-2xl md:text-4xl font-bold text-black">{totalStudents}</h3>
                                <p className="text-[10px] text-gray-400 mt-1">แตะเพื่อดูรายละเอียด</p>
                            </div>
                            <div className="relative z-10 bg-blue-100 p-2 md:p-3 rounded-xl text-blue-600">
                                <Users className="w-5 h-5 md:w-8 md:h-8" />
                            </div>
                        </div>
                        {/* Back */}
                        <div className="flip-card-back bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400 p-3 md:p-6 flex flex-col justify-center items-center text-white">
                            <p className="text-xs md:text-sm font-bold mb-2 opacity-90">รายละเอียดนักเรียน</p>
                            <div className="flex gap-4">
                                <div className="text-center">
                                    <div className="text-xl md:text-3xl font-bold">{totalMale}</div>
                                    <div className="text-[10px] md:text-xs opacity-80">ชาย</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl md:text-3xl font-bold">{totalFemale}</div>
                                    <div className="text-[10px] md:text-xs opacity-80">หญิง</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card 2: Present - Flip Card */}
                <div
                    className={`flip-card h-28 md:h-36 cursor-pointer ${flippedCards['present'] ? 'flipped' : ''}`}
                    onClick={() => toggleFlip('present')}
                >
                    <div className="flip-card-inner">
                        {/* Front */}
                        <div className="flip-card-front bg-white border border-gray-100 p-3 md:p-6 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-16 md:w-24 h-16 md:h-24 bg-emerald-50 rounded-bl-full -mr-2 md:-mr-4 -mt-2 md:-mt-4"></div>
                            <div className="relative z-10 text-left">
                                <p className="text-gray-500 text-xs md:text-sm font-bold mb-0.5 md:mb-1">มาเรียน</p>
                                <div className="flex items-baseline gap-1 md:gap-2">
                                    <h3 className="text-2xl md:text-4xl font-bold text-emerald-600">{totalPresent}</h3>
                                    <span className="text-[10px] md:text-sm font-bold text-emerald-500">({percentPresent}%)</span>
                                </div>
                                <div className="mt-1 md:mt-2 w-24 md:w-32 bg-gray-100 rounded-full h-1 md:h-1.5">
                                    <div className="bg-emerald-500 h-1 md:h-1.5 rounded-full" style={{ width: `${percentPresent}%` }}></div>
                                </div>
                            </div>
                            <div className="relative z-10 bg-emerald-100 p-2 md:p-3 rounded-xl text-emerald-600">
                                <UserCheck className="w-5 h-5 md:w-8 md:h-8" />
                            </div>
                        </div>
                        {/* Back */}
                        <div className="flip-card-back bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-400 p-3 md:p-6 flex flex-col justify-center items-center text-white">
                            <p className="text-xs md:text-sm font-bold mb-2 opacity-90">อัตราการมาเรียน</p>
                            <div className="text-3xl md:text-5xl font-bold">{percentPresent}%</div>
                            <p className="text-[10px] md:text-xs opacity-80 mt-1">{totalPresent} จาก {totalStudents} คน</p>
                        </div>
                    </div>
                </div>

                {/* Card 3: Absent - Flip Card */}
                <div
                    className={`flip-card h-28 md:h-36 cursor-pointer ${flippedCards['absent'] ? 'flipped' : ''}`}
                    onClick={() => toggleFlip('absent')}
                >
                    <div className="flip-card-inner">
                        {/* Front */}
                        <div className="flip-card-front bg-white border border-gray-100 p-3 md:p-6 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-16 md:w-24 h-16 md:h-24 bg-rose-50 rounded-bl-full -mr-2 md:-mr-4 -mt-2 md:-mt-4"></div>
                            <div className="relative z-10 text-left">
                                <p className="text-gray-500 text-xs md:text-sm font-bold mb-0.5 md:mb-1">ขาด/ลา/ป่วย</p>
                                <h3 className="text-2xl md:text-4xl font-bold text-rose-600">{totalAbsent}</h3>
                                <p className="text-[10px] text-gray-400 mt-1">คน</p>
                            </div>
                            <div className="relative z-10 bg-rose-100 p-2 md:p-3 rounded-xl text-rose-600">
                                <UserX className="w-5 h-5 md:w-8 md:h-8" />
                            </div>
                        </div>
                        {/* Back */}
                        <div className="flip-card-back bg-gradient-to-br from-rose-500 to-rose-600 border border-rose-400 p-3 md:p-6 flex flex-col justify-center items-center text-white">
                            <p className="text-xs md:text-sm font-bold mb-2 opacity-90">อัตราการขาดเรียน</p>
                            <div className="text-3xl md:text-5xl font-bold">{totalStudents > 0 ? ((totalAbsent / totalStudents) * 100).toFixed(1) : 0}%</div>
                            <p className="text-[10px] md:text-xs opacity-80 mt-1">{totalAbsent} จาก {totalStudents} คน</p>
                        </div>
                    </div>
                </div>

                {/* Card 4: Classes Submitted - Flip Card */}
                <div
                    className={`flip-card h-28 md:h-36 cursor-pointer ${flippedCards['classes'] ? 'flipped' : ''}`}
                    onClick={() => toggleFlip('classes')}
                >
                    <div className="flip-card-inner">
                        {/* Front */}
                        <div className="flip-card-front bg-white border border-gray-100 p-3 md:p-6 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-16 md:w-24 h-16 md:h-24 bg-indigo-50 rounded-bl-full -mr-2 md:-mr-4 -mt-2 md:-mt-4"></div>
                            <div className="relative z-10 text-left">
                                <p className="text-gray-500 text-xs md:text-sm font-bold mb-0.5 md:mb-1">ห้องที่บันทึก</p>
                                <div className="flex items-baseline gap-1 md:gap-2">
                                    <h3 className={`text-2xl md:text-4xl font-bold ${isAllSubmitted ? 'text-indigo-600' : 'text-amber-600'}`}>{submittedClasses}</h3>
                                    <span className="text-sm md:text-lg font-bold text-gray-400">/ {totalClasses}</span>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">{isAllSubmitted ? 'ครบแล้ว ✓' : 'รอบันทึก'}</p>
                            </div>
                            <div className={`relative z-10 p-2 md:p-3 rounded-xl ${isAllSubmitted ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                                <ClipboardCheck className="w-5 h-5 md:w-8 md:h-8" />
                            </div>
                        </div>
                        {/* Back */}
                        <div className={`flip-card-back border p-3 md:p-6 flex flex-col justify-center items-center text-white ${isAllSubmitted ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 border-indigo-400' : 'bg-gradient-to-br from-amber-500 to-amber-600 border-amber-400'}`}>
                            <p className="text-xs md:text-sm font-bold mb-2 opacity-90">{isAllSubmitted ? 'บันทึกครบแล้ว!' : 'รอบันทึกจาก'}</p>
                            {isAllSubmitted ? (
                                <div className="text-3xl md:text-5xl font-bold">✓</div>
                            ) : (
                                <div className="text-center">
                                    <div className="flex flex-col gap-0.5 text-xs md:text-sm font-medium">
                                        {missingClasses.slice(0, 4).map(c => (
                                            <span key={c.grade}>• {c.grade.replace('ประถมศึกษาปีที่ ', 'ป.')}</span>
                                        ))}
                                        {missingClasses.length > 4 && <span className="opacity-70">+{missingClasses.length - 4} ห้อง</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Attendance Bar Chart by Grade */}
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-md border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm md:text-base font-bold text-gray-800 flex items-center gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5 text-brand-500" />
                        อัตราการมาเรียนตามระดับชั้น
                    </h3>
                    <span className="text-xs text-gray-400">{new Date(currentDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="space-y-3">
                    {(() => {
                        const order = ['อนุบาล 2', 'อนุบาล 3', 'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];
                        const sortedStats = [...allStats].sort((a, b) => order.indexOf(a.grade) - order.indexOf(b.grade));
                        const kindergartenStats = sortedStats.filter(s => s.grade.includes('อนุบาล'));
                        const primaryStats = sortedStats.filter(s => !s.grade.includes('อนุบาล'));

                        const renderBar = (stat: GradeStats) => {
                            const rate = stat.total > 0 ? (stat.present / stat.total) * 100 : 0;
                            const isGood = rate >= 90;
                            const isWarning = rate >= 80 && rate < 90;
                            return (
                                <div key={stat.grade} className="flex items-center gap-3">
                                    <div className="w-20 md:w-28 text-xs font-medium text-gray-600 truncate">{stat.grade.replace('ประถมศึกษาปีที่ ', 'ป.')}</div>
                                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden relative">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${!stat.isSubmitted ? 'bg-gray-300' :
                                                isGood ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                                                    isWarning ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                        'bg-gradient-to-r from-rose-400 to-rose-500'
                                                }`}
                                            style={{ width: stat.isSubmitted ? `${rate}%` : '100%' }}
                                        />
                                        {/* Only show "รอข้อมูล" on school days */}
                                        {isSchoolDay && !stat.isSubmitted && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-gray-500">รอข้อมูล</span>
                                            </div>
                                        )}
                                        {/* Show "วันหยุด" on non-school days */}
                                        {!isSchoolDay && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-gray-400">วันหยุด</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`w-10 text-right text-xs font-bold ${!stat.isSubmitted ? 'text-gray-400' :
                                        isGood ? 'text-emerald-600' :
                                            isWarning ? 'text-amber-600' :
                                                'text-rose-600'
                                        }`}>
                                        {stat.isSubmitted ? `${rate.toFixed(0)}%` : '-'}
                                    </div>
                                    <div className="w-24 text-right text-[10px] font-medium text-gray-600">
                                        <span className="font-bold text-gray-700">{stat.total}</span> (ช {stat.male}/ญ {stat.female})
                                    </div>
                                </div>
                            );
                        };

                        return (
                            <>
                                {/* Kindergarten Section */}
                                {kindergartenStats.length > 0 && (
                                    <div className="mb-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Baby className="w-3.5 h-3.5 text-orange-500" />
                                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">ระดับปฐมวัย</span>
                                            <div className="flex-1 h-px bg-orange-200"></div>
                                        </div>
                                        <div className="space-y-2">
                                            {kindergartenStats.map(renderBar)}
                                        </div>
                                    </div>
                                )}

                                {/* Primary Section */}
                                {primaryStats.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">ระดับประถมศึกษา</span>
                                            <div className="flex-1 h-px bg-blue-200"></div>
                                        </div>
                                        <div className="space-y-2">
                                            {primaryStats.map(renderBar)}
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] text-gray-500">≥90% ดีมาก</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span className="text-[10px] text-gray-500">80-89% พอใช้</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                        <span className="text-[10px] text-gray-500">&lt;80% ต้องปรับปรุง</span>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: Carousels */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                    <h3 className="text-lg font-bold text-black flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-brand-500" />
                        ข้อมูลรายระดับชั้น
                    </h3>

                    <div className="flex flex-col gap-4">
                        {kStats.length > 0 && (
                            <div>
                                {renderCarousel(
                                    "ระดับปฐมวัย",
                                    <Baby className="w-4 h-4" />,
                                    kStats,
                                    kIndex,
                                    setKIndex,
                                    'K',
                                    "bg-gradient-to-r from-orange-400 to-amber-400"
                                )}
                            </div>
                        )}
                        <div>
                            {renderCarousel(
                                "ระดับประถมศึกษา",
                                <BookOpen className="w-4 h-4" />,
                                pStats,
                                pIndex,
                                setPIndex,
                                'P',
                                "bg-gradient-to-r from-blue-500 to-indigo-500"
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Absent Details List */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-black flex items-center gap-2">
                            <UserX className="w-5 h-5 text-rose-500" />
                            รายชื่อนักเรียนที่ขาดเรียน (รวม)
                        </h3>
                        {totalAbsent > 0 && <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-xs font-bold">{totalAbsent} คน</span>}
                    </div>

                    <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: '450px' }}>
                        {/* Header of List */}
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                            <span className="text-sm font-bold text-gray-600">รายชื่อนักเรียน</span>
                        </div>

                        {/* Scrollable List */}
                        <div className="overflow-y-auto flex-1 p-2 hover-scrollbar">
                            {totalAbsent === 0 ? (
                                <div className="h-40 flex flex-col items-center justify-center text-emerald-600 gap-2">
                                    <div className="p-3 bg-emerald-50 rounded-full text-emerald-500">
                                        <UserCheck className="w-8 h-8" />
                                    </div>
                                    <p className="text-sm font-bold">สุดยอด! วันนี้มาเรียนครบทุกคน</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Group students by grade */}
                                    {(() => {
                                        const absentStudents = attendances
                                            .filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status));
                                        const grouped: { [key: string]: AttendanceRecord[] } = {};
                                        absentStudents.forEach(student => {
                                            if (!grouped[student.grade]) grouped[student.grade] = [];
                                            grouped[student.grade].push(student);
                                        });
                                        // Custom grade order (Kindergarten → Primary)
                                        const gradeOrder = ['อนุบาล 2', 'อนุบาล 3', 'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];

                                        // Separate into Kindergarten and Primary
                                        const sortedGrades = Object.entries(grouped)
                                            .sort(([a], [b]) => {
                                                const indexA = gradeOrder.indexOf(a);
                                                const indexB = gradeOrder.indexOf(b);
                                                if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                                                if (indexA === -1) return 1;
                                                if (indexB === -1) return -1;
                                                return indexA - indexB;
                                            });

                                        const kindergartenGrades = sortedGrades.filter(([grade]) => grade.includes('อนุบาล'));
                                        const primaryGrades = sortedGrades.filter(([grade]) => !grade.includes('อนุบาล'));

                                        const renderGradeSection = ([grade, gradeStudents]: [string, AttendanceRecord[]]) => {
                                            // Find grade stats to get total students
                                            const gradeStat = allStats.find(s => s.grade === grade);
                                            const totalInGrade = gradeStat?.total || gradeStudents.length;
                                            const absentPercent = totalInGrade > 0 ? (gradeStudents.length / totalInGrade) * 100 : 0;
                                            // Color based on school level
                                            const isKindergarten = grade.includes('อนุบาล');
                                            const bgColor = isKindergarten ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-300';
                                            const textColor = isKindergarten ? 'text-orange-700' : 'text-blue-700';
                                            const countColor = isKindergarten ? 'text-orange-600' : 'text-blue-600';
                                            // Progress bar color based on absent percentage
                                            const barColor = absentPercent >= 30 ? 'bg-rose-500' :
                                                absentPercent >= 15 ? 'bg-amber-500' : 'bg-emerald-500';
                                            const barBgColor = isKindergarten ? 'bg-orange-200' : 'bg-blue-200';
                                            return (
                                                <div key={grade} className="mb-3 last:mb-0">
                                                    {/* Grade Header with Progress Bar */}
                                                    <div className={`px-3 py-2 rounded-lg mb-2 border ${bgColor}`}>
                                                        <div className="flex justify-between items-center mb-1.5">
                                                            <span className={`text-xs font-bold ${textColor}`}>{grade}</span>
                                                            <span className={`text-xs font-bold ${countColor}`}>{gradeStudents.length} / {totalInGrade} คน</span>
                                                        </div>
                                                        {/* Progress Bar */}
                                                        <div className={`h-1.5 ${barBgColor} rounded-full overflow-hidden`}>
                                                            <div
                                                                className={`h-full ${barColor} rounded-full transition-all duration-500`}
                                                                style={{ width: `${Math.min(absentPercent, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {/* Students in this grade */}
                                                    <div className="space-y-0.5">
                                                        {gradeStudents.map((student, idx) => (
                                                            <div key={`${student.studentId}-${idx}`} className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                                                                } hover:bg-blue-50`}>
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${student.gender === Gender.MALE ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                                                                        {student.gender === Gender.MALE ? 'ช' : 'ญ'}
                                                                    </div>
                                                                    <div className="text-xs font-medium text-gray-800">{student.studentName}</div>
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${student.status === AttendanceStatus.ABSENT ? 'bg-red-100 text-red-600' :
                                                                    student.status === AttendanceStatus.SICK ? 'bg-blue-100 text-blue-600' :
                                                                        'bg-purple-100 text-purple-600'
                                                                    }`}>
                                                                    {student.status}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        };

                                        return (
                                            <>
                                                {/* Kindergarten Section */}
                                                {kindergartenGrades.length > 0 && (
                                                    <div className="mb-4">
                                                        <div className="flex items-center gap-2 mb-2 px-1">
                                                            <Baby className="w-4 h-4 text-orange-500" />
                                                            <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">ระดับปฐมวัย</span>
                                                            <div className="flex-1 h-px bg-orange-200"></div>
                                                        </div>
                                                        {kindergartenGrades.map(renderGradeSection)}
                                                    </div>
                                                )}

                                                {/* Primary Section */}
                                                {primaryGrades.length > 0 && (
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2 px-1">
                                                            <BookOpen className="w-4 h-4 text-blue-500" />
                                                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">ระดับประถมศึกษา</span>
                                                            <div className="flex-1 h-px bg-blue-200"></div>
                                                        </div>
                                                        {primaryGrades.map(renderGradeSection)}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Daily Report Modal */}
            {showReportModal && (
                <DailyReport
                    students={students}
                    attendances={attendances}
                    date={currentDate}
                    onClose={() => setShowReportModal(false)}
                />
            )}
        </div>
    );
};
