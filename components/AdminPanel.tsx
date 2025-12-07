import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus, Users, Upload, Trash2, Settings, Calendar, Loader2,
  CheckCircle, XCircle, AlertTriangle, LayoutDashboard,
  GraduationCap, Pencil, Edit2, UserMinus, RotateCcw
} from 'lucide-react';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, writeBatch, updateDoc, setDoc
} from 'firebase/firestore/lite';
import * as firebaseApp from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase';
import { Student, TeacherForm, Gender, Role, AppUser, Holiday, StudentStatus } from '../types';
import { mapStudentData } from '../utils';
import { Dashboard } from './Dashboard';
import { ConfirmationModal } from './ConfirmationModal';
import { AdminBottomNav } from './AdminBottomNav';

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

export const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchToTeacherView, onLogout, onStudentChange }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<AppUser[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [selectedDeleteGrade, setSelectedDeleteGrade] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<AppUser | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; action: () => Promise<void>; isDangerous: boolean;
  }>({ isOpen: false, title: '', message: '', action: async () => { }, isDangerous: false });

  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    studentId: '', number: 0, name: '', grade: GRADE_OPTIONS[0], gender: Gender.MALE
  });
  const [newTeacher, setNewTeacher] = useState<TeacherForm>({
    name: '', assignedClass: GRADE_OPTIONS[0], username: '', password: ''
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '' });

  // Track if data has been loaded to prevent redundant fetches
  const [dataLoaded, setDataLoaded] = useState({
    students: false,
    teachers: false,
    holidays: false
  });

  // Only fetch data when tab is accessed AND data hasn't been loaded yet
  useEffect(() => {
    if ((activeTab === 0 || activeTab === 1 || activeTab === 4) && !dataLoaded.students) {
      fetchStudents();
    }
    if (activeTab === 3 && !dataLoaded.teachers) {
      fetchTeachers();
    }
    if (activeTab === 5) {
      if (!dataLoaded.holidays) fetchHolidays();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Remove dataLoaded from dependencies to prevent potential loop

  useEffect(() => {
    if (editingHoliday) {
      setHolidayForm({ date: editingHoliday.date, description: editingHoliday.description });
    } else {
      setHolidayForm({ date: '', description: '' });
    }
  }, [editingHoliday]);

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



  const fetchHolidays = async () => {
    setLoadingData(true);
    try {
      const q = query(collection(db, 'holidays'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Holiday));
      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setHolidays(data);
      setDataLoaded(prev => ({ ...prev, holidays: true }));
    } catch (e) { console.error(e); } finally { setLoadingData(false); }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.studentId) return showToast('ระบุรหัสนักเรียน', 'error');
    setLoadingAction(true);
    try {
      await setDoc(doc(db, 'students', newStudent.studentId), { ...newStudent, status: StudentStatus.ACTIVE });
      showToast('เพิ่มสำเร็จ', 'success');
      setNewStudent({ studentId: '', number: 0, name: '', grade: GRADE_OPTIONS[0], gender: Gender.MALE });
      if (activeTab === 1 || activeTab === 4) fetchStudents();
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
              status: StudentStatus.ACTIVE
            });
            count++;
          }
        }
        await batch.commit();
        showToast(`นำเข้า ${count} รายการ`, 'success');
        setCsvFile(null);
        fetchStudents();
      } catch (error) { console.error(error); showToast("CSV Error", 'error'); } finally { setLoadingAction(false); }
    };
    reader.readAsText(csvFile);
  };

  const clickDeleteStudent = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'ลบนักเรียน', message: `ลบข้อมูล "${name}" ใช่หรือไม่?`, isDangerous: true,
      action: async () => {
        setLoadingAction(true);
        try { await deleteDoc(doc(db, 'students', id)); setStudents(prev => prev.filter(s => s.id !== id)); showToast('ลบเรียบร้อย', 'success'); setConfirmModal(prev => ({ ...prev, isOpen: false })); }
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
          onStudentChange?.(); // Trigger cache refresh
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
          onStudentChange?.(); // Trigger cache refresh
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




  const handleHolidaySubmit = async () => {
    if (!holidayForm.date) return;
    setLoadingAction(true);
    try {
      if (editingHoliday) {
        await updateDoc(doc(db, 'holidays', editingHoliday.id), holidayForm);
        setHolidays(prev => prev.map(h => h.id === editingHoliday.id ? { ...h, ...holidayForm } : h));
      } else {
        const docRef = await addDoc(collection(db, 'holidays'), holidayForm);
        setHolidays(prev => [...prev, { id: docRef.id, ...holidayForm }].sort((a, b) => a.date.localeCompare(b.date)));
      }
      showToast('บันทึกวันหยุดแล้ว', 'success'); setEditingHoliday(null); setHolidayForm({ date: '', description: '' });
    } catch (e) { showToast('Error', 'error'); } finally { setLoadingAction(false); }
  };

  const clickDeleteHoliday = (id: string) => {
    setConfirmModal({
      isOpen: true, title: 'ลบวันหยุด', message: 'ยืนยันการลบ?', isDangerous: true,
      action: async () => { setLoadingAction(true); try { await deleteDoc(doc(db, 'holidays', id)); setHolidays(prev => prev.filter(h => h.id !== id)); showToast('ลบแล้ว', 'success'); setConfirmModal(prev => ({ ...prev, isOpen: false })); } catch (e) { console.error(e); } finally { setLoadingAction(false); } }
    });
  };

  const uniqueGrades = Array.from(new Set(students.map(s => s.grade))).filter(Boolean).sort();

  const tabs = [
    { id: 0, label: 'สถิติ', icon: LayoutDashboard },
    { id: 1, label: 'รายชื่อ', icon: Users },
    { id: 2, label: 'เพิ่มนร.', icon: UserPlus },
    { id: 3, label: 'ครู', icon: UserPlus },
    { id: 4, label: 'ลบ/แก้', icon: Trash2 },
    { id: 5, label: 'ระบบ', icon: Settings },
  ];

  return (
    <div className="rounded-3xl shadow-lg border border-white/50 flex flex-col md:flex-row overflow-hidden min-h-[80vh] pb-20 md:pb-0" style={{ background: 'linear-gradient(to left, #F7D6D0, #FFC5D0)' }}>

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
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-white/30">
        {activeTab === 0 && <div className="-m-2 md:m-0"><Dashboard embedded students={students} holidays={holidays} /></div>}

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

        {activeTab === 5 && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">

            {/* Quick Actions */}
            <button
              onClick={onSwitchToTeacherView}
              className="flex items-center justify-center gap-3 p-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl border border-emerald-200 transition-all active:scale-95 w-full"
            >
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm">สลับไปมุมมองครู</span>
            </button>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="font-bold mb-4 text-black flex items-center gap-2"><Calendar className="w-5 h-5 text-brand-600" /> จัดการวันหยุด</h3>
              <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="relative md:w-1/3">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    className={`${INPUT_STYLE} pl-10 cursor-pointer`}
                    value={holidayForm.date}
                    onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                  />
                </div>
                <input type="text" className={`${INPUT_STYLE} flex-1`} placeholder="ชื่อวันหยุด" value={holidayForm.description} onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })} />
                <button onClick={handleHolidaySubmit} className={BTN_SUCCESS}>{editingHoliday ? 'แก้ไข' : 'เพิ่ม'}</button>
              </div>
              <div className="space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="flex justify-between items-center p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold text-sm flex-col leading-none border border-amber-100 shadow-sm">
                        <span className="text-lg">{new Date(h.date).getDate()}</span>
                        <span className="text-[10px] uppercase">{new Date(h.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      </div>
                      <span className="font-bold text-gray-800">{h.description}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingHoliday(h)} className="text-brand-600 hover:bg-brand-50 p-2 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => clickDeleteHoliday(h.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                {holidays.length === 0 && <div className="text-center text-gray-400 py-4">ไม่มีรายการวันหยุด</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <AdminBottomNav activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout} />

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