import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus, Users, Upload, Trash2, Loader2,
  CheckCircle, XCircle, AlertTriangle, LayoutDashboard,
  GraduationCap, Pencil, Edit2, UserMinus, RotateCcw, Clock,
  ArrowUpDown, ArrowUp, ArrowDown, Sun, CalendarDays, Printer, Bell
} from 'lucide-react';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, writeBatch, updateDoc, setDoc, orderBy
} from 'firebase/firestore/lite';
import * as firebaseApp from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase';
import { Student, TeacherForm, Gender, Role, AppUser, StudentStatus, SchoolActivity } from '../types';
import { mapStudentData } from '../utils';
import { Dashboard } from './Dashboard';
import { ConfirmationModal } from './ConfirmationModal';
import { AdminBottomNav } from './AdminBottomNav';
import { NotificationSettingsPanel } from './NotificationSettings';

interface AdminPanelProps {
  onSwitchToTeacherView: () => void;
  onLogout: () => void;
  onStudentChange?: () => void; // Called after student data changes (add/delete/withdraw)
}

const GRADE_OPTIONS = [
  'อนุบาล 2',
  'อนุบาล 3',
  'ประถมศึกษาปีที่ 1',
  'ประถมศึกษาปีที่ 2',
  'ประถมศึกษาปีที่ 3',
  'ประถมศึกษาปีที่ 4',
  'ประถมศึกษาปีที่ 5',
  'ประถมศึกษาปีที่ 6'
];

// Ensure inputs are white with black text
const INPUT_STYLE = "border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all w-full text-sm text-black bg-white placeholder-gray-400 shadow-sm disabled:bg-gray-100 disabled:text-gray-500";
const BTN_PRIMARY = "bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center";
const BTN_SECONDARY = "border border-gray-300 bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors";
const BTN_SUCCESS = "bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center";
const BTN_DANGER = "bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed";

// Cache keys for invalidation
const HOLIDAYS_CACHE_KEY = 'cached_holidays';
const HOLIDAYS_TIME_KEY = 'cached_holidays_time';
const ACTIVITIES_CACHE_KEY = 'cached_activities';
const ACTIVITIES_TIME_KEY = 'cached_activities_time';

// Helper to clear cache
const clearHolidaysCache = () => {
  localStorage.removeItem(HOLIDAYS_CACHE_KEY);
  localStorage.removeItem(HOLIDAYS_TIME_KEY);
};
const clearActivitiesCache = () => {
  localStorage.removeItem(ACTIVITIES_CACHE_KEY);
  localStorage.removeItem(ACTIVITIES_TIME_KEY);
};

// Update student version timestamp in Firestore (triggers other clients to refresh)
const updateStudentVersion = async () => {
  try {
    await setDoc(doc(db, 'metadata', 'students'), { lastUpdated: Date.now() });
  } catch (e) {
    console.error('Failed to update student version', e);
  }
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchToTeacherView, onLogout, onStudentChange }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<AppUser[]>([]);

  // Holidays are managed via Calendar tab now
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [selectedDeleteGrade, setSelectedDeleteGrade] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<AppUser | null>(null);
  // editingHoliday removed as it is now part of calendarEvents logic
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; action: () => Promise<void>; isDangerous: boolean;
  }>({ isOpen: false, title: '', message: '', action: async () => { }, isDangerous: false });

  // Unified State for Calendar (Holidays + Activities)
  const [calendarEvents, setCalendarEvents] = useState<{ id: string, type: 'holiday' | 'activity', date: string, title: string, description?: string }[]>([]);
  const [newEvent, setNewEvent] = useState({ type: 'activity' as 'activity' | 'holiday', title: '', date: '', description: '' });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    studentId: '', number: 0, name: '', grade: GRADE_OPTIONS[0], gender: Gender.MALE
  });
  const [newTeacher, setNewTeacher] = useState<TeacherForm>({
    name: '', assignedClass: GRADE_OPTIONS[0], username: '', password: ''
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // Holiday form removed (integrated into Calendar)

  // State for attendance recording times view
  const [recordTimesDate, setRecordTimesDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [attendanceRecords, setAttendanceRecords] = useState<{ grade: string; timestamp: number | null }[]>([]);
  const [loadingRecordTimes, setLoadingRecordTimes] = useState(false);
  const [timeDistribution, setTimeDistribution] = useState<{ hour: string; count: number }[]>([]);
  const [sortByTime, setSortByTime] = useState<'asc' | 'desc' | null>(null);
  // Date range for chart
  const [chartStartDate, setChartStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6); // Default: last 7 days
    return d.toLocaleDateString('sv-SE');
  });
  const [chartEndDate, setChartEndDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartGradeFilter, setChartGradeFilter] = useState<string>(''); // '' = all grades
  // Print monitor state
  const [monitorDate, setMonitorDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [printLog, setPrintLog] = useState<{ printed: boolean; timestamp: number | null; printedBy: string | null; role: string | null }>({ printed: false, timestamp: null, printedBy: null, role: null });
  const [loadingPrintLog, setLoadingPrintLog] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Track if data has been loaded to prevent redundant fetches
  const [dataLoaded, setDataLoaded] = useState({
    students: false,
    teachers: false,
    calendar: false
  });

  // Only fetch data when tab is accessed AND data hasn't been loaded yet
  useEffect(() => {
    if ((activeTab === 0 || activeTab === 1 || activeTab === 4) && !dataLoaded.students) {
      fetchStudents();
    }
    if (activeTab === 3 && !dataLoaded.teachers) {
      fetchTeachers();
    }
    // if (activeTab === 0 || activeTab === 6) { // Tab 5 no longer needs holiday fetch for UI, but dashboard might need it
    //   if (!dataLoaded.holidays) fetchHolidays();
    // }
    if (activeTab === 6) {
      fetchAttendanceRecordTimes();
    }
    if (activeTab === 7 && !dataLoaded.calendar) {
      fetchCalendarEvents();
    }
    if (activeTab === 8) {
      fetchPrintLog(monitorDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Remove dataLoaded from dependencies to prevent potential loop

  // Re-fetch when monitor date changes
  useEffect(() => {
    if (activeTab === 8) {
      fetchPrintLog(monitorDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorDate]);

  // Re-fetch when date changes for record times tab
  useEffect(() => {
    if (activeTab === 6) {
      fetchAttendanceRecordTimes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordTimesDate]);

  // Sync editing event to form
  useEffect(() => {
    const eventToEdit = calendarEvents.find(e => e.id === editingEventId);
    if (eventToEdit) {
      setNewEvent({
        type: eventToEdit.type,
        title: eventToEdit.title,
        date: eventToEdit.date,
        description: eventToEdit.description || ''
      });
    } else {
      setNewEvent({ type: 'activity', title: '', date: '', description: '' });
    }
  }, [editingEventId, calendarEvents]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStudents = async () => {
    setLoadingData(true);
    try {
      const q = query(collection(db, 'students'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => mapStudentData(d.id, d.data()));
      data.sort((a, b) => {
        const gradeA = a.grade || ''; const gradeB = b.grade || '';
        if (gradeA === gradeB) return (a.number || 0) - (b.number || 0);
        return gradeA.localeCompare(gradeB);
      });
      setStudents(data);
      setDataLoaded(prev => ({ ...prev, students: true }));
    } catch (error) { console.error(error); showToast("โหลดข้อมูลไม่สำเร็จ", 'error'); } finally { setLoadingData(false); }
  };

  const fetchTeachers = async () => {
    setLoadingData(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', Role.TEACHER));
      const snapshot = await getDocs(q);
      setTeachers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
      setDataLoaded(prev => ({ ...prev, teachers: true }));
    } catch (error) { console.error(error); } finally { setLoadingData(false); }
  };



  const fetchAttendanceRecordTimes = async () => {
    setLoadingRecordTimes(true);
    try {
      // Query attendance records for the selected date (for table only)
      const q = query(collection(db, 'attendance'), where('date', '==', recordTimesDate));
      const snapshot = await getDocs(q);

      // Group by grade and get the latest timestamp for each grade
      const gradeTimestamps: Record<string, number> = {};

      snapshot.docs.forEach(d => {
        const data = d.data();
        const grade = data.grade as string;
        const ts = data.timestamp as number;
        if (!gradeTimestamps[grade] || ts > gradeTimestamps[grade]) {
          gradeTimestamps[grade] = ts;
        }
      });

      // Create array for all grades with their timestamps (null if not recorded)
      const results = GRADE_OPTIONS.map(grade => ({
        grade,
        timestamp: gradeTimestamps[grade] || null
      }));

      setAttendanceRecords(results);
    } catch (e) { console.error(e); } finally { setLoadingRecordTimes(false); }
  };

  const fetchChartData = async () => {
    setLoadingChart(true);
    try {
      // Generate all dates in range
      const dates: string[] = [];
      const start = new Date(chartStartDate);
      const end = new Date(chartEndDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toLocaleDateString('sv-SE'));
      }

      // Query attendance records for all dates in range
      const hourCounts: Record<number, number> = {};

      // Firestore doesn't support 'in' with more than 30 items, so we batch
      const batchSize = 30;
      for (let i = 0; i < dates.length; i += batchSize) {
        const batch = dates.slice(i, i + batchSize);
        const q = query(collection(db, 'attendance'), where('date', 'in', batch));
        const snapshot = await getDocs(q);

        // Group by date+grade to get unique recordings per grade per day
        const dateGradeTimestamps: Record<string, number> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const grade = data.grade as string;

          // Filter by grade if specified
          if (chartGradeFilter && grade !== chartGradeFilter) return;

          const key = `${data.date}_${grade}`;
          const ts = data.timestamp as number;
          if (!dateGradeTimestamps[key] || ts > dateGradeTimestamps[key]) {
            dateGradeTimestamps[key] = ts;
          }
        });

        // Count by hour
        Object.values(dateGradeTimestamps).forEach(ts => {
          const hour = new Date(ts).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
      }

      // Create time distribution array for chart (from 6:00 to 18:00)
      const distribution: { hour: string; count: number }[] = [];
      for (let h = 6; h <= 18; h++) {
        distribution.push({
          hour: `${h.toString().padStart(2, '0')}:00`,
          count: hourCounts[h] || 0
        });
      }
      setTimeDistribution(distribution);
    } catch (e) { console.error(e); } finally { setLoadingChart(false); }
  };

  const fetchCalendarEvents = async () => {
    setLoadingActivities(true);
    try {
      // 1. Fetch School Activities
      const qAct = query(collection(db, 'school_activities'), orderBy('date', 'desc'));
      const snapAct = await getDocs(qAct);
      const acts = snapAct.docs.map(d => ({
        id: d.id,
        type: 'activity' as const,
        ...d.data()
      } as any));

      // 2. Fetch Holidays
      const qHol = query(collection(db, 'holidays'));
      const snapHol = await getDocs(qHol);
      const hols = snapHol.docs.map(d => ({
        id: d.id,
        type: 'holiday' as const,
        date: d.data().date,
        title: d.data().description, // Map description to title for unified interface
        description: 'วันหยุด'
      }));

      // 3. Merge and Sort
      const merged = [...acts, ...hols].sort((a, b) => b.date.localeCompare(a.date)); // Descending for management list

      setCalendarEvents(merged);
      setDataLoaded(prev => ({ ...prev, calendar: true }));
    } catch (e) {
      console.error(e);
      showToast("โหลดข้อมูลปฏิทินไม่สำเร็จ", 'error');
    } finally {
      setLoadingActivities(false);
    }
  };

  // Fetch print log for monitor tab
  const fetchPrintLog = async (date: string) => {
    setLoadingPrintLog(true);
    try {
      const docSnap = await getDocs(query(collection(db, 'print_logs'), where('date', '==', date)));
      if (!docSnap.empty) {
        const data = docSnap.docs[0].data();
        setPrintLog({
          printed: true,
          timestamp: data.timestamp,
          printedBy: data.printedBy || null,
          role: data.role || null
        });
      } else {
        setPrintLog({ printed: false, timestamp: null, printedBy: null, role: null });
      }
    } catch (e) {
      console.error(e);
      setPrintLog({ printed: false, timestamp: null, printedBy: null, role: null });
    } finally {
      setLoadingPrintLog(false);
    }
  };

  const handleCalendarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.date) return showToast("กรุณากรอกข้อมูลให้ครบ", 'error');

    setLoadingAction(true);
    try {
      if (editingEventId) {
        // Edit Mode
        // Determine if type changed? For simplicity assume ID is constant, but if type changed, we might need to delete old doc and create new one in different collection.
        // HOWEVER, for this MVP let's assume one can't change TYPE easily without delete/re-add or we handle it smart.
        // actually, let's keep it simple: Update based on original type used for ID lookup, OR simply enforce correct collection.

        const originalEvent = calendarEvents.find(ev => ev.id === editingEventId);
        if (!originalEvent) return;

        if (originalEvent.type !== newEvent.type) {
          // Type changed: Delete old, Create new
          const oldCollection = originalEvent.type === 'holiday' ? 'holidays' : 'school_activities';
          const newCollection = newEvent.type === 'holiday' ? 'holidays' : 'school_activities';

          await deleteDoc(doc(db, oldCollection, editingEventId));

          const data = newEvent.type === 'holiday'
            ? { date: newEvent.date, description: newEvent.title } // Holiday schema
            : { title: newEvent.title, date: newEvent.date, description: newEvent.description, createdAt: Date.now() }; // Activity schema

          const newDoc = await addDoc(collection(db, newCollection), data);

          setCalendarEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...newEvent, id: newDoc.id } : ev));
        } else {
          // Same type update
          const collectionName = newEvent.type === 'holiday' ? 'holidays' : 'school_activities';
          const data = newEvent.type === 'holiday'
            ? { date: newEvent.date, description: newEvent.title }
            : { title: newEvent.title, date: newEvent.date, description: newEvent.description };

          await updateDoc(doc(db, collectionName, editingEventId), data);
          setCalendarEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...ev, ...newEvent } : ev));
        }
        showToast("แก้ไขเรียบร้อย", 'success');

      } else {
        // Create Mode
        const collectionName = newEvent.type === 'holiday' ? 'holidays' : 'school_activities';
        const data = newEvent.type === 'holiday'
          ? { date: newEvent.date, description: newEvent.title }
          : { title: newEvent.title, date: newEvent.date, description: newEvent.description, createdAt: Date.now() };

        const docRef = await addDoc(collection(db, collectionName), data);
        const createdEvent = { id: docRef.id, ...newEvent };

        setCalendarEvents(prev => [createdEvent, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
        showToast("เพิ่มเรียบร้อย", 'success');

        // Invalidate cache
        if (newEvent.type === 'holiday') clearHolidaysCache();
        else clearActivitiesCache();
      }

      setEditingEventId(null);
      setNewEvent({ type: 'activity', title: '', date: '', description: '' });

    } catch (e) {
      console.error(e);
      showToast("เกิดข้อผิดพลาด", 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  const clickDeleteEvent = (id: string, type: 'holiday' | 'activity') => {
    setConfirmModal({
      isOpen: true, title: 'ลบรายการ', message: 'ยืนยันการลบ?', isDangerous: true,
      action: async () => {
        setLoadingAction(true);
        try {
          const collectionName = type === 'holiday' ? 'holidays' : 'school_activities';
          await deleteDoc(doc(db, collectionName, id));
          setCalendarEvents(prev => prev.filter(e => e.id !== id));
          showToast("ลบเรียบร้อย", 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));

          // Invalidate cache
          if (type === 'holiday') clearHolidaysCache();
          else clearActivitiesCache();
        } catch (e) { console.error(e); } finally { setLoadingAction(false); }
      }
    });
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.studentId) return showToast('ระบุรหัสนักเรียน', 'error');
    setLoadingAction(true);
    try {
      await setDoc(doc(db, 'students', newStudent.studentId), { ...newStudent, status: StudentStatus.ACTIVE, createdAt: Date.now() });
      showToast('เพิ่มสำเร็จ', 'success');
      setNewStudent({ studentId: '', number: 0, name: '', grade: GRADE_OPTIONS[0], gender: Gender.MALE });
      if (activeTab === 1 || activeTab === 4) fetchStudents();
      onStudentChange?.(); // Trigger cache refresh for all clients
      updateStudentVersion(); // Update version in Firestore
    } catch (err) { console.error(err); showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setLoadingAction(false); }
  };

  const handleCSVUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setLoadingAction(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const batch = writeBatch(db);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',');
          if (cols.length >= 3) {
            const sid = cols[1]?.trim();
            if (!sid) continue;
            const ref = doc(db, 'students', sid);
            batch.set(ref, {
              number: parseInt(cols[0]) || 0, studentId: sid,
              name: cols[2]?.trim() || 'ไม่ระบุชื่อ',
              grade: (cols[3] || GRADE_OPTIONS[0]).trim(),
              gender: (cols[4] || '').trim() === 'ชาย' ? Gender.MALE : Gender.FEMALE,
              status: StudentStatus.ACTIVE,
              createdAt: Date.now()
            });
            count++;
          }
        }
        await batch.commit();
        showToast(`นำเข้า ${count} รายการ`, 'success');
        setCsvFile(null);
        fetchStudents();
        onStudentChange?.();
        updateStudentVersion();
      } catch (error) { console.error(error); showToast("CSV Error", 'error'); } finally { setLoadingAction(false); }
    };
    reader.readAsText(csvFile);
  };

  const clickDeleteStudent = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'ลบนักเรียน', message: `ลบข้อมูล "${name}" ใช่หรือไม่?`, isDangerous: true,
      action: async () => {
        setLoadingAction(true);
        try {
          await deleteDoc(doc(db, 'students', id));
          setStudents(prev => prev.filter(s => s.id !== id));
          showToast('ลบเรียบร้อย', 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          onStudentChange?.();
          updateStudentVersion();
        }
        catch (e: any) { showToast(`Error: ${e.message}`, 'error'); } finally { setLoadingAction(false); }
      }
    });
  };

  const clickWithdrawStudent = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'นักเรียนลาออก', message: `ยืนยันว่า "${name}" ลาออกจากโรงเรียนใช่หรือไม่?`, isDangerous: false,
      action: async () => {
        setLoadingAction(true);
        try {
          await updateDoc(doc(db, 'students', id), {
            status: StudentStatus.WITHDRAWN,
            withdrawnAt: Date.now()
          });
          setStudents(prev => prev.map(s => s.id === id ? { ...s, status: StudentStatus.WITHDRAWN, withdrawnAt: Date.now() } : s));
          showToast(`${name} ถูกบันทึกเป็น "ลาออก"`, 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          onStudentChange?.();
          updateStudentVersion();
        }
        catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
        finally { setLoadingAction(false); }
      }
    });
  };

  const clickReactivateStudent = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'คืนสถานะนักเรียน', message: `ยืนยันคืนสถานะ "${name}" กลับมาเป็นนักเรียนปกติ?`, isDangerous: false,
      action: async () => {
        setLoadingAction(true);
        try {
          await updateDoc(doc(db, 'students', id), {
            status: StudentStatus.ACTIVE,
            withdrawnAt: null
          });
          setStudents(prev => prev.map(s => s.id === id ? { ...s, status: StudentStatus.ACTIVE, withdrawnAt: undefined } : s));
          showToast(`${name} กลับมาเป็นนักเรียนปกติแล้ว`, 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          onStudentChange?.();
          updateStudentVersion();
        }
        catch (e: any) { showToast(`Error: ${e.message}`, 'error'); }
        finally { setLoadingAction(false); }
      }
    });
  };

  const clickDeleteByGrade = () => {
    if (!selectedDeleteGrade) return showToast("เลือกชั้นเรียน", 'error');
    setConfirmModal({
      isOpen: true, title: `ลบทั้งระดับชั้น`, message: `ลบข้อมูลชั้น "${selectedDeleteGrade}" ทั้งหมด?`, isDangerous: true,
      action: async () => {
        setLoadingAction(true);
        try {
          const q = query(collection(db, 'students'), where('grade', '==', selectedDeleteGrade));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
          await batch.commit();
          setStudents(prev => prev.filter(s => s.grade !== selectedDeleteGrade));
          setSelectedDeleteGrade('');
          showToast(`ลบเรียบร้อย`, 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          onStudentChange?.();
          updateStudentVersion();
        } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); } finally { setLoadingAction(false); }
      }
    });
  };

  const clickDeleteTeacher = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'ลบบัญชีครู', message: `ลบบัญชี "${name}"?`, isDangerous: true,
      action: async () => {
        setLoadingAction(true);
        try { await deleteDoc(doc(db, 'users', id)); setTeachers(prev => prev.filter(t => t.id !== id)); showToast(`ลบเรียบร้อย`, 'success'); setConfirmModal(prev => ({ ...prev, isOpen: false })); }
        catch (e: any) { showToast(`Error: ${e.message}`, 'error'); } finally { setLoadingAction(false); }
      }
    });
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setLoadingAction(true);
    try {
      await updateDoc(doc(db, 'students', editingStudent.id), {
        number: Number(editingStudent.number), studentId: editingStudent.studentId,
        name: editingStudent.name, grade: editingStudent.grade, gender: editingStudent.gender,
        status: editingStudent.status || StudentStatus.ACTIVE,
        withdrawnAt: editingStudent.withdrawnAt || null
      });
      setStudents(prev => prev.map(s => s.id === editingStudent.id ? editingStudent : s));
      showToast('แก้ไขเรียบร้อย', 'success'); setEditingStudent(null);
    } catch (e: any) { showToast(`Error: ${e.message}`, 'error'); } finally { setLoadingAction(false); }
  };

  // Migration: Add createdAt to existing students (17 Nov 2025)
  const handleMigrateCreatedAt = async () => {
    const confirmed = window.confirm('ยืนยันการเพิ่มวันที่ลงทะเบียนให้นักเรียนเก่าทุกคน?\n\nวันที่: 17 พ.ย. 2568 (วันเปิดใช้งานแอพ)');
    if (!confirmed) return;

    setLoadingAction(true);
    const DEFAULT_CREATED_AT = new Date('2025-11-17T00:00:00+07:00').getTime();
    let updated = 0, skipped = 0;

    try {
      const studentsWithoutCreatedAt = students.filter(s => !s.createdAt);

      for (const student of studentsWithoutCreatedAt) {
        await updateDoc(doc(db, 'students', student.id), { createdAt: DEFAULT_CREATED_AT });
        updated++;
      }
      skipped = students.length - updated;

      showToast(`Migration สำเร็จ! อัพเดท ${updated} คน, ข้าม ${skipped} คน`, 'success');
      fetchStudents(); // Refresh data
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  // Expose to window for console access
  (window as any).runMigration = handleMigrateCreatedAt;

  // Fix specific student's createdAt date
  // Usage: fixStudentDate('รหัสนักเรียน', '2025-12-15')
  (window as any).fixStudentDate = async (studentId: string, dateStr: string) => {
    const student = students.find(s => s.studentId === studentId || s.id === studentId);
    if (!student) {
      console.error('❌ ไม่พบนักเรียน:', studentId);
      return;
    }
    const newDate = new Date(dateStr + 'T00:00:00+07:00').getTime();
    await updateDoc(doc(db, 'students', student.id), { createdAt: newDate });
    console.log(`✅ อัพเดท ${student.name} → createdAt = ${dateStr}`);
    fetchStudents();
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingTeacher) {
      // UPDATE Mode
      setLoadingAction(true);
      try {
        await updateDoc(doc(db, 'users', editingTeacher.id), {
          name: newTeacher.name,
          assignedClass: newTeacher.assignedClass
        });
        setTeachers(prev => prev.map(t => t.id === editingTeacher.id ? { ...t, name: newTeacher.name, assignedClass: newTeacher.assignedClass } : t));
        showToast('แก้ไขข้อมูลสำเร็จ', 'success');

        // Reset
        setEditingTeacher(null);
        setNewTeacher({ name: '', assignedClass: GRADE_OPTIONS[0], username: '', password: '' });
      } catch (e: any) {
        showToast(`Error: ${e.message}`, 'error');
      } finally {
        setLoadingAction(false);
      }
    } else {
      // CREATE Mode
      const cleanUsername = newTeacher.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const cleanPassword = newTeacher.password?.trim();
      if (!cleanUsername || !cleanPassword || cleanPassword.length < 6) return showToast("ข้อมูลไม่ถูกต้อง", 'error');

      setLoadingAction(true);
      const secondaryApp = (firebaseApp as any).initializeApp(firebaseConfig, "SecondaryApp");
      const secondaryAuth = getAuth(secondaryApp);
      try {
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, `${cleanUsername}@school.local`, cleanPassword);
        const newUser = {
          name: newTeacher.name,
          username: cleanUsername,
          role: Role.TEACHER,
          assignedClass: newTeacher.assignedClass
        };
        await setDoc(doc(db, 'users', userCred.user.uid), newUser);
        await signOut(secondaryAuth); await (firebaseApp as any).deleteApp(secondaryApp);

        setTeachers(prev => [...prev, { id: userCred.user.uid, ...newUser } as AppUser]);
        showToast(`เพิ่มบัญชีสำเร็จ`, 'success');
        setNewTeacher({ name: '', assignedClass: GRADE_OPTIONS[0], username: '', password: '' });
      } catch (err: any) {
        showToast(err.code === 'auth/email-already-in-use' ? "Username ซ้ำ" : "Error", 'error');
        try { await (firebaseApp as any).deleteApp(secondaryApp); } catch (e) { }
      } finally {
        setLoadingAction(false);
      }
    }
  };

  const clickEditTeacher = (teacher: AppUser) => {
    setEditingTeacher(teacher);
    setNewTeacher({
      name: teacher.name,
      assignedClass: teacher.assignedClass || GRADE_OPTIONS[0],
      username: teacher.username,
      password: '' // Password cannot be retrieved
    });
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditTeacher = () => {
    setEditingTeacher(null);
    setNewTeacher({ name: '', assignedClass: GRADE_OPTIONS[0], username: '', password: '' });
  };






  const uniqueGrades = Array.from(new Set(students.map(s => s.grade))).filter(Boolean).sort();

  const tabs = [
    { id: 0, label: 'สถิติ', icon: LayoutDashboard },
    { id: 1, label: 'รายชื่อ', icon: Users },
    { id: 2, label: 'เพิ่มนร.', icon: UserPlus },
    { id: 3, label: 'ครู', icon: UserPlus },
    { id: 4, label: 'ลบ/แก้', icon: Trash2 },
    { id: 6, label: 'เวลาบันทึก', icon: Clock },
    { id: 7, label: 'ปฏิทิน', icon: CalendarDays },
    { id: 8, label: 'มอนิเตอร์', icon: Printer },
    { id: 9, label: 'แจ้งเตือน', icon: Bell },
  ];

  return (
    <div className="rounded-3xl shadow-lg border border-white/50 flex flex-col md:flex-row overflow-hidden min-h-[80vh] pb-20 md:pb-0" style={{ background: '#F2F8FC' }}>

      {/* Sidebar - Hidden on mobile */}
      <div className="hidden md:flex w-64 bg-white/60 border-r border-white/30 flex-col shrink-0">
        <div className="flex md:flex-col p-2 md:p-4 gap-1 md:gap-2 min-w-max md:min-w-0 w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all whitespace-nowrap w-auto md:w-full ${activeTab === tab.id
                ? 'bg-white text-black border border-gray-200 shadow-md'
                : 'text-gray-500 hover:bg-white/50 hover:text-black border border-transparent'
                }`}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-brand-600' : 'text-gray-400'}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Switch to Teacher View Button at bottom */}
        <div className="mt-auto p-4 border-t border-white/30">
          <button
            onClick={onSwitchToTeacherView}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all"
          >
            <GraduationCap className="w-5 h-5" />
            สลับไปมุมมองครู
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-white/30">
        {activeTab === 0 && <div className="-m-2 md:m-0"><Dashboard embedded students={students} /></div>}

        {activeTab === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-black">รายชื่อนักเรียนทั้งหมด ({students.filter(s => s.status !== StudentStatus.WITHDRAWN).length})</h3>
              <select className="w-full sm:w-auto border border-gray-300 rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 bg-white text-black"
                onChange={(e) => setFilterGrade(e.target.value)} value={filterGrade}>
                <option value="">ทุกระดับชั้น</option>
                {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
              <table className="w-full text-sm text-left text-black">
                <thead className="text-xs text-gray-600 uppercase bg-gray-50 border-b border-gray-200">
                  <tr><th className="px-4 py-3 w-20 text-center">เลขที่</th><th className="px-4 py-3">ชื่อ-นามสกุล</th><th className="px-4 py-3">ชั้น</th><th className="px-4 py-3 text-center">เพศ</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.filter(s => (!filterGrade || s.grade === filterGrade) && s.status !== StudentStatus.WITHDRAWN).map((s) => (
                    <tr key={s.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-center font-mono text-gray-500 font-medium">{s.number}</td>
                      <td className="px-4 py-3 font-bold text-black">{s.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="bg-gray-100 px-2 py-1 rounded text-xs text-black">{s.grade}</span></td>
                      <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${s.gender === Gender.MALE ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>{s.gender}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div className="space-y-6 max-w-2xl mx-auto animate-fade-in">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-black border-b border-gray-100 pb-3"><UserPlus className="w-5 h-5 text-brand-600" /> เพิ่มนักเรียนรายคน</h3>
              <form onSubmit={handleAddStudent} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="text-xs font-bold text-gray-700 mb-1 block">เลขที่</label>
                    <input type="number" placeholder="เลขที่" required className={INPUT_STYLE} value={newStudent.number || ''} onChange={e => setNewStudent({ ...newStudent, number: parseInt(e.target.value) })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-gray-700 mb-1 block">รหัสประจำตัว</label>
                    <input type="text" placeholder="รหัส" required className={INPUT_STYLE} value={newStudent.studentId} onChange={e => setNewStudent({ ...newStudent, studentId: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-1 block">ชื่อ-นามสกุล</label>
                  <input type="text" placeholder="ชื่อ-นามสกุล" required className={INPUT_STYLE} value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">ระดับชั้น</label>
                    <select className={INPUT_STYLE} value={newStudent.grade} onChange={e => setNewStudent({ ...newStudent, grade: e.target.value })}>{GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">เพศ</label>
                    <select className={INPUT_STYLE} value={newStudent.gender} onChange={e => setNewStudent({ ...newStudent, gender: e.target.value as Gender })}><option value={Gender.MALE}>ชาย</option><option value={Gender.FEMALE}>หญิง</option></select>
                  </div>
                </div>
                <button type="submit" className={`${BTN_PRIMARY} w-full py-3 mt-2`}>บันทึกข้อมูล</button>
              </form>
            </div>

            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 shadow-sm">
              <h3 className="text-lg font-bold mb-3 text-emerald-800 flex items-center gap-2"><Upload className="w-5 h-5" /> นำเข้าไฟล์ CSV</h3>
              <p className="text-xs text-emerald-700 mb-4 bg-emerald-100/50 p-3 rounded-lg border border-emerald-200">
                <strong className="block mb-1">รูปแบบข้อมูลในไฟล์:</strong>
                เลขที่,รหัส,ชื่อ-สกุล,ชั้น,เพศ<br />
                <span className="opacity-75">ตัวอย่าง: 1,1001,ด.ช.รักเรียน,ป.1,ชาย</span>
              </p>
              <form onSubmit={handleCSVUpload} className="flex flex-col gap-3">
                <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files ? e.target.files[0] : null)} className="block w-full text-sm text-emerald-900 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-emerald-200 file:text-emerald-800 hover:file:bg-emerald-300 transition-colors cursor-pointer" />
                <button type="submit" disabled={!csvFile || loadingAction} className={`${BTN_SUCCESS} w-full py-3`}>อัปโหลดไฟล์</button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 3 && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <div className={`bg-white p-6 rounded-2xl border shadow-md transition-colors ${editingTeacher ? 'border-brand-200 ring-1 ring-brand-100' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center mb-5 border-b border-gray-100 pb-3">
                <h3 className="text-lg font-bold text-black flex items-center gap-2">
                  {editingTeacher ? (
                    <><Pencil className="w-5 h-5 text-brand-600" /> แก้ไขข้อมูลครู</>
                  ) : (
                    <><UserPlus className="w-5 h-5 text-gray-600" /> เพิ่มบัญชีครู</>
                  )}
                </h3>
                {editingTeacher && (
                  <button onClick={cancelEditTeacher} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded font-bold transition-colors">ยกเลิกการแก้ไข</button>
                )}
              </div>
              <form onSubmit={handleTeacherSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">ชื่อ-นามสกุลครู</label>
                    <input type="text" placeholder="ชื่อ-นามสกุล" required className={INPUT_STYLE} value={newTeacher.name} onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">ครูประจำชั้น</label>
                    <select className={INPUT_STYLE} value={newTeacher.assignedClass} onChange={e => setNewTeacher({ ...newTeacher, assignedClass: e.target.value })}>{GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}</select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">Username (ภาษาอังกฤษ)</label>
                    <input
                      type="text"
                      placeholder={editingTeacher ? "แก้ไขไม่ได้" : "เช่น somchai"}
                      required={!editingTeacher}
                      disabled={!!editingTeacher}
                      className={INPUT_STYLE}
                      value={newTeacher.username}
                      onChange={e => setNewTeacher({ ...newTeacher, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">Password (อย่างน้อย 6 ตัว)</label>
                    <input
                      type="text"
                      placeholder={editingTeacher ? "แก้ไขไม่ได้" : "******"}
                      required={!editingTeacher}
                      disabled={!!editingTeacher}
                      className={INPUT_STYLE}
                      value={newTeacher.password}
                      onChange={e => setNewTeacher({ ...newTeacher, password: e.target.value })}
                    />
                  </div>
                </div>
                {editingTeacher && <p className="text-xs text-gray-400">* หากต้องการเปลี่ยนรหัสผ่าน โปรดลบและสร้างบัญชีใหม่</p>}

                <button type="submit" disabled={loadingAction} className={`${editingTeacher ? BTN_SUCCESS : BTN_PRIMARY} w-full py-3`}>
                  {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingTeacher ? 'บันทึกการแก้ไข' : 'สร้างบัญชีผู้ใช้')}
                </button>
              </form>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 font-bold text-black">รายชื่อครูในระบบ</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-4">ชื่อ</th><th className="p-4">ชั้น</th><th className="p-4">Username</th><th className="p-4 text-right">จัดการ</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {teachers.map(t => (
                      <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${editingTeacher?.id === t.id ? 'bg-blue-50' : ''}`}>
                        <td className="p-4 font-bold text-black">{t.name}</td>
                        <td className="p-4"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-100">{t.assignedClass}</span></td>
                        <td className="p-4 text-gray-600 font-mono">{t.username}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <button onClick={() => clickEditTeacher(t)} className="text-brand-600 hover:bg-brand-50 p-2 rounded-lg transition-colors mr-1" title="แก้ไขข้อมูล"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => clickDeleteTeacher(t.id, t.name)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="ลบบัญชี"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3 text-red-700">
                <div className="p-2 bg-red-50 rounded-xl"><AlertTriangle className="w-6 h-6" /></div>
                <span className="font-bold">ลบข้อมูลทั้งระดับชั้น</span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <select className={`${INPUT_STYLE} flex-1 sm:w-48 border-red-200 focus:ring-red-200`} value={selectedDeleteGrade} onChange={(e) => setSelectedDeleteGrade(e.target.value)}><option value="">เลือกชั้นที่จะลบ</option>{uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}</select>
                <button onClick={clickDeleteByGrade} disabled={!selectedDeleteGrade} className={`${BTN_DANGER} whitespace-nowrap px-6`}>ลบ</button>
              </div>
            </div>

            {/* Active Students Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="font-bold text-black">รายชื่อนักเรียน ({students.filter(s => s.status !== StudentStatus.WITHDRAWN).length} คน)</div>
                <select
                  className="border border-gray-300 rounded-lg text-sm px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white text-black"
                  onChange={(e) => setFilterGrade(e.target.value)}
                  value={filterGrade}
                >
                  <option value="">แสดงทุกระดับชั้น</option>
                  {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200"><tr><th className="p-4 w-16 text-center">#</th><th className="p-4">ชื่อ</th><th className="p-4">ชั้น</th><th className="p-4 text-right">จัดการ</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.filter(s => (!filterGrade || s.grade === filterGrade) && s.status !== StudentStatus.WITHDRAWN).map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="p-4 text-center text-gray-400">{s.number}</td>
                        <td className="p-4 font-bold text-black">{s.name}</td>
                        <td className="p-4 text-black">{s.grade}</td>
                        <td className="p-4 text-right flex justify-end gap-1">
                          <button onClick={() => setEditingStudent(s)} className="text-brand-600 hover:bg-brand-50 p-2 rounded-lg transition-colors" title="แก้ไข"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => clickWithdrawStudent(s.id, s.name)} className="text-orange-500 hover:bg-orange-50 p-2 rounded-lg transition-colors" title="ลาออก"><UserMinus className="w-4 h-4" /></button>
                          <button onClick={() => clickDeleteStudent(s.id, s.name)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="ลบ"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Withdrawn Students Section */}
            {students.filter(s => s.status === StudentStatus.WITHDRAWN).length > 0 && (
              <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-orange-100 flex justify-between items-center bg-orange-50">
                  <div className="font-bold text-orange-700 flex items-center gap-2">
                    <UserMinus className="w-5 h-5" />
                    นักเรียนที่ลาออก ({students.filter(s => s.status === StudentStatus.WITHDRAWN).length} คน)
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-orange-50/50 text-xs uppercase text-orange-600 border-b border-orange-100"><tr><th className="p-4 w-16 text-center">#</th><th className="p-4">ชื่อ</th><th className="p-4">ชั้น</th><th className="p-4">วันที่ลาออก</th><th className="p-4 text-right">จัดการ</th></tr></thead>
                    <tbody className="divide-y divide-orange-50">
                      {students.filter(s => s.status === StudentStatus.WITHDRAWN).map(s => (
                        <tr key={s.id} className="hover:bg-orange-50/50">
                          <td className="p-4 text-center text-gray-400">{s.number}</td>
                          <td className="p-4 font-bold text-gray-600">{s.name}</td>
                          <td className="p-4 text-gray-500">{s.grade}</td>
                          <td className="p-4 text-gray-500 text-sm">{s.withdrawnAt ? new Date(s.withdrawnAt).toLocaleDateString('th-TH') : '-'}</td>
                          <td className="p-4 text-right flex justify-end gap-1">
                            <button onClick={() => clickReactivateStudent(s.id, s.name)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors" title="คืนสถานะ"><RotateCcw className="w-4 h-4" /></button>
                            <button onClick={() => clickDeleteStudent(s.id, s.name)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="ลบถาวร"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}



        {activeTab === 6 && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="font-bold mb-4 text-black flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-600" /> เวลาบันทึกการเช็คชื่อ
              </h3>

              {/* Date Picker */}
              <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CalendarDays className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    className={`${INPUT_STYLE} pl-10 cursor-pointer`}
                    value={recordTimesDate}
                    onChange={e => setRecordTimesDate(e.target.value)}
                  />
                </div>
                <button
                  onClick={fetchAttendanceRecordTimes}
                  disabled={loadingRecordTimes}
                  className={`${BTN_PRIMARY} px-6`}
                >
                  {loadingRecordTimes ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ดูข้อมูล'}
                </button>
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-sm text-left text-black">
                  <thead className="text-xs text-gray-600 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">ระดับชั้น</th>
                      <th className="px-4 py-3 text-center">สถานะ</th>
                      <th className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSortByTime(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                          className="inline-flex items-center gap-1 hover:text-brand-600 transition-colors"
                        >
                          เวลาบันทึก
                          {sortByTime === 'asc' ? <ArrowUp className="w-3 h-3" /> :
                            sortByTime === 'desc' ? <ArrowDown className="w-3 h-3" /> :
                              <ArrowUpDown className="w-3 h-3 opacity-50" />}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...attendanceRecords]
                      .sort((a, b) => {
                        if (!sortByTime) return 0;
                        // Sort by time of day (minutes since midnight) instead of full timestamp
                        const getMinutesSinceMidnight = (ts: number | null) => {
                          if (!ts) return sortByTime === 'asc' ? Infinity : -Infinity; // Put null timestamps at the end
                          const date = new Date(ts);
                          return date.getHours() * 60 + date.getMinutes();
                        };
                        const aMinutes = getMinutesSinceMidnight(a.timestamp);
                        const bMinutes = getMinutesSinceMidnight(b.timestamp);
                        return sortByTime === 'asc' ? aMinutes - bMinutes : bMinutes - aMinutes;
                      })
                      .map(record => {

                        return (
                          <tr key={record.grade} className="hover:bg-blue-50/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-black">{record.grade}</td>
                            <td className="px-4 py-3 text-center">
                              {(() => {
                                const activeHoliday = calendarEvents.find(e => e.type === 'holiday' && e.date === recordTimesDate);
                                if (activeHoliday) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                                      <Sun className="w-3 h-3" />
                                      วันหยุด: {activeHoliday.title}
                                    </span>
                                  );
                                }
                                if (record.timestamp) {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      <CheckCircle className="w-3 h-3" />
                                      บันทึกแล้ว
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200">
                                    <XCircle className="w-3 h-3" />
                                    ยังไม่บันทึก
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600 font-mono">
                              {record.timestamp
                                ? new Date(record.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : '-'
                              }
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {attendanceRecords.length === 0 && !loadingRecordTimes && (
                <div className="text-center text-gray-400 py-8">
                  เลือกวันที่แล้วกดปุ่ม "ดูข้อมูล" เพื่อดูเวลาบันทึก
                </div>
              )}

              {loadingRecordTimes && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                </div>
              )}
            </div>

            {/* Time Distribution Chart with Date Range */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="font-bold mb-4 text-black flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" /> กราฟช่วงเวลาที่บันทึกบ่อย
              </h3>

              {/* Date Range Picker */}
              <div className="flex flex-col md:flex-row gap-3 mb-6 bg-purple-50 p-4 rounded-xl border border-purple-100">
                <div className="flex-1">
                  <label className="text-xs font-bold text-purple-700 mb-1 block">วันเริ่มต้น</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarDays className="h-4 w-4 text-purple-400" />
                    </div>
                    <input
                      type="date"
                      className={`${INPUT_STYLE} pl-10 cursor-pointer border-purple-200 focus:ring-purple-300`}
                      value={chartStartDate}
                      onChange={e => setChartStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-purple-700 mb-1 block">วันสิ้นสุด</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CalendarDays className="h-4 w-4 text-purple-400" />
                    </div>
                    <input
                      type="date"
                      className={`${INPUT_STYLE} pl-10 cursor-pointer border-purple-200 focus:ring-purple-300`}
                      value={chartEndDate}
                      onChange={e => setChartEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-purple-700 mb-1 block">ระดับชั้น</label>
                  <select
                    className={`${INPUT_STYLE} border-purple-200 focus:ring-purple-300`}
                    value={chartGradeFilter}
                    onChange={e => setChartGradeFilter(e.target.value)}
                  >
                    <option value="">ทุกระดับชั้น</option>
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={fetchChartData}
                    disabled={loadingChart}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-[42px]"
                  >
                    {loadingChart ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ดูกราฟ'}
                  </button>
                </div>
              </div>

              {/* Chart */}
              {timeDistribution.length > 0 && timeDistribution.some(d => d.count > 0) ? (
                <div className="space-y-2">
                  {timeDistribution.map(item => {
                    const maxCount = Math.max(...timeDistribution.map(d => d.count), 1);
                    const percentage = (item.count / maxCount) * 100;
                    return (
                      <div key={item.hour} className="flex items-center gap-3">
                        <span className="w-14 text-xs font-mono text-gray-500 text-right">{item.hour}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${item.count > 0 ? 'bg-gradient-to-r from-purple-500 to-brand-500' : 'bg-transparent'
                              }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className={`w-8 text-sm font-bold text-right ${item.count > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                          {item.count}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-400 mt-4 text-center">
                    จำนวนครั้งที่บันทึกในแต่ละช่วงเวลา ({chartGradeFilter || 'ทุกชั้น'} ในช่วงที่เลือก)
                  </p>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  {loadingChart ? (
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto" />
                  ) : (
                    <>เลือกช่วงวันที่แล้วกดปุ่ม "ดูกราฟ" เพื่อดูสถิติ</>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 7 && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div className={`bg-white p-6 rounded-2xl border shadow-md transition-all ${editingEventId ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-black flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-600" /> {editingEventId ? 'แก้ไขรายการ' : 'เพิ่มรายการปฏิทิน'}
                </h3>
                {editingEventId && <button onClick={() => { setEditingEventId(null); setNewEvent({ type: 'activity', title: '', date: '', description: '' }); }} className="text-red-500 text-xs font-bold underline">ยกเลิกแก้ไข</button>}
              </div>

              <form onSubmit={handleCalendarSubmit} className="space-y-4">

                {/* Type Selection */}
                <div className="flex p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setNewEvent({ ...newEvent, type: 'activity' })}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newEvent.type === 'activity' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    กิจกรรม
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEvent({ ...newEvent, type: 'holiday' })}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newEvent.type === 'holiday' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    วันหยุด
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">วันที่</label>
                    <input
                      type="date"
                      required
                      className={INPUT_STYLE}
                      value={newEvent.date}
                      onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">{newEvent.type === 'holiday' ? 'ชื่อวันหยุด' : 'หัวข้อกิจกรรม'}</label>
                    <input
                      type="text"
                      required
                      placeholder={newEvent.type === 'holiday' ? "เช่น วันปีใหม่" : "เช่น กีฬาสี, ทัศนศึกษา"}
                      className={INPUT_STYLE}
                      value={newEvent.title}
                      onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                    />
                  </div>
                </div>
                {newEvent.type === 'activity' && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 mb-1 block">รายละเอียด (ไม่บังคับ)</label>
                    <textarea
                      className={INPUT_STYLE}
                      placeholder="รายละเอียดกิจกรรม..."
                      rows={2}
                      value={newEvent.description}
                      onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                    />
                  </div>
                )}

                <button type="submit" disabled={loadingAction} className={`${newEvent.type === 'holiday' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white w-full py-3 rounded-xl font-bold shadow-sm flex justify-center items-center`}>
                  {loadingAction ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingEventId ? 'บันทึกการแก้ไข' : 'บันทึกรายการ')}
                </button>
              </form>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-gray-700 px-1">ปฏิทินกิจกรรมทั้งหมด</h4>
              {loadingActivities ? (
                <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
              ) : calendarEvents.length === 0 ? (
                <div className="text-center text-gray-400 py-8 bg-white/50 rounded-xl border border-gray-200 border-dashed">ไม่มีรายการ</div>
              ) : (() => {
                // Get today's date using local timezone (avoid toISOString which converts to UTC)
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // Filter to show only upcoming events
                const upcomingEvents = calendarEvents.filter(event => event.date >= todayStr);

                if (upcomingEvents.length === 0) {
                  return <div className="text-center text-gray-400 py-8 bg-white/50 rounded-xl border border-gray-200 border-dashed">ยังไม่มีรายการกิจกรรมที่จะมาถึง</div>;
                }

                return upcomingEvents.map(event => {
                  const isHoliday = event.type === 'holiday';
                  // Parse date correctly for local timezone (avoid UTC interpretation of ISO string)
                  const [year, month, day] = event.date.split('-').map(Number);
                  const eventDate = new Date(year, month - 1, day);
                  const isToday = event.date === todayStr;

                  return (
                    <div key={event.id} className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row gap-4 justify-between items-start transition-all hover:shadow-lg hover:scale-[1.01] ${isHoliday
                      ? 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 shadow-orange-100/50'
                      : 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200 shadow-indigo-100/50'
                      } shadow-md ${isToday ? 'ring-2 ring-offset-2 ' + (isHoliday ? 'ring-orange-400' : 'ring-indigo-400') : ''}`}>
                      <div className="flex gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-sm ${isHoliday
                          ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white'
                          : 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white'
                          }`}>
                          <span className="text-2xl font-bold leading-none">{eventDate.getDate()}</span>
                          <span className="text-[10px] uppercase font-bold opacity-90">{eventDate.toLocaleDateString('th-TH', { month: 'short' })}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-bold text-lg text-gray-800">{event.title}</h5>
                            {isHoliday && <span className="bg-orange-500 text-white text-[10px] px-2.5 py-1 rounded-full font-bold shadow-sm">วันหยุด</span>}
                            {isToday && <span className="bg-emerald-500 text-white text-[10px] px-2.5 py-1 rounded-full font-bold animate-pulse shadow-sm">วันนี้</span>}
                          </div>

                          {event.description && event.description !== 'วันหยุด' && <p className="text-sm text-gray-500 line-clamp-2 mt-1">{event.description}</p>}
                          <p className="text-xs text-gray-400 mt-2 font-medium">{eventDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 self-end sm:self-center">
                        <button
                          onClick={() => setEditingEventId(event.id)}
                          className={`p-2.5 rounded-xl transition-all ${isHoliday ? 'text-orange-500 hover:bg-orange-100' : 'text-indigo-500 hover:bg-indigo-100'}`}
                          title="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => clickDeleteEvent(event.id, event.type)}
                          className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition-all"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Tab 8: Monitor - Print Report Status */}
        {activeTab === 8 && (
          <div className="space-y-6 max-w-xl mx-auto animate-fade-in">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-black border-b border-gray-100 pb-3">
                <Printer className="w-5 h-5 text-brand-600" /> มอนิเตอร์การพิมพ์รายงาน
              </h3>

              {/* Date Picker */}
              <div className="mb-6">
                <label className="text-sm font-bold text-gray-700 block mb-2">เลือกวันที่</label>
                <input
                  type="date"
                  value={monitorDate}
                  onChange={(e) => setMonitorDate(e.target.value)}
                  className={INPUT_STYLE}
                />
              </div>

              {/* Status Display */}
              {loadingPrintLog ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                </div>
              ) : (
                <div className={`rounded-2xl p-8 text-center ${printLog.printed ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
                  <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 ${printLog.printed ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    {printLog.printed ? (
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    ) : (
                      <Clock className="w-10 h-10 text-amber-600" />
                    )}
                  </div>
                  <h4 className={`text-2xl font-bold mb-2 ${printLog.printed ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {printLog.printed ? '✅ พิมพ์รายงานแล้ว' : '⏳ ยังไม่ได้พิมพ์รายงาน'}
                  </h4>
                  {printLog.printed && printLog.timestamp && (
                    <div className="text-emerald-600">
                      <p className="font-medium">
                        เวลา {new Date(printLog.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                      </p>
                      {printLog.printedBy && (
                        <p className="text-sm mt-1">
                          โดย: <span className="font-bold">{printLog.printedBy}</span>
                          {printLog.role && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-200 text-emerald-700">
                              {printLog.role === 'admin' ? 'ผู้ดูแล' : printLog.role === 'teacher' ? 'ครู' : printLog.role}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-gray-500 mt-3">
                    วันที่ {new Date(monitorDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => fetchPrintLog(monitorDate)}
                disabled={loadingPrintLog}
                className={`${BTN_SECONDARY} w-full mt-4 flex items-center justify-center gap-2`}
              >
                <RotateCcw className={`w-4 h-4 ${loadingPrintLog ? 'animate-spin' : ''}`} />
                รีเฟรช
              </button>

              {/* Delete Button - Only show when printed */}
              {printLog.printed && (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'ลบประวัติการพิมพ์',
                      message: `ยืนยันลบประวัติการพิมพ์วันที่ ${new Date(monitorDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}?`,
                      isDangerous: true,
                      action: async () => {
                        setLoadingAction(true);
                        try {
                          await deleteDoc(doc(db, 'print_logs', monitorDate));
                          setPrintLog({ printed: false, timestamp: null, printedBy: null, role: null });
                          showToast('ลบประวัติเรียบร้อย', 'success');
                          setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        } catch (e) {
                          console.error(e);
                          showToast('เกิดข้อผิดพลาด', 'error');
                        } finally {
                          setLoadingAction(false);
                        }
                      }
                    });
                  }}
                  className={`${BTN_DANGER} w-full mt-2 flex items-center justify-center gap-2`}
                >
                  <Trash2 className="w-4 h-4" />
                  ลบประวัติการพิมพ์
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab 9: Notification Settings */}
        {activeTab === 9 && <NotificationSettingsPanel />}
      </div>

      {/* Mobile Bottom Navigation */}
      <AdminBottomNav activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout} onSwitchToTeacherView={onSwitchToTeacherView} />

      {/* Edit Student Modal */}
      {editingStudent && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <h3 className="font-bold text-xl text-black">แก้ไขข้อมูลนักเรียน</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 font-bold block mb-1">เลขที่</label>
                <input type="number" className={INPUT_STYLE} value={editingStudent.number} onChange={e => setEditingStudent({ ...editingStudent, number: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-gray-600 font-bold block mb-1">รหัสประจำตัว</label>
                <input type="text" className={INPUT_STYLE} value={editingStudent.studentId} onChange={e => setEditingStudent({ ...editingStudent, studentId: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600 font-bold block mb-1">ชื่อ-นามสกุล</label>
                <input type="text" className={INPUT_STYLE} value={editingStudent.name} onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-600 font-bold block mb-1">ชั้น</label>
                  <select className={INPUT_STYLE} value={editingStudent.grade} onChange={e => setEditingStudent({ ...editingStudent, grade: e.target.value })}>{GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}</select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-600 font-bold block mb-1">เพศ</label>
                  <select className={INPUT_STYLE} value={editingStudent.gender} onChange={e => setEditingStudent({ ...editingStudent, gender: e.target.value as Gender })}><option value={Gender.MALE}>ชาย</option><option value={Gender.FEMALE}>หญิง</option></select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingStudent(null)} className={`${BTN_SECONDARY} flex-1 py-2.5`}>ยกเลิก</button>
              <button onClick={handleUpdateStudent} className={`${BTN_PRIMARY} flex-1 py-2.5`}>บันทึกการแก้ไข</button>
            </div>
          </div>
        </div>
        , document.body)}

      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.action} title={confirmModal.title} message={confirmModal.message} isDangerous={confirmModal.isDangerous} isLoading={loadingAction} />
      {toast && <div className={`fixed bottom-24 md:bottom-4 right-4 px-6 py-3 rounded-xl shadow-lg text-white z-[60] font-medium flex items-center gap-2 animate-slide-up ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />} {toast.message}</div>}
    </div>
  );
};