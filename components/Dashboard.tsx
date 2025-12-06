
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
    Users, UserCheck, UserX, Sun,
    ChevronRight, ChevronLeft, LayoutGrid,
    Baby, BookOpen, Activity, CalendarDays,
    ClipboardCheck, AlertTriangle, Clock, Printer,
    ChevronDown, ChevronUp, CalendarCheck
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AttendanceStatus, Gender, Holiday } from '../types';
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
    const [todayHoliday, setTodayHoliday] = useState<Holiday | null>(null);

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

    // Holidays Collapsible State
    const [isHolidaysExpanded, setIsHolidaysExpanded] = useState(false);

    // Use parent holidays if provided, otherwise cache locally
    const [holidaysCache, setHolidaysCache] = useState<Holiday[] | null>(parentHolidays || null);

    useEffect(() => {
        fetchData(currentDate);
    }, [currentDate]); // Only re-fetch when date changes

    const fetchData = async (targetDate: string) => {
        setLoading(true);
        try {
            // Use parent holidays or cached holidays, only fetch if neither available
            let holidays = parentHolidays || holidaysCache;
            if (!holidays) {
                const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
                holidays = holidaysSnapshot.docs.map(doc => doc.data() as Holiday);
                setHolidaysCache(holidays);
            }

            const holiday = holidays.find(h => h.date === targetDate);
            setTodayHoliday(holiday || null);

            // Check if it's a weekend - skip fetching attendance data
            const dateObj = new Date(targetDate);
            const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
            const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

            if (isWeekendDay) {
                setAttendances([]); // No attendance on weekends
                return;
            }

            // Students are now passed via props, no need to fetch here
            // const studentsSnapshot = await getDocs(collection(db, 'students'));
            // const studentsData = studentsSnapshot.docs.map(doc => mapStudentData(doc.id, doc.data()));
            // setStudents(studentsData);

            const q = query(collection(db, 'attendance'), where('date', '==', targetDate));
            const attSnapshot = await getDocs(q);
            const attData = attSnapshot.docs.map(doc => doc.data() as AttendanceRecord);
            setAttendances(attData);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Memoize expensive grade statistics calculation
    const allStats = useMemo((): GradeStats[] => {
        const uniqueGrades = Array.from(new Set(students.map(s => s.grade))) as string[];
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
            const studentsInGrade = students.filter(s => s.grade === grade);
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
    }, [students, attendances]);

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
        totalStudents: students.length,
        totalMale: students.filter(s => s.gender === Gender.MALE).length,
        totalFemale: students.filter(s => s.gender === Gender.FEMALE).length
    }), [students]);

    // Memoize attendance totals
    const { totalAbsent, totalPresent, percentPresent } = useMemo(() => {
        const absentCount = attendances.filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status)).length;
        const presentCount = attendances.filter(a => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
        return {
            totalAbsent: absentCount,
            totalPresent: presentCount,
            percentPresent: students.length > 0 ? ((presentCount / students.length) * 100).toFixed(1) : '0.0'
        };
    }, [attendances, students.length]);

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
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-4 animate-fade-in">
                        <div className="bg-slate-100 p-4 rounded-full mb-3 shadow-sm">
                            <CalendarDays className="w-8 h-8 text-slate-500" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-700 mb-1">วันหยุด</h4>
                        <p className="text-sm text-gray-400">ไม่มีการบันทึกข้อมูล</p>
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
        <div className={containerClass}>
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

            {/* Monthly Holidays Section */}
            {(() => {
                const holidays = parentHolidays || holidaysCache || [];
                const currentMonth = new Date(currentDate).getMonth();
                const currentYear = new Date(currentDate).getFullYear();
                const monthlyHolidays = holidays.filter(h => {
                    const d = new Date(h.date);
                    // Only show holidays from today onwards in current month
                    return d.getMonth() === currentMonth && d.getFullYear() === currentYear && h.date >= currentDate;
                }).sort((a, b) => a.date.localeCompare(b.date));

                if (monthlyHolidays.length === 0) return null;

                const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

                return (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl shadow-sm overflow-hidden animate-slide-up">
                        {/* Header - Always visible */}
                        <button
                            onClick={() => setIsHolidaysExpanded(!isHolidaysExpanded)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-amber-100 p-2 rounded-full">
                                    <CalendarCheck className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-bold text-amber-800 text-sm">
                                        วันหยุดเดือน{thaiMonths[currentMonth]}
                                        <span className="ml-2 bg-amber-200 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                                            {monthlyHolidays.length} วัน
                                        </span>
                                    </h3>
                                    {todayHoliday ? (
                                        <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
                                            <Sun className="w-3 h-3" /> วันนี้เป็นวันหยุด: {todayHoliday.description}
                                        </p>
                                    ) : (() => {
                                        // Find next upcoming holiday
                                        const upcomingHolidays = holidays.filter(h => h.date > currentDate).sort((a, b) => a.date.localeCompare(b.date));
                                        if (upcomingHolidays.length === 0) return null;
                                        const next = upcomingHolidays[0];
                                        const nextDate = new Date(next.date);
                                        const daysUntil = Math.ceil((nextDate.getTime() - new Date(currentDate).getTime()) / (1000 * 60 * 60 * 24));
                                        return (
                                            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> วันหยุดถัดไป: {next.description} (อีก {daysUntil} วัน)
                                            </p>
                                        );
                                    })()}
                                </div>
                            </div>
                            {isHolidaysExpanded ? (
                                <ChevronUp className="w-5 h-5 text-amber-500" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-amber-500" />
                            )}
                        </button>

                        {/* Expandable Content */}
                        {isHolidaysExpanded && (
                            <div className="px-4 pb-3 border-t border-amber-200/50">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                    {monthlyHolidays.map((h, idx) => {
                                        const d = new Date(h.date);
                                        const isToday = h.date === currentDate;
                                        return (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isToday ? 'bg-orange-200/70 border border-orange-300' : 'bg-white/60 border border-amber-100'
                                                    }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isToday ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {d.getDate()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium truncate ${isToday ? 'text-orange-800' : 'text-amber-800'}`}>
                                                        {h.description}
                                                    </p>
                                                    <p className="text-[10px] text-amber-600">
                                                        {d.toLocaleDateString('th-TH', { weekday: 'short' })}
                                                    </p>
                                                </div>
                                                {isToday && <Sun className="w-4 h-4 text-orange-500 shrink-0" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Missing Data Alert Box - Hide on weekends and holidays */}
            {missingClasses.length > 0 && !todayHoliday && (() => {
                const dateObj = new Date(currentDate);
                const dayOfWeek = dateObj.getDay();
                return dayOfWeek !== 0 && dayOfWeek !== 6; // Not Saturday or Sunday
            })() && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-slide-up shadow-sm">
                        <div className="bg-amber-100 p-2 rounded-full shrink-0">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-amber-800 text-lg flex items-center gap-2">
                                รอการบันทึกข้อมูล
                                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200">
                                    {missingClasses.length} ห้อง
                                </span>
                            </h3>
                            <p className="text-sm text-amber-700 mt-1">
                                ห้องเรียนต่อไปนี้ยังไม่ได้บันทึกข้อมูลการมาเรียน:
                                <span className="font-bold ml-1">
                                    {missingClasses.map(c => c.grade).join(', ')}
                                </span>
                            </p>
                        </div>
                    </div>
                )}

            {/* Top Stats Grid - Smart Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {/* Card 0: Submission Status (NEW) */}
                <div className="bg-white rounded-2xl p-3 md:p-6 shadow-md border border-gray-100 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className={`absolute right-0 top-0 w-16 md:w-24 h-16 md:h-24 rounded-bl-full -mr-2 md:-mr-4 -mt-2 md:-mt-4 transition-transform group-hover:scale-110 ${isAllSubmitted ? 'bg-emerald-50' : 'bg-amber-50'}`}></div>
                    <div className="relative z-10">
                        <p className="text-gray-500 text-xs md:text-sm font-bold mb-0.5 md:mb-1">สถานะบันทึก</p>
                        <div className="flex items-baseline gap-1 md:gap-2">
                            <h3 className={`text-2xl md:text-4xl font-bold ${isAllSubmitted ? 'text-emerald-600' : 'text-amber-500'}`}>
                                {submittedClasses}<span className="text-lg md:text-2xl text-gray-400">/{totalClasses}</span>
                            </h3>
                        </div>
                        <div className="mt-1 md:mt-2 w-full bg-gray-100 rounded-full h-1 md:h-1.5">
                            <div
                                className={`h-1 md:h-1.5 rounded-full transition-all duration-1000 ${isAllSubmitted ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${totalClasses > 0 ? (submittedClasses / totalClasses) * 100 : 0}%` }}
                            ></div>
                        </div>
                    </div>
                    <div className={`relative z-10 p-2 md:p-3 rounded-xl ${isAllSubmitted ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        <ClipboardCheck className="w-5 h-5 md:w-8 md:h-8" />
                    </div>
                </div>
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
                                    <div className={`w-12 text-right text-xs font-bold ${!stat.isSubmitted ? 'text-gray-400' :
                                        isGood ? 'text-emerald-600' :
                                            isWarning ? 'text-amber-600' :
                                                'text-rose-600'
                                        }`}>
                                        {stat.isSubmitted ? `${rate.toFixed(0)}%` : '-'}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {kStats.length > 0 && (
                            <div className="md:col-span-1">
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
                        <div className={kStats.length > 0 ? "md:col-span-1" : "md:col-span-2"}>
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
