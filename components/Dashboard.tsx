
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
    UserCheck, UserX, Sun,
    ChevronRight, ChevronLeft, LayoutGrid,
    Baby, BookOpen, Activity,
    ClipboardCheck, AlertTriangle, Clock, Printer,
    ChevronDown, ChevronUp, CalendarDays
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


    // Touch State for Swipe
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);

    // Scroll Animation State - Multiple Sections
    const chartRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const carouselRef = useRef<HTMLDivElement>(null);
    const absentRef = useRef<HTMLDivElement>(null);

    const [isChartVisible, setIsChartVisible] = useState(false);
    const [isCalendarVisible, setIsCalendarVisible] = useState(false);
    const [isCarouselVisible, setIsCarouselVisible] = useState(false);
    const [isAbsentVisible, setIsAbsentVisible] = useState(false);

    // Calendar Section Expanded State
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

    // Intersection Observer for scroll animation - All Sections
    useEffect(() => {
        // Reset all animations when loading starts
        if (loading) {
            setIsChartVisible(false);
            setIsCalendarVisible(false);
            setIsCarouselVisible(false);
            setIsAbsentVisible(false);
            return;
        }

        // Delay to ensure animations are visible
        const timer = setTimeout(() => {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            const target = entry.target as HTMLElement;
                            const sectionId = target.dataset.section;

                            if (sectionId === 'chart') setIsChartVisible(true);
                            if (sectionId === 'calendar') setIsCalendarVisible(true);
                            if (sectionId === 'carousel') setIsCarouselVisible(true);
                            if (sectionId === 'absent') setIsAbsentVisible(true);
                        }
                    });
                },
                { threshold: 0.2 }
            );

            // Observe all sections
            if (chartRef.current) observer.observe(chartRef.current);
            if (calendarRef.current) observer.observe(calendarRef.current);
            if (carouselRef.current) observer.observe(carouselRef.current);
            if (absentRef.current) observer.observe(absentRef.current);

            return () => observer.disconnect();
        }, 500);

        return () => clearTimeout(timer);
    }, [loading]);

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
                <div ref={calendarRef} data-section="calendar" className={`bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-1000 ${isCalendarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
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


            {/* Combined Attendance Chart - Radial Gauge + Bar Chart */}
            <div ref={chartRef} data-section="chart" className={`bg-white rounded-2xl p-4 md:p-6 shadow-md border border-gray-100 transition-all duration-1000 ${isChartVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm md:text-base font-bold text-gray-800 flex items-center gap-2">
                        <Activity className="w-4 h-4 md:w-5 md:h-5 text-brand-500" />
                        ภาพรวมการมาเรียน
                    </h3>
                    <span className="text-xs text-gray-400">{new Date(currentDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                </div>

                {/* Radial Gauge - Overall Attendance */}
                <div className="flex flex-col items-center mb-6">
                    <div className="relative w-40 h-40 md:w-48 md:h-48">
                        {/* Background Arc */}
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Background track */}
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                fill="none"
                                stroke="#e5e7eb"
                                strokeWidth="10"
                                strokeLinecap="round"
                            />
                            {/* Progress arc with gradient */}
                            <defs>
                                <linearGradient id="attendanceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#8b5cf6" />
                                    <stop offset="50%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                </linearGradient>
                            </defs>
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                fill="none"
                                stroke="url(#attendanceGradient)"
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeDasharray={isChartVisible ? `${percentPresent * 2.64} 264` : '0 264'}
                                style={{ transition: 'stroke-dasharray 2.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                            />
                        </svg>
                        {/* Center Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                                {percentPresent}%
                            </div>
                            <div className="text-xs text-gray-500 font-medium">อัตราการมาเรียนรวม</div>
                        </div>
                    </div>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-4 gap-3 mt-4 w-full max-w-md">
                        <div className="text-center p-2 rounded-xl bg-blue-50">
                            <div className="text-lg font-bold text-blue-600">{totalStudents}</div>
                            <div className="text-[10px] text-gray-500 font-medium">ทั้งหมด</div>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-emerald-50">
                            <div className="text-lg font-bold text-emerald-600">
                                {totalPresent}<span className="text-xs text-emerald-400">/{totalStudents}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">มาเรียน</div>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-rose-50">
                            <div className="text-lg font-bold text-rose-600">
                                {totalAbsent}<span className="text-xs text-rose-400">/{totalStudents}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">ขาด/ลา</div>
                        </div>
                        <div className={`text-center p-2 rounded-xl ${isAllSubmitted ? 'bg-indigo-50' : 'bg-amber-50'}`}>
                            <div className={`text-lg font-bold ${isAllSubmitted ? 'text-indigo-600' : 'text-amber-600'}`}>
                                {submittedClasses}/{totalClasses}
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">
                                {isAllSubmitted ? 'ครบแล้ว ✓' : 'รอบันทึก'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">รายละเอียดรายชั้นเรียน</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                {/* Compact Bar Chart by Grade */}
                <div className="space-y-2">
                    {(() => {
                        const order = ['อนุบาล 2', 'อนุบาล 3', 'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];
                        const sortedStats = [...allStats].sort((a, b) => order.indexOf(a.grade) - order.indexOf(b.grade));

                        return sortedStats.map((stat, index) => {
                            const rate = stat.total > 0 ? (stat.present / stat.total) * 100 : 0;
                            const isGood = rate >= 90;
                            const isWarning = rate >= 80 && rate < 90;
                            const isKindergarten = stat.grade.includes('อนุบาล');
                            const animationDelay = index * 150; // Staggered animation (slower)

                            // Status indicator
                            const getStatusIcon = () => {
                                if (!stat.isSubmitted) return <Clock className="w-3 h-3 text-gray-400" />;
                                if (isGood) return <UserCheck className="w-3 h-3 text-emerald-500" />;
                                if (isWarning) return <AlertTriangle className="w-3 h-3 text-amber-500" />;
                                return <UserX className="w-3 h-3 text-rose-500" />;
                            };

                            return (
                                <div
                                    key={stat.grade}
                                    className={`group hover:bg-gray-50 p-1.5 rounded-lg transition-all duration-800 ease-out ${isChartVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}`}
                                    style={{ transitionDelay: isChartVisible ? `${animationDelay + 300}ms` : '0ms' }}
                                >
                                    {/* Main row */}
                                    <div className="flex items-center gap-2">
                                        {/* Grade indicator */}
                                        <div className={`w-1.5 h-8 rounded-full ${isKindergarten ? 'bg-orange-400' : 'bg-blue-400'}`}></div>

                                        {/* Grade name */}
                                        <div className="w-16 md:w-20 text-xs font-medium text-gray-700 truncate">
                                            {stat.grade.replace('ประถมศึกษาปีที่ ', 'ป.').replace('อนุบาล ', 'อ.')}
                                        </div>

                                        {/* Progress bar */}
                                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                                            <div
                                                className={`h-full rounded-full ${!stat.isSubmitted ? 'bg-gray-300' :
                                                    isGood ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                                                        isWarning ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                            'bg-gradient-to-r from-rose-400 to-rose-500'
                                                    }`}
                                                style={{
                                                    width: isChartVisible && stat.isSubmitted ? `${rate}%` : (stat.isSubmitted ? '0%' : '100%'),
                                                    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transitionDelay: isChartVisible ? `${animationDelay + 500}ms` : '0ms'
                                                }}
                                            />
                                            {/* Overlay text for waiting/holiday */}
                                            {isSchoolDay && !stat.isSubmitted && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[9px] font-bold text-gray-500">รอข้อมูล</span>
                                                </div>
                                            )}
                                            {!isSchoolDay && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[9px] font-bold text-gray-400">วันหยุด</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Status icon */}
                                        <div className="w-5 flex justify-center">
                                            {getStatusIcon()}
                                        </div>

                                        {/* Percentage */}
                                        <div className={`w-11 text-right text-xs font-bold ${!stat.isSubmitted ? 'text-gray-400' :
                                            isGood ? 'text-emerald-600' :
                                                isWarning ? 'text-amber-600' :
                                                    'text-rose-600'
                                            }`}>
                                            {stat.isSubmitted ? `${rate.toFixed(0)}%` : '-'}
                                        </div>
                                    </div>

                                    {/* Present/Absent counts - Below the bar */}
                                    {stat.isSubmitted && (
                                        <div className="flex items-center gap-2 ml-[72px] md:ml-[88px] mt-0.5 text-[10px]">
                                            <span className="text-gray-600">
                                                <span className="font-bold">{stat.total}</span>
                                                <span className="text-gray-400 ml-0.5">คน</span>
                                            </span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-emerald-600">
                                                <span className="font-bold">{stat.present}</span>
                                                <span className="text-gray-400 ml-0.5">มา</span>
                                            </span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-rose-500">
                                                <span className="font-bold">{stat.absent}</span>
                                                <span className="text-gray-400 ml-0.5">ขาด</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] text-gray-500">≥90% ดีมาก</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] text-gray-500">80-89% พอใช้</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <UserX className="w-3 h-3 text-rose-500" />
                        <span className="text-[10px] text-gray-500">&lt;80% ต้องปรับปรุง</span>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: Carousels */}
                <div ref={carouselRef} data-section="carousel" className={`lg:col-span-7 flex flex-col gap-6 transition-all duration-1000 ${isCarouselVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
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
                <div ref={absentRef} data-section="absent" className={`lg:col-span-5 flex flex-col gap-4 transition-all duration-1000 delay-200 ${isAbsentVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
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
