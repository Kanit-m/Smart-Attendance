import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Save, Loader2, LayoutDashboard, ArrowLeft,
    Calendar as CalendarIcon, X, CheckCircle2,
    UserCheck, UserX, Clock, Thermometer, Calendar,
    CheckSquare, Square, Contact,
    ClipboardList, ChevronLeft, ChevronRight, PieChart,
    Building2, RotateCcw, History, Activity, AlertTriangle, ClipboardCheck, Printer, Eye
} from 'lucide-react';
import {
    collection, getDocs, query, where, writeBatch, doc
} from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceStatus, Holiday, Role, Gender, AttendanceRecord, StudentStatus } from '../types';
import { Dashboard } from './Dashboard';
import { ConfirmationModal } from './ConfirmationModal';
import { AttendanceHeatmap } from './AttendanceHeatmap';
import { StudentHistoryCard } from './StudentHistoryCard';
import { TeacherBottomNav } from './TeacherBottomNav';

interface TeacherPanelProps {
    currentUser: { name: string; role: string; assignedClass?: string };
    allStudents?: Student[];
    onBackToAdmin?: () => void;
    onLogout: () => void;
    isDataStale?: boolean;
    onRefresh?: () => void;
    viewAsTeacherName?: string | null; // Admin can view as specific teacher
}

const GRADE_OPTIONS = [
    'อนุบาล 2', 'อนุบาล 3',
    'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3',
    'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'
];

const STATUS_CONFIG = [
    { status: AttendanceStatus.PRESENT, label: 'มา', color: 'bg-emerald-500 hover:bg-emerald-600', text: 'text-emerald-600', bg: 'bg-emerald-100', icon: UserCheck },
    { status: AttendanceStatus.LATE, label: 'สาย', color: 'bg-yellow-500 hover:bg-yellow-600', text: 'text-yellow-600', bg: 'bg-yellow-100', icon: Clock },
    { status: AttendanceStatus.SICK, label: 'ป่วย', color: 'bg-blue-500 hover:bg-blue-600', text: 'text-blue-600', bg: 'bg-blue-100', icon: Thermometer },
    { status: AttendanceStatus.PERSONAL, label: 'ลา', color: 'bg-purple-500 hover:bg-purple-600', text: 'text-purple-600', bg: 'bg-purple-100', icon: Calendar },
    { status: AttendanceStatus.ABSENT, label: 'ขาด', color: 'bg-rose-500 hover:bg-rose-600', text: 'text-rose-600', bg: 'bg-rose-100', icon: UserX },
];

export const TeacherPanel: React.FC<TeacherPanelProps> = ({ currentUser, allStudents = [], onBackToAdmin, onLogout, isDataStale = false, onRefresh, viewAsTeacherName }) => {
    // Compute effective teacher name for duty calculation (Admin can view as another teacher)
    const effectiveTeacherName = viewAsTeacherName || currentUser.name;
    // Navigation & View State
    const [currentView, setCurrentView] = useState<'check' | 'dashboard' | 'school_dashboard' | 'room_history'>('school_dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop default open

    // Data State
    const [students, setStudents] = useState<Student[]>([]);
    const [attendanceState, setAttendanceState] = useState<Record<string, AttendanceStatus>>({});
    const [initialAttendanceState, setInitialAttendanceState] = useState<Record<string, AttendanceStatus>>({});
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>(currentUser.assignedClass || GRADE_OPTIONS[0]);

    // Success Toast State
    const [showSuccessToast, setShowSuccessToast] = useState(false);

    // History Report State
    const [historyStartDate, setHistoryStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [historyData, setHistoryData] = useState<{
        dates: string[];
        students: Student[];
        records: Record<string, Record<string, AttendanceStatus>>;
        stats: Record<string, { present: number; absent: number; late: number; sick: number; personal: number; total: number }>;
    } | null>(null);
    const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<Student | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Multi-Selection State
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

    // Attendance Reminder Modal State (for past missing days only)
    const [showAttendanceReminder, setShowAttendanceReminder] = useState(false);
    const [hasCheckedReminder, setHasCheckedReminder] = useState(false);
    const [pastMissingDates, setPastMissingDates] = useState<string[]>([]); // Excludes today

    // Missing Days Badge State (includes today)
    const [missingDates, setMissingDates] = useState<string[]>([]);

    // Track if holidays have been loaded
    const [holidaysLoaded, setHolidaysLoaded] = useState(false);

    // Missing Print Days State (for duty schedule)
    const [dutySchedule, setDutySchedule] = useState<Record<string, string[]>>({});
    const [myMissingPrintDays, setMyMissingPrintDays] = useState<string[]>([]);
    const [showMissingPrintModal, setShowMissingPrintModal] = useState(false);
    const [showPrintPopover, setShowPrintPopover] = useState(false);
    const [dutyScheduleLoaded, setDutyScheduleLoaded] = useState(false);

    // Recording Status for Duty Day (shows all classes' recording status)
    const [isTodayMyDutyDay, setIsTodayMyDutyDay] = useState(false);
    const [allClassesRecordingStatus, setAllClassesRecordingStatus] = useState<{
        grade: string;
        isRecorded: boolean;
        totalStudents: number;
        recordedCount: number;
    }[]>([]);
    const [showRecordingPopover, setShowRecordingPopover] = useState(false);
    const [loadingRecordingStatus, setLoadingRecordingStatus] = useState(false);

    // Check if there are unsaved changes
    const hasUnsavedChanges = useMemo(() => {
        return JSON.stringify(attendanceState) !== JSON.stringify(initialAttendanceState);
    }, [attendanceState, initialAttendanceState]);

    // --- Cache Configuration ---
    const HOLIDAYS_CACHE_KEY = 'cached_holidays';
    const HOLIDAYS_TIME_KEY = 'cached_holidays_time';
    const HOLIDAYS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    // --- Data Loading ---
    useEffect(() => {
        if (holidaysLoaded) return; // Skip if already loaded

        // Try cache first
        const now = Date.now();
        const cached = localStorage.getItem(HOLIDAYS_CACHE_KEY);
        const cachedTime = localStorage.getItem(HOLIDAYS_TIME_KEY);

        if (cached && cachedTime && (now - parseInt(cachedTime)) < HOLIDAYS_CACHE_DURATION) {
            setHolidays(JSON.parse(cached));
            setHolidaysLoaded(true);
            return;
        }

        // Fetch from Firestore
        getDocs(query(collection(db, 'holidays'))).then(snap => {
            const data = snap.docs.map(d => d.data() as Holiday);
            setHolidays(data);
            setHolidaysLoaded(true);
            // Save to cache
            try {
                localStorage.setItem(HOLIDAYS_CACHE_KEY, JSON.stringify(data));
                localStorage.setItem(HOLIDAYS_TIME_KEY, now.toString());
            } catch { /* ignore storage errors */ }
        });
    }, [holidaysLoaded]);

    useEffect(() => {
        if (currentUser.role === Role.TEACHER && currentUser.assignedClass) {
            setSelectedClass(prev => prev !== currentUser.assignedClass ? currentUser.assignedClass! : prev);
        }
    }, [currentUser.role, currentUser.assignedClass]);

    useEffect(() => {
        if (!selectedClass) return;
        setLoading(true);
        setHistoryData(null); // Reset history when class changes

        // Filter students based on selectedDate - include students who:
        // 1. Were enrolled ON or BEFORE the viewing date
        // 2. Hadn't withdrawn by the viewing date
        const viewingDayEnd = new Date(selectedDate).getTime() + (24 * 60 * 60 * 1000) - 1; // 23:59:59 of viewing day
        const data = allStudents.filter(s => {
            if (s.grade !== selectedClass) return false;

            // Exclude students added AFTER the viewing date
            if (s.createdAt && s.createdAt > viewingDayEnd) return false;

            // Include if never withdrawn
            if (s.status !== StudentStatus.WITHDRAWN || !s.withdrawnAt) return true;
            // Include if withdrew AFTER the viewing date
            return s.withdrawnAt > viewingDayEnd;
        });
        data.sort((a, b) => (a.number || 0) - (b.number || 0));
        setStudents(data);
        setLoading(false);
        // Clear selection when class changes
        setSelectedStudentIds(new Set());
    }, [selectedClass, allStudents, selectedDate]);

    // Refactored loading logic to be reusable for Reset
    const loadAttendanceData = useCallback(async () => {
        if (students.length === 0) return;

        const ATTENDANCE_CACHE_PREFIX = 'att_cache_';
        const ATTENDANCE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        const cacheKey = `${ATTENDANCE_CACHE_PREFIX}${selectedDate}_${selectedClass}`;
        const cacheTimeKey = `${cacheKey}_time`;

        try {
            // Try sessionStorage cache first
            const cached = sessionStorage.getItem(cacheKey);
            const cachedTime = sessionStorage.getItem(cacheTimeKey);
            const now = Date.now();

            let existing: Map<string, string>;

            if (cached && cachedTime && (now - parseInt(cachedTime)) < ATTENDANCE_CACHE_DURATION) {
                // Use cached data
                existing = new Map(JSON.parse(cached));
            } else {
                // Fetch from Firestore
                const q = query(collection(db, 'attendance'), where('date', '==', selectedDate), where('grade', '==', selectedClass));
                const snap = await getDocs(q);
                existing = new Map(snap.docs.map(d => [d.data().studentId, d.data().status]));

                // Save to sessionStorage
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify([...existing]));
                    sessionStorage.setItem(cacheTimeKey, now.toString());
                } catch { /* ignore */ }
            }

            const isHoliday = holidays.find(h => h.date === selectedDate);
            const newState: Record<string, AttendanceStatus> = {};

            students.forEach(s => {
                newState[s.id] = (existing.get(s.id) as AttendanceStatus) || (isHoliday ? AttendanceStatus.HOLIDAY : AttendanceStatus.PRESENT);
            });
            setAttendanceState(newState);
            setInitialAttendanceState(newState); // Store initial state for comparison
        } catch (error) {
            console.error("Error loading attendance:", error);
        }
    }, [selectedDate, students, holidays, selectedClass]);

    useEffect(() => {
        if ((currentView === 'check' || currentView === 'dashboard')) {
            loadAttendanceData();
        }
    }, [loadAttendanceData, currentView]);

    // Calculate missing days by querying Firestore for recorded dates (with cache)
    useEffect(() => {
        if (!currentUser.assignedClass) return;
        if (!holidaysLoaded) return;

        const MISSING_DAYS_CACHE_KEY = `missing_days_${currentUser.assignedClass}`;
        const MISSING_DAYS_TIME_KEY = `missing_days_time_${currentUser.assignedClass}`;
        const MISSING_DAYS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

        const calculateMissingDays = async () => {
            const now = Date.now();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            // Check cache first
            const cachedTime = sessionStorage.getItem(MISSING_DAYS_TIME_KEY);
            const cachedData = sessionStorage.getItem(MISSING_DAYS_CACHE_KEY);

            if (cachedTime && cachedData) {
                const cacheAge = now - parseInt(cachedTime);
                if (cacheAge < MISSING_DAYS_CACHE_DURATION) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        // Check if cache is for today (same date)
                        if (parsed.date === todayStr) {
                            const cachedMissing = parsed.missing || [];
                            setMissingDates(cachedMissing);

                            // Also calculate past missing dates and show reminder
                            const pastMissing = cachedMissing.filter((d: string) => d !== todayStr);
                            setPastMissingDates(pastMissing);

                            if (!hasCheckedReminder && pastMissing.length > 0) {
                                setShowAttendanceReminder(true);
                            }
                            setHasCheckedReminder(true);
                            return; // Use cache, skip Firestore query
                        }
                    } catch {
                        // Cache parse error, continue to query
                    }
                }
            }

            // Start from day 1 of current month
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const firstDateStr = `${firstDayOfMonth.getFullYear()}-${String(firstDayOfMonth.getMonth() + 1).padStart(2, '0')}-01`;

            try {
                // Query Firestore for all attendance records this month for this class
                const q = query(
                    collection(db, 'attendance'),
                    where('grade', '==', currentUser.assignedClass),
                    where('date', '>=', firstDateStr),
                    where('date', '<=', todayStr)
                );
                const snap = await getDocs(q);

                // Get unique dates that have been recorded
                const recordedDates = new Set<string>();
                snap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.date) {
                        recordedDates.add(data.date);
                    }
                });

                // Build list of missing school days
                const missing: string[] = [];
                const checkDate = new Date(firstDayOfMonth);

                while (checkDate <= today) {
                    const dayOfWeek = checkDate.getDay();
                    // Skip weekends (Saturday = 6, Sunday = 0)
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const year = checkDate.getFullYear();
                        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
                        const day = String(checkDate.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;

                        // Skip holidays
                        if (!holidays.find(h => h.date === dateStr)) {
                            // If not in recordedDates, it's missing
                            if (!recordedDates.has(dateStr)) {
                                missing.push(dateStr);
                            }
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }

                // Sort descending (newest first)
                missing.sort((a, b) => b.localeCompare(a));

                // Save to cache
                sessionStorage.setItem(MISSING_DAYS_CACHE_KEY, JSON.stringify({ date: todayStr, missing }));
                sessionStorage.setItem(MISSING_DAYS_TIME_KEY, now.toString());

                setMissingDates(missing);

                // Calculate past missing dates (exclude today) for login notification
                const pastMissing = missing.filter(d => d !== todayStr);
                setPastMissingDates(pastMissing);

                // Show reminder popup if there are past missing days
                if (!hasCheckedReminder && pastMissing.length > 0) {
                    setShowAttendanceReminder(true);
                }
                setHasCheckedReminder(true);
            } catch (err) {
                console.error('Error calculating missing days:', err);
                setHasCheckedReminder(true);
            }
        };

        calculateMissingDays();
    }, [currentUser.assignedClass, holidays, holidaysLoaded, hasCheckedReminder]);

    // Load duty schedule from Firestore
    useEffect(() => {
        if (dutyScheduleLoaded) return;

        const loadDutySchedule = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'duty_schedules'));
                const schedule: Record<string, string[]> = {};
                snapshot.docs.forEach(d => {
                    const data = d.data();
                    if (Array.isArray(data.teachers)) {
                        schedule[d.id] = data.teachers;
                    }
                });
                setDutySchedule(schedule);
                setDutyScheduleLoaded(true);
            } catch (err) {
                console.error('Error loading duty schedule:', err);
                setDutyScheduleLoaded(true);
            }
        };

        loadDutySchedule();
    }, [dutyScheduleLoaded]);

    // Calculate missing print days for the current teacher's duty days
    useEffect(() => {
        if (!currentUser.name || !dutyScheduleLoaded || !holidaysLoaded) return;

        const calculateMissingPrintDays = async () => {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // Start from day 1 of current month
                const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const firstDateStr = `${firstDayOfMonth.getFullYear()}-${String(firstDayOfMonth.getMonth() + 1).padStart(2, '0')}-01`;

                // Find which day names this teacher is on duty
                const dayMap: Record<number, string> = {
                    1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
                };
                const myDutyDayNames: string[] = [];
                Object.entries(dutySchedule).forEach(([day, teachers]) => {
                    const teachersList = teachers as string[];
                    if (teachersList.some(t => t.trim().toLowerCase() === effectiveTeacherName.trim().toLowerCase())) {
                        myDutyDayNames.push(day);
                    }
                });

                if (myDutyDayNames.length === 0) {
                    setMyMissingPrintDays([]); // Teacher not on any duty
                    return;
                }

                // Query print_logs for current month
                const q = query(
                    collection(db, 'print_logs'),
                    where('date', '>=', firstDateStr),
                    where('date', '<=', todayStr)
                );
                const snap = await getDocs(q);
                const printedDates = new Set<string>();
                snap.docs.forEach(d => {
                    const data = d.data();
                    if (data.date) printedDates.add(data.date);
                });

                // Build list of missing print days (duty days without print log)
                const missing: string[] = [];
                const checkDate = new Date(firstDayOfMonth);

                while (checkDate <= today) {
                    const dayOfWeek = checkDate.getDay();
                    const dayName = dayMap[dayOfWeek];

                    // Check if this is one of my duty days
                    if (dayName && myDutyDayNames.includes(dayName)) {
                        const year = checkDate.getFullYear();
                        const month = String(checkDate.getMonth() + 1).padStart(2, '0');
                        const day = String(checkDate.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;

                        // Skip holidays
                        if (!holidays.find(h => h.date === dateStr)) {
                            // If not printed, add to missing list
                            if (!printedDates.has(dateStr)) {
                                missing.push(dateStr);
                            }
                        }
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }

                // Sort ascending (oldest first)
                missing.sort((a, b) => a.localeCompare(b));
                setMyMissingPrintDays(missing);
            } catch (err) {
                console.error('Error calculating missing print days:', err);
            }
        };

        calculateMissingPrintDays();
    }, [effectiveTeacherName, dutySchedule, dutyScheduleLoaded, holidays, holidaysLoaded]);

    // Check if today is my duty day and load all classes recording status
    useEffect(() => {
        if (!effectiveTeacherName || !dutyScheduleLoaded || !holidaysLoaded) return;

        const checkDutyDayAndLoadStatus = async () => {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // Check if it's a weekend
                const dayOfWeek = today.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    setIsTodayMyDutyDay(false);
                    return;
                }

                // Check if today is a holiday
                if (holidays.find(h => h.date === todayStr)) {
                    setIsTodayMyDutyDay(false);
                    return;
                }

                // Find which day names this teacher is on duty
                const dayMap: Record<number, string> = {
                    1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
                };
                const todayDayName = dayMap[dayOfWeek];

                // Check if current user is on duty today
                const dutyTeachers = dutySchedule[todayDayName] || [];
                const isOnDuty = dutyTeachers.some(t =>
                    t.trim().toLowerCase() === effectiveTeacherName.trim().toLowerCase()
                );

                setIsTodayMyDutyDay(isOnDuty);

                if (!isOnDuty) return;

                // Load recording status for all classes
                setLoadingRecordingStatus(true);

                // Get all grades and calculate status
                const statusByGrade: typeof allClassesRecordingStatus = [];

                // Get attendance records for today
                const q = query(collection(db, 'attendance'), where('date', '==', todayStr));
                const attSnap = await getDocs(q);
                const attendanceByGrade = new Map<string, number>();
                attSnap.docs.forEach(d => {
                    const data = d.data();
                    const grade = data.grade as string;
                    attendanceByGrade.set(grade, (attendanceByGrade.get(grade) || 0) + 1);
                });

                // Calculate for each grade
                for (const grade of GRADE_OPTIONS) {
                    const studentsInGrade = allStudents.filter(s => {
                        // Only active students
                        if (s.grade !== grade) return false;
                        if (s.status === StudentStatus.WITHDRAWN) return false;
                        return true;
                    });

                    const totalStudents = studentsInGrade.length;
                    const recordedCount = attendanceByGrade.get(grade) || 0;

                    statusByGrade.push({
                        grade,
                        isRecorded: totalStudents > 0 && recordedCount >= totalStudents,
                        totalStudents,
                        recordedCount
                    });
                }

                setAllClassesRecordingStatus(statusByGrade);
                setLoadingRecordingStatus(false);
            } catch (err) {
                console.error('Error checking duty day status:', err);
                setLoadingRecordingStatus(false);
            }
        };

        checkDutyDayAndLoadStatus();
    }, [effectiveTeacherName, dutySchedule, dutyScheduleLoaded, holidays, holidaysLoaded, allStudents]);

    // --- Logic Handlers ---

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedStudentIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedStudentIds(newSet);
    };

    const selectAll = () => {
        if (selectedStudentIds.size === students.length) {
            setSelectedStudentIds(new Set());
        } else {
            setSelectedStudentIds(new Set(students.map(s => s.id)));
        }
    };

    const applyStatusToSelection = (status: AttendanceStatus) => {
        if (selectedStudentIds.size === 0) return;

        setAttendanceState(prev => {
            const newState = { ...prev };
            selectedStudentIds.forEach(id => {
                newState[id] = status;
            });
            return newState;
        });

        setSelectedStudentIds(new Set());
    };

    const handleSaveClick = () => {
        setShowConfirmModal(true);
    };

    const handleResetClick = () => {
        setShowResetModal(true);
    };

    const handleConfirmReset = async () => {
        setShowResetModal(false);
        setLoading(true);
        await loadAttendanceData();
        setSelectedStudentIds(new Set());
        setLoading(false);
    };

    const confirmSave = async () => {
        setSaving(true);
        try {
            const batch = writeBatch(db);
            // Use viewAsTeacherName if admin is viewing as teacher, otherwise use current user name
            const recorderName = viewAsTeacherName || currentUser.name;

            students.forEach(s => {
                const ref = doc(db, 'attendance', `${selectedDate}_${s.id}`);
                batch.set(ref, {
                    date: selectedDate,
                    studentId: s.id,
                    studentName: s.name || 'Unknown',
                    studentNumber: s.number || 0,
                    grade: s.grade || selectedClass,
                    gender: s.gender || 'ชาย',
                    status: attendanceState[s.id] || AttendanceStatus.PRESENT,
                    timestamp: Date.now(),
                    recordedBy: recorderName // บันทึกชื่อผู้บันทึก
                });
            });
            await batch.commit();

            // Invalidate attendance cache for this date/class
            const cacheKey = `att_cache_${selectedDate}_${selectedClass}`;
            sessionStorage.removeItem(cacheKey);
            sessionStorage.removeItem(`${cacheKey}_time`);

            // Invalidate missing days cache to refresh the banner
            sessionStorage.removeItem(`missing_days_${selectedClass}`);
            sessionStorage.removeItem(`missing_days_time_${selectedClass}`);

            setShowConfirmModal(false);
            setInitialAttendanceState(attendanceState); // Reset to mark as saved

            // Show success toast
            setShowSuccessToast(true);
            setTimeout(() => setShowSuccessToast(false), 3000); // Auto-hide after 3 seconds

            setTimeout(() => setSaving(false), 500);
        } catch (err) {
            console.error(err);
            setSaving(false);
        }
    };

    const fetchHistory = async () => {
        if (!historyStartDate || !historyEndDate) return;
        setLoadingHistory(true);
        try {
            // 1. Fetch Students (using existing students state might be risky if class changed, but for now we rely on selectedClass)
            // We'll reuse the students state which is already loaded for selectedClass
            const studentsList = [...students];

            // 2. Fetch Attendance in Date Range
            const attQ = query(
                collection(db, 'attendance'),
                where('grade', '==', selectedClass),
                where('date', '>=', historyStartDate),
                where('date', '<=', historyEndDate)
            );
            const attSnap = await getDocs(attQ);

            // Process Data
            const records: Record<string, Record<string, AttendanceStatus>> = {};
            const studentStats: Record<string, any> = {};

            studentsList.forEach(s => {
                records[s.id] = {};
                studentStats[s.id] = { present: 0, absent: 0, late: 0, sick: 0, personal: 0, total: 0 };
            });

            attSnap.docs.forEach(doc => {
                const data = doc.data() as any;
                // Filter by grade manually to be safe, or assume query correctness if indexed. 
                // Also check if student exists in our list.
                if (data.grade === selectedClass && records[data.studentId]) {
                    records[data.studentId][data.date] = data.status;

                    const st = studentStats[data.studentId];
                    st.total++;
                    if (data.status === AttendanceStatus.PRESENT) st.present++;
                    else if (data.status === AttendanceStatus.LATE) st.late++;
                    else if (data.status === AttendanceStatus.ABSENT) st.absent++;
                    else if (data.status === AttendanceStatus.SICK) st.sick++;
                    else if (data.status === AttendanceStatus.PERSONAL) st.personal++;
                }
            });

            // Generate Date Array
            const dateArray = [];
            let cur = new Date(historyStartDate);
            const end = new Date(historyEndDate);
            while (cur <= end) {
                dateArray.push(cur.toISOString().split('T')[0]);
                cur.setDate(cur.getDate() + 1);
            }

            setHistoryData({
                dates: dateArray,
                students: studentsList,
                records: records,
                stats: studentStats
            });

        } catch (error) {
            console.error(error);
        } finally {
            setLoadingHistory(false);
        }
    };

    // --- Stats Calculation (Check View) ---
    const stats = useMemo(() => {
        const total = students.length;
        const totalMale = students.filter(s => s.gender === Gender.MALE).length;
        const totalFemale = students.filter(s => s.gender === Gender.FEMALE).length;

        const presentList = students.filter(s => {
            const status = attendanceState[s.id];
            return status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE;
        });
        const presentCount = presentList.length;
        const presentPercent = total > 0 ? ((presentCount / total) * 100).toFixed(1) : '0.0';

        const absentList = students.filter(s => {
            const status = attendanceState[s.id];
            return status === AttendanceStatus.ABSENT || status === AttendanceStatus.SICK || status === AttendanceStatus.PERSONAL;
        });
        const absentCount = absentList.length;
        const absentMale = absentList.filter(s => s.gender === Gender.MALE).length;
        const absentFemale = absentList.filter(s => s.gender === Gender.FEMALE).length;

        const breakdown: Record<string, number> = {};
        const genderBreakdown: Record<string, { male: number; female: number }> = {};

        STATUS_CONFIG.forEach(c => {
            breakdown[c.status] = 0;
            genderBreakdown[c.status] = { male: 0, female: 0 };
        });

        students.forEach(s => {
            const status = attendanceState[s.id] || AttendanceStatus.PRESENT;
            if (breakdown[status] !== undefined) {
                breakdown[status]++;
            } else {
                breakdown[status] = 1;
            }

            if (genderBreakdown[status]) {
                if (s.gender === Gender.MALE) genderBreakdown[status].male++;
                else genderBreakdown[status].female++;
            }
        });

        return {
            total, totalMale, totalFemale,
            presentCount, presentPercent,
            absentCount, absentMale, absentFemale, absentList,
            breakdown, genderBreakdown
        };
    }, [students, attendanceState]);


    // --- Render Sub-Components ---

    const SidebarContent = () => (
        <div className="flex flex-col h-full no-print">
            <div className={`flex items-center h-16 px-4 border-b border-white/20 ${!isSidebarOpen && 'justify-center px-0'}`}>
                {isSidebarOpen ? (
                    <div className="flex items-center gap-3 text-white overflow-hidden whitespace-nowrap w-full">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <Contact className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col w-full overflow-hidden pr-2">
                            <span className="font-bold text-sm leading-tight">เมนูจัดการ</span>
                            <span className="text-[10px] text-white/70">{selectedClass}</span>
                        </div>
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
                        <Contact className="w-5 h-5" />
                    </div>
                )}
            </div>

            <div className="flex-1 py-4 space-y-1 px-2">
                <button
                    onClick={() => setCurrentView('check')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'check' ? 'bg-white text-gray-800 font-bold shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${!isSidebarOpen && 'justify-center'}`}
                    title="เช็คชื่อ"
                >
                    <ClipboardList className={`w-5 h-5 ${currentView === 'check' ? 'text-[#003060]' : 'text-white/60'}`} />
                    {isSidebarOpen && <span>เช็คชื่อนักเรียน</span>}
                </button>

                <button
                    onClick={() => setCurrentView('dashboard')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'dashboard' ? 'bg-white text-gray-800 font-bold shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${!isSidebarOpen && 'justify-center'}`}
                    title="แดชบอร์ด"
                >
                    <LayoutDashboard className={`w-5 h-5 ${currentView === 'dashboard' ? 'text-[#003060]' : 'text-white/60'}`} />
                    {isSidebarOpen && <span>สรุปผลประจำวัน</span>}
                </button>

                <div className="border-t border-white/20 my-2 mx-2"></div>

                <button
                    onClick={() => setCurrentView('room_history')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'room_history' ? 'bg-white text-gray-800 font-bold shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${!isSidebarOpen && 'justify-center'}`}
                    title="รายงานห้องเรียน"
                >
                    <History className={`w-5 h-5 ${currentView === 'room_history' ? 'text-[#003060]' : 'text-white/60'}`} />
                    {isSidebarOpen && <span>รายงานห้องเรียน</span>}
                </button>

                <button
                    onClick={() => setCurrentView('school_dashboard')}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'school_dashboard' ? 'bg-white text-gray-800 font-bold shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${!isSidebarOpen && 'justify-center'}`}
                    title="ภาพรวมโรงเรียน"
                >
                    <Building2 className={`w-5 h-5 ${currentView === 'school_dashboard' ? 'text-[#003060]' : 'text-white/60'}`} />
                    {isSidebarOpen && <span>ภาพรวมโรงเรียน</span>}
                </button>
            </div>

            {/* Desktop Collapse Button */}
            <div className="hidden md:flex p-4 border-t border-white/20 justify-end">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors">
                    {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );

    const RenderCheckList = () => (
        <div className="flex-1 flex flex-col h-full relative">
            {/* Bulk Actions Toolbar */}
            <div className="bg-white border-b border-gray-200 p-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={selectAll}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all shrink-0 ${selectedStudentIds.size === students.length && students.length > 0 ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        {selectedStudentIds.size === students.length && students.length > 0 ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        <span className="text-sm font-bold whitespace-nowrap">เลือกทั้งหมด</span>
                    </button>

                    {/* Desktop: Status buttons inline */}
                    {selectedStudentIds.size > 0 && (
                        <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-gray-200 animate-fade-in">
                            <span className="text-xs font-bold text-gray-400 mr-1 shrink-0">ตั้งค่า:</span>
                            {STATUS_CONFIG.map(config => (
                                <button
                                    key={config.status}
                                    onClick={() => applyStatusToSelection(config.status)}
                                    className="p-2 rounded-lg transition-all hover:scale-110 bg-gray-50 border border-gray-100 shrink-0"
                                    style={{ color: config.color.includes('emerald') ? '#059669' : config.color.includes('yellow') ? '#ca8a04' : config.color.includes('blue') ? '#2563eb' : config.color.includes('purple') ? '#9333ea' : '#e11d48' }}
                                    title={`ตั้งเป็น ${config.label}`}
                                >
                                    <config.icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Reset & Save buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleResetClick}
                            disabled={loading || saving}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="รีเซ็ต"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleSaveClick}
                            disabled={loading || saving}
                            className="hidden md:flex items-center gap-2 px-4 py-2 text-white rounded-lg font-bold shadow-sm hover:opacity-90 hover:shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: '#003060' }}
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>บันทึก</span>
                        </button>
                    </div>
                </div>

                {/* Mobile: Status buttons in separate row */}
                {selectedStudentIds.size > 0 && (
                    <div className="sm:hidden flex items-center justify-between gap-1 animate-fade-in bg-gray-50 p-2 rounded-lg">
                        <span className="text-xs font-bold text-gray-500 shrink-0">ตั้งค่า:</span>
                        <div className="flex gap-1 flex-1">
                            {STATUS_CONFIG.map(config => (
                                <button
                                    key={config.status}
                                    onClick={() => applyStatusToSelection(config.status)}
                                    className="flex-1 p-2.5 rounded-lg transition-all active:scale-95 bg-white border border-gray-200 shadow-sm"
                                    style={{ color: config.color.includes('emerald') ? '#059669' : config.color.includes('yellow') ? '#ca8a04' : config.color.includes('blue') ? '#2563eb' : config.color.includes('purple') ? '#9333ea' : '#e11d48' }}
                                >
                                    <config.icon className="w-5 h-5 mx-auto" strokeWidth={2} />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Selected count badge on mobile */}
                {selectedStudentIds.size > 0 && (
                    <div className="sm:hidden bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 text-center">
                        <span className="text-sm font-bold text-brand-700">เลือก {selectedStudentIds.size} คน</span>
                    </div>
                )}

                {/* Selected List Names - Desktop only */}
                {selectedStudentIds.size > 0 && selectedStudentIds.size < students.length && (
                    <div className="bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 flex items-start gap-2 overflow-x-auto whitespace-nowrap custom-scrollbar hidden sm:flex">
                        <span className="text-xs font-bold text-brand-700 shrink-0 mt-0.5">เลือกอยู่ ({selectedStudentIds.size}):</span>
                        <div className="flex gap-2">
                            {students.filter(s => selectedStudentIds.has(s.id)).map(s => (
                                <span key={s.id} className="text-xs bg-white border border-brand-200 text-brand-800 px-2 py-0.5 rounded-md shadow-sm">
                                    {s.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Student List */}
            <div className="flex-1 p-2 sm:p-4 space-y-2 sm:space-y-3 pb-36 overflow-y-auto">
                {/* Missing Days Alert Banner */}
                {missingDates.length > 0 && (
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 mb-2 animate-fade-in">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                <span className="text-sm font-bold text-red-700">
                                    ยังไม่ได้บันทึก {missingDates.length} วัน
                                </span>
                            </div>
                            <span className="text-xs text-red-500">💡 กดเลือกวันที่</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {missingDates.slice(0, 5).map(dateStr => {
                                const [y, m, d] = dateStr.split('-').map(Number);
                                const date = new Date(y, m - 1, d);
                                const formatted = date.toLocaleDateString('th-TH', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short'
                                });
                                const today = new Date();
                                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                const isToday = dateStr === todayStr;
                                return (
                                    <button
                                        key={dateStr}
                                        onClick={() => {
                                            // Toggle: if already selected, go back to today
                                            if (selectedDate === dateStr) {
                                                setSelectedDate(todayStr);
                                            } else {
                                                setSelectedDate(dateStr);
                                            }
                                        }}
                                        className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${selectedDate === dateStr
                                            ? 'bg-red-500 text-white shadow-md'
                                            : 'bg-white border border-red-200 text-red-700 hover:bg-red-100'
                                            }`}
                                    >
                                        {isToday ? 'วันนี้' : formatted}
                                    </button>
                                );
                            })}
                            {missingDates.length > 5 && (
                                <span className="text-xs text-red-500 py-1.5">+{missingDates.length - 5} วัน</span>
                            )}
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
                ) : students.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">ไม่พบข้อมูลนักเรียน</div>
                ) : (
                    students.map((student, index) => {
                        const status = attendanceState[student.id];
                        const config = STATUS_CONFIG.find(c => c.status === status) || STATUS_CONFIG[0];
                        const isSelected = selectedStudentIds.has(student.id);

                        // Map status colors to RGB for glow effect
                        const getGlowRgb = (colorClass: string): string => {
                            if (colorClass.includes('emerald')) return '16, 185, 129';
                            if (colorClass.includes('yellow')) return '234, 179, 8';
                            if (colorClass.includes('blue')) return '59, 130, 246';
                            if (colorClass.includes('purple')) return '168, 85, 247';
                            if (colorClass.includes('rose')) return '244, 63, 94';
                            return '100, 100, 100';
                        };
                        const glowRgb = getGlowRgb(config.color);

                        // Staggered animation delay (slower for visibility)
                        const animationDelay = Math.min(index * 80, 640);

                        return (
                            <div
                                key={student.id}
                                className={`bg-white rounded-xl transition-all duration-500 animate-fade-slide-up ${isSelected ? 'ring-2 ring-brand-300' : ''}`}
                                style={{
                                    border: `2px solid rgb(${glowRgb})`,
                                    boxShadow: `0 0 2px rgba(${glowRgb}, 1), 0 0 6px rgba(${glowRgb}, 0.25), 0 1px 3px rgba(0,0,0,0.08)`,
                                    animationDelay: `${animationDelay}ms`,
                                    animationFillMode: 'backwards'
                                }}
                            >
                                <div className="p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                                    {/* Info Area */}
                                    <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => toggleSelection(student.id)}>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300 text-transparent'}`}>
                                            <CheckSquare className="w-3.5 h-3.5" />
                                        </div>
                                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${student.gender === Gender.MALE ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                                            {student.number}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-gray-800 text-sm sm:text-base truncate">{student.name}</div>
                                            <div className="text-xs text-gray-400">
                                                <span className="hidden sm:inline">{student.studentId} • </span>
                                                {student.gender === Gender.MALE ? 'ชาย' : 'หญิง'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Buttons - Hide on mobile when multiple selected */}
                                    <div className={`grid grid-cols-5 gap-2 sm:flex sm:gap-2 ${selectedStudentIds.size > 1 ? 'hidden sm:flex' : ''}`}>
                                        {STATUS_CONFIG.map((c) => (
                                            <button
                                                key={c.status}
                                                onClick={(e) => { e.stopPropagation(); setAttendanceState(prev => ({ ...prev, [student.id]: c.status })); }}
                                                className={`
                                                  relative flex flex-col sm:flex-row items-center justify-center sm:gap-1.5 
                                                  py-2.5 sm:px-3 sm:py-2 rounded-xl transition-all min-h-[52px]
                                                  ${status === c.status
                                                        ? `${c.color} text-white shadow-md ring-2 ring-offset-1 ring-${c.color.split('-')[1]}-300`
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                                                    }
                                              `}
                                            >
                                                <c.icon className="w-5 h-5" strokeWidth={2.5} />
                                                <span className="text-[11px] sm:text-xs font-bold mt-0.5 sm:mt-0">{c.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {/* Status badge when hidden on mobile */}
                                    {selectedStudentIds.size > 1 && (
                                        <div className={`sm:hidden flex items-center justify-center gap-2 py-2 px-3 rounded-xl ${config.bg} ${config.text}`}>
                                            <config.icon className="w-5 h-5" />
                                            <span className="text-sm font-bold">{config.label}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    const RenderDashboard = () => (
        <div className="flex-1 p-4 md:p-8 pb-36 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm animate-fade-slide-up" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
                    <div className="text-xs text-gray-500 font-bold mb-1">มาเรียน</div>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-emerald-600">{stats.presentCount}</span>
                        <span className="text-xs font-medium text-emerald-500 mb-1">({stats.presentPercent}%)</span>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm animate-fade-slide-up" style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}>
                    <div className="text-xs text-gray-500 font-bold mb-1">ขาด/ลา</div>
                    <div className="text-2xl font-bold text-rose-600">{stats.absentCount}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm animate-fade-slide-up" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                    <div className="text-xs text-gray-500 font-bold mb-1">ชาย</div>
                    <div className="text-2xl font-bold text-blue-600">{stats.totalMale}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm animate-fade-slide-up" style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}>
                    <div className="text-xs text-gray-500 font-bold mb-1">หญิง</div>
                    <div className="text-2xl font-bold text-pink-600">{stats.totalFemale}</div>
                </div>
            </div>

            {/* Detail Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart/Breakdown */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-brand-500" /> สรุปสถานะ</h3>
                    <div className="space-y-3">
                        {STATUS_CONFIG.map(config => {
                            const count = stats.breakdown[config.status] || 0;
                            const percent = stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : 0;
                            return (
                                <div key={config.status} className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="flex items-center gap-1.5">
                                            <config.icon className={`w-3.5 h-3.5 ${config.text}`} />
                                            {config.label}
                                        </span>
                                        <span className="text-gray-600">{count} คน ({percent}%)</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${config.color}`} style={{ width: `${percent}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Absent List */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><UserX className="w-5 h-5 text-rose-500" /> รายชื่อนักเรียนที่ไม่ได้มาเรียน</h3>
                    <div className="flex-1 overflow-y-auto max-h-[300px]">
                        {stats.absentList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                                <UserCheck className="w-12 h-12 text-emerald-200 mb-2" />
                                <span className="text-sm">ยอดเยี่ยม! วันนี้มาครบทุกคน</span>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 rounded-l-lg">เลขที่</th>
                                        <th className="px-4 py-2">ชื่อ</th>
                                        <th className="px-4 py-2 text-right rounded-r-lg">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.absentList.map(s => {
                                        const status = attendanceState[s.id];
                                        const config = STATUS_CONFIG.find(c => c.status === status);
                                        return (
                                            <tr key={s.id}>
                                                <td className="px-4 py-3 font-mono text-gray-500">{s.number}</td>
                                                <td className="px-4 py-3 font-bold text-gray-800">{s.name}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${config?.bg} ${config?.text}`}>
                                                        {config?.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const RenderRoomHistory = () => (
        <div className="flex-1 p-4 md:p-8 pb-36 space-y-6">
            {/* Controls */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">ตั้งแต่วันที่</label>
                    <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">ถึงวันที่</label>
                    <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <button onClick={fetchHistory} disabled={loadingHistory} className="text-white px-6 py-2 rounded-lg font-bold hover:opacity-90 transition-colors shadow-sm flex items-center gap-2 h-[38px]" style={{ backgroundColor: '#003060' }}>
                    {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
                    แสดงรายงาน
                </button>
            </div>

            {/* Data Display */}
            {historyData && (
                <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {historyData.students.map(student => {
                            const studentStats = historyData.stats[student.id];
                            // Reconstruct records array for the card
                            const studentRecords: AttendanceRecord[] = historyData.dates.map(date => ({
                                date,
                                status: historyData.records[student.id]?.[date] || AttendanceStatus.ABSENT, // Default to absent if missing? Or handle undefined?
                                // Note: In the original logic, missing might mean something else, but for heatmap we need status.
                                // Let's map undefined to something neutral if needed, but heatmap handles undefined.
                                studentId: student.id,
                                studentName: student.name,
                                studentNumber: student.number,
                                grade: student.grade,
                                gender: student.gender,
                                timestamp: 0
                            }));

                            return (
                                <StudentHistoryCard
                                    key={student.id}
                                    student={student}
                                    records={studentRecords}
                                    stats={studentStats}
                                    onClick={() => setSelectedHistoryStudent(student)}
                                />
                            );
                        })}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:flex bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">รายงานการเข้าเรียน: {selectedClass}</h3>
                            <div className="flex gap-2 text-xs">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> มา</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> สาย</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> ขาด</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> ป่วย</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> ลา</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="p-3 whitespace-nowrap sticky left-0 bg-gray-50 z-20 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">เลขที่</th>
                                        <th className="p-3 whitespace-nowrap sticky left-[50px] bg-gray-50 z-20 border-r border-gray-200 min-w-[150px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">ชื่อ-นามสกุล</th>
                                        {historyData.dates.map(d => (
                                            <th key={d} className="p-2 text-center border-r border-gray-100 min-w-[40px]">
                                                <div className="flex flex-col items-center leading-none">
                                                    <span className="text-[10px] text-gray-400">{new Date(d).toLocaleDateString('th-TH', { month: 'short' })}</span>
                                                    <span className="font-bold">{new Date(d).getDate()}</span>
                                                </div>
                                            </th>
                                        ))}
                                        <th className="p-3 text-center bg-gray-50 border-l border-gray-200 min-w-[80px]">สรุป (ครั้ง)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyData.students.map((student, idx) => (
                                        <tr key={student.id} className="hover:bg-gray-50 border-b border-gray-100 cursor-pointer" onClick={() => setSelectedHistoryStudent(student)}>
                                            <td className="p-3 text-center sticky left-0 bg-white z-10 border-r border-gray-200 font-mono text-gray-500 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{student.number}</td>
                                            <td className="p-3 sticky left-[50px] bg-white z-10 border-r border-gray-200 font-bold text-gray-800 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{student.name}</td>
                                            {historyData.dates.map(d => {
                                                const status = historyData.records[student.id]?.[d];
                                                let content = <div className="w-2 h-2 rounded-full bg-gray-200 mx-auto opacity-50" title="ไม่มีข้อมูล"></div>;
                                                if (status === AttendanceStatus.PRESENT) content = <div className="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto" title="มา"><div className="w-2 h-2 rounded-full bg-emerald-500"></div></div>;
                                                else if (status === AttendanceStatus.LATE) content = <div className="w-4 h-4 rounded-full bg-yellow-100 border border-yellow-200 flex items-center justify-center mx-auto" title="สาย"><div className="w-2 h-2 rounded-full bg-yellow-500"></div></div>;
                                                else if (status === AttendanceStatus.ABSENT) content = <div className="w-4 h-4 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center mx-auto" title="ขาด"><div className="w-2 h-2 rounded-full bg-rose-500"></div></div>;
                                                else if (status === AttendanceStatus.SICK) content = <div className="w-4 h-4 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center mx-auto" title="ป่วย"><div className="w-2 h-2 rounded-full bg-blue-500"></div></div>;
                                                else if (status === AttendanceStatus.PERSONAL) content = <div className="w-4 h-4 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center mx-auto" title="ลา"><div className="w-2 h-2 rounded-full bg-purple-500"></div></div>;
                                                else if (status === AttendanceStatus.HOLIDAY) content = <div className="w-4 h-4 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto" title="วันหยุด"><div className="w-2 h-2 rounded-full bg-orange-300"></div></div>;

                                                return (
                                                    <td key={d} className="p-2 text-center border-r border-gray-100">
                                                        {content}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-center border-l border-gray-200 text-xs bg-gray-50/50">
                                                <div className="flex flex-col gap-0.5 items-center">
                                                    {historyData.stats[student.id]?.absent > 0 && <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">ขาด {historyData.stats[student.id].absent}</span>}
                                                    {(historyData.stats[student.id]?.sick + historyData.stats[student.id]?.personal) > 0 && <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">ลา {historyData.stats[student.id].sick + historyData.stats[student.id].personal}</span>}
                                                    {historyData.stats[student.id]?.late > 0 && <span className="text-yellow-600 font-bold bg-yellow-50 px-1 rounded">สาย {historyData.stats[student.id].late}</span>}
                                                    {(historyData.stats[student.id]?.absent === 0 && (historyData.stats[student.id]?.sick + historyData.stats[student.id]?.personal) === 0 && historyData.stats[student.id]?.late === 0) && <span className="text-emerald-500 font-bold bg-emerald-50 px-1 rounded">ครบ</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Student Detail Modal */}
            {selectedHistoryStudent && historyData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedHistoryStudent(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${selectedHistoryStudent.gender === Gender.MALE ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                                    {selectedHistoryStudent.number}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">{selectedHistoryStudent.name}</h3>
                                    <p className="text-xs text-gray-500">{selectedHistoryStudent.studentId} • {selectedHistoryStudent.grade}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedHistoryStudent(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center">
                                    <div className="text-xs text-emerald-600 font-bold mb-1">มาเรียน</div>
                                    <div className="text-2xl font-bold text-emerald-700">{historyData.stats[selectedHistoryStudent.id]?.present || 0}</div>
                                </div>
                                <div className="bg-rose-50 p-3 rounded-xl border border-rose-100 text-center">
                                    <div className="text-xs text-rose-600 font-bold mb-1">ขาดเรียน</div>
                                    <div className="text-2xl font-bold text-rose-700">{historyData.stats[selectedHistoryStudent.id]?.absent || 0}</div>
                                </div>
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
                                    <div className="text-xs text-blue-600 font-bold mb-1">ลา/ป่วย</div>
                                    <div className="text-2xl font-bold text-blue-700">{(historyData.stats[selectedHistoryStudent.id]?.sick || 0) + (historyData.stats[selectedHistoryStudent.id]?.personal || 0)}</div>
                                </div>
                            </div>

                            {/* Heatmap Visualization */}
                            <div className="mb-6">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-brand-500" /> ภาพรวมการมาเรียน
                                </h4>
                                <AttendanceHeatmap
                                    records={historyData.dates.map(d => ({ date: d, status: historyData.records[selectedHistoryStudent.id]?.[d] }))}
                                    days={historyData.dates.length}
                                    className="flex-wrap justify-center"
                                />
                            </div>

                            {/* Detailed List */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-brand-500" /> ประวัติรายวัน
                                </h4>
                                <div className="space-y-2">
                                    {historyData.dates.map(date => {
                                        const status = historyData.records[selectedHistoryStudent.id]?.[date];
                                        if (!status) return null;
                                        const config = STATUS_CONFIG.find(c => c.status === status);
                                        if (!config) return null;

                                        return (
                                            <div key={date} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${config.color.replace('bg-', 'bg-').split(' ')[0]}`}></div>
                                                    <span className="text-sm font-medium text-gray-700">
                                                        {new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${config.bg} ${config.text}`}>
                                                    {config.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const getTitle = () => {
        if (currentView === 'dashboard') return 'แดชบอร์ด';
        if (currentView === 'school_dashboard') return 'ภาพรวมโรงเรียน';
        if (currentView === 'room_history') return 'รายงานห้องเรียน';
        return 'เช็คชื่อประจำวัน';
    };

    return (
        <div className="rounded-3xl shadow-xl border border-white/20 flex min-h-[80vh] max-h-[100vh] relative pb-16 md:pb-0 overflow-hidden" style={{ backgroundColor: '#003060' }}>

            {/* Desktop Sidebar Only */}
            <div className={`hidden md:flex flex-col border-r border-white/20 transition-all duration-300 no-print ${isSidebarOpen ? 'w-64' : 'w-20'}`} style={{ backgroundColor: '#003060' }}>
                <SidebarContent />
            </div>

            {/* --- MAIN CONTENT AREA --- */}
            <div className="flex-1 flex flex-col min-h-0 relative print:bg-white print:overflow-visible bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-y-auto">

                {/* HEADER */}
                {/* View-As-Teacher Banner */}
                {viewAsTeacherName && (
                    <div className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center text-sm font-bold flex items-center justify-center gap-2 no-print">
                        <Eye className="w-4 h-4" />
                        กำลังดูในมุมมองของ: {viewAsTeacherName}
                        <span className="text-xs opacity-80">(ข้อมูลเวรจะแสดงตามชื่อครูนี้)</span>
                    </div>
                )}
                <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 z-20 no-print">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Back to Admin button - only on desktop */}
                        {onBackToAdmin && (
                            <button onClick={onBackToAdmin} className="hidden md:block p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="กลับหน้า Admin">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                        )}

                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 leading-tight">
                                {getTitle()}
                            </h2>
                            {currentUser.role === Role.ADMIN && currentView !== 'school_dashboard' ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="relative group">
                                        <select
                                            value={selectedClass}
                                            onChange={(e) => setSelectedClass(e.target.value)}
                                            className="appearance-none bg-white border border-gray-200 text-gray-700 text-xs md:text-sm font-bold rounded-lg py-1 pl-2 pr-8 cursor-pointer hover:bg-gray-50 hover:border-brand-300 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                                        >
                                            {GRADE_OPTIONS.map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 group-hover:text-brand-600">
                                            <ChevronRight className="h-3 w-3 rotate-90" />
                                        </div>
                                    </div>
                                    <span className="text-xs md:text-sm text-gray-500">• {students.length} คน</span>
                                </div>
                            ) : (
                                currentView !== 'school_dashboard' && (
                                    <p className="text-xs md:text-sm text-gray-500">{selectedClass} • {students.length} คน</p>
                                )
                            )}
                        </div>
                    </div>

                    {(currentView === 'check' || currentView === 'dashboard') && (
                        <div className="flex items-center gap-3 w-full md:w-auto bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-2 px-3 text-brand-700">
                                <CalendarIcon className="w-5 h-5" />
                                <span className="text-sm font-bold hidden sm:inline">เลือกวันที่</span>
                            </div>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block w-full p-2 cursor-pointer"
                            />
                        </div>
                    )}

                    {/* Removed - Replaced by floating bubble */}
                </div>

                {/* VIEW CONTENT */}
                {currentView === 'check' && RenderCheckList()}
                {currentView === 'dashboard' && RenderDashboard()}
                {currentView === 'room_history' && RenderRoomHistory()}
                {currentView === 'school_dashboard' && (
                    <Dashboard embedded students={allStudents} isDutyTeacher={isTodayMyDutyDay} />
                )}

            </div>

            {/* --- CONFIRMATION MODAL (SAVE) --- */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in no-print">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-brand-600" /> ยืนยันการบันทึก
                            </h3>
                            <button onClick={() => setShowConfirmModal(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="text-center mb-6">
                                <p className="text-gray-500 text-sm font-medium">สรุปข้อมูลการเช็คชื่อ</p>
                                <h4 className="text-xl font-bold text-brand-700">{selectedClass}</h4>
                                <p className="text-xs text-gray-400 mt-1">วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {STATUS_CONFIG.map((config) => {
                                    const count = stats.breakdown[config.status] || 0;
                                    const counts = stats.genderBreakdown[config.status];
                                    if (count === 0) return null;

                                    return (
                                        <div key={config.status} className={`flex flex-col p-3 rounded-xl border ${config.bg} border-transparent`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg bg-white/60 ${config.text}`}>
                                                        <config.icon className="w-4 h-4" />
                                                    </div>
                                                    <span className={`text-sm font-bold ${config.text}`}>{config.label}</span>
                                                </div>
                                                <span className={`text-xl font-bold ${config.text}`}>{count}</span>
                                            </div>
                                            <div className="flex justify-end gap-3 text-xs opacity-80 pl-8">
                                                <span className={`${config.text}`}>ชาย: {counts?.male || 0}</span>
                                                <span className={`${config.text}`}>หญิง: {counts?.female || 0}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <span className="text-sm font-bold text-gray-600">นักเรียนทั้งหมด</span>
                                <span className="text-lg font-bold text-gray-800">{students.length} คน</span>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors"
                            >
                                แก้ไขข้อมูล
                            </button>
                            <button
                                onClick={confirmSave}
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold shadow-lg hover:bg-emerald-600 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- CONFIRMATION MODAL (RESET) --- */}
            <ConfirmationModal
                isOpen={showResetModal}
                onClose={() => setShowResetModal(false)}
                onConfirm={handleConfirmReset}
                title="คืนค่าข้อมูลเดิม"
                message="คุณต้องการยกเลิกการแก้ไขทั้งหมดและโหลดข้อมูลล่าสุดจากฐานข้อมูลใช่หรือไม่? การแก้ไขที่ยังไม่บันทึกจะหายไป"
                isDangerous={true}
                isLoading={loading}
            />

            {/* --- ATTENDANCE REMINDER MODAL (Past Missing Days) --- */}
            {showAttendanceReminder && pastMissingDates.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        {/* Header - RED warning */}
                        <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-5 text-white">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 p-3 rounded-full animate-pulse">
                                    <AlertTriangle className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">⚠️ มีวันที่ยังไม่ได้บันทึก!</h3>
                                    <p className="text-sm text-white/90 mt-0.5">กรุณาบันทึกย้อนหลัง {pastMissingDates.length} วัน</p>
                                </div>
                            </div>
                        </div>

                        {/* Body - List of missing dates */}
                        <div className="px-4 py-4 max-h-[300px] overflow-y-auto">
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                                <p className="text-sm text-amber-700 font-medium">
                                    👆 เลือกวันที่ต้องการบันทึก แล้วระบบจะพาไปหน้าเช็คชื่อให้
                                </p>
                            </div>
                            <div className="space-y-2">
                                {pastMissingDates.map(dateStr => {
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const date = new Date(y, m - 1, d);
                                    const formatted = date.toLocaleDateString('th-TH', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long'
                                    });
                                    return (
                                        <button
                                            key={dateStr}
                                            onClick={() => {
                                                setSelectedDate(dateStr);
                                                setCurrentView('check');
                                                setShowAttendanceReminder(false);
                                            }}
                                            className="w-full flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                                <span className="text-sm font-medium text-gray-700">{formatted}</span>
                                            </div>
                                            <span className="text-xs font-bold text-red-600 group-hover:text-red-700">
                                                บันทึกเลย →
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer - Only close button */}
                        <div className="px-4 pb-4">
                            <button
                                onClick={() => setShowAttendanceReminder(false)}
                                className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MISSING PRINT DAYS MODAL --- */}
            {showMissingPrintModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/20 p-3 rounded-full">
                                        <Printer className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">📅 วันที่ขาดพิมพ์</h3>
                                        <p className="text-sm text-white/80">
                                            {new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowMissingPrintModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-4 py-4 max-h-[350px] overflow-y-auto">
                            {myMissingPrintDays.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-200 mb-3" />
                                    <span className="text-lg font-bold text-emerald-600">พิมพ์ครบทุกวันเวรแล้ว! ✅</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {myMissingPrintDays.map(dateStr => {
                                        const [y, m, d] = dateStr.split('-').map(Number);
                                        const date = new Date(y, m - 1, d);
                                        const formatted = date.toLocaleDateString('th-TH', {
                                            weekday: 'short',
                                            day: 'numeric',
                                            month: 'short'
                                        });
                                        return (
                                            <button
                                                key={dateStr}
                                                onClick={() => {
                                                    setShowMissingPrintModal(false);
                                                    window.open(`/print-report?date=${dateStr}`, '_blank');
                                                }}
                                                className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-all group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                                    <span className="font-bold text-gray-700">{formatted}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-red-500">❌ ยังไม่พิมพ์</span>
                                                    <span className="text-sm font-bold text-white bg-red-500 px-3 py-1 rounded-full group-hover:bg-red-600 transition-colors">
                                                        พิมพ์ →
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-bold text-gray-500">สรุป</span>
                                <span className="text-sm font-bold text-red-600">
                                    ❗ ขาดพิมพ์ {myMissingPrintDays.length} วัน
                                </span>
                            </div>
                            <button
                                onClick={() => setShowMissingPrintModal(false)}
                                className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recording status is now shown in Dashboard card instead of floating bubble */}

            {/* Floating Bubble for Missing Print Days (All Devices) - Like poison status! */}
            {myMissingPrintDays.length > 0 && (
                <div className="fixed z-40 no-print bottom-20 right-4 md:bottom-8 md:right-8">
                    {/* Popover */}
                    {showPrintPopover && (
                        <div className="absolute bottom-16 right-0 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
                            {/* Popover Header */}
                            <div className="bg-gradient-to-r from-red-500 to-rose-500 px-4 py-3 text-white flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Printer className="w-4 h-4" />
                                    <span className="font-bold text-sm">🔥 วันที่ขาดพิมพ์</span>
                                </div>
                                <button
                                    onClick={() => setShowPrintPopover(false)}
                                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {/* Popover Content */}
                            <div className="max-h-[250px] overflow-y-auto p-2 space-y-1">
                                {myMissingPrintDays.map(dateStr => {
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const date = new Date(y, m - 1, d);
                                    const formatted = date.toLocaleDateString('th-TH', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short'
                                    });
                                    return (
                                        <button
                                            key={dateStr}
                                            onClick={() => {
                                                setShowPrintPopover(false);
                                                window.open(`/print-report?date=${dateStr}`, '_blank');
                                            }}
                                            className="w-full flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 rounded-xl transition-all group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                                <span className="text-sm font-bold text-gray-700">{formatted}</span>
                                            </div>
                                            <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-full group-hover:bg-red-600 transition-colors">
                                                พิมพ์ →
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Popover Footer */}
                            <div className="px-4 py-2 bg-gray-50 border-t text-center">
                                <span className="text-xs font-bold text-red-500">⚠️ กรุณาพิมพ์ให้ครบ!</span>
                            </div>
                        </div>
                    )}

                    {/* Floating Bubble - Annoying poison status style! */}
                    <button
                        onClick={() => setShowPrintPopover(!showPrintPopover)}
                        className={`px-4 py-2.5 md:px-5 md:py-3 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-xl transition-all active:scale-95 flex items-center gap-2 md:gap-3 ${showPrintPopover ? 'ring-4 ring-red-200 scale-100' : 'animate-bounce shadow-red-500/50'}`}
                        style={{
                            boxShadow: showPrintPopover ? undefined : '0 0 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.3)'
                        }}
                    >
                        <Printer className="w-5 h-5 md:w-6 md:h-6" />
                        <span className="font-bold text-sm md:text-base">ขาดพิมพ์</span>
                        {/* Badge */}
                        <span className="min-w-[24px] h-6 md:min-w-[26px] md:h-7 bg-white text-red-600 text-xs md:text-sm font-bold rounded-full flex items-center justify-center px-1.5 md:px-2 shadow-md border-2 border-red-400">
                            {myMissingPrintDays.length}
                        </span>
                    </button>
                </div>
            )}

            {/* Mobile Bottom Navigation */}
            <TeacherBottomNav
                currentView={currentView}
                onViewChange={setCurrentView}
                onLogout={onLogout}
                onBackToAdmin={onBackToAdmin}
                hasChanges={hasUnsavedChanges}
                onSave={handleSaveClick}
                saving={saving}
                userName={currentUser.name}
                userClass={selectedClass}
                isDataStale={isDataStale}
                onRefresh={onRefresh}
                missingDaysCount={missingDates.length}
                missingPrintDaysCount={myMissingPrintDays.length}
                onShowMissingPrintDays={() => setShowMissingPrintModal(true)}
            />

            {/* Success Toast */}
            {showSuccessToast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
                    <div className="bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="font-bold">บันทึกสำเร็จแล้ว!</span>
                    </div>
                </div>
            )}
        </div>
    );
};
