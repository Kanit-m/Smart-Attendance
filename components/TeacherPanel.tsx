import React, { useState, useEffect, useMemo } from 'react';
import { 
  Save, Loader2, LayoutDashboard, 
  ArrowLeft, Calendar as CalendarIcon, 
  UserCheck, UserX, Clock, Thermometer, Calendar,
  CheckCircle2, CheckSquare, Square, X, Menu, 
  ClipboardList, ChevronLeft, ChevronRight, Users, PieChart, Contact,
  FileText, Filter, Search, Download
} from 'lucide-react';
import { 
  collection, getDocs, query, where, writeBatch, doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Student, AttendanceStatus, Holiday, Role, Gender, AttendanceRecord } from '../types';
import { mapStudentData } from '../utils';

interface TeacherPanelProps {
  currentUser: { name: string; role: string; assignedClass?: string };
  onBackToAdmin?: () => void;
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

interface StudentReportStats {
    student: Student;
    present: number;
    late: number;
    sick: number;
    personal: number;
    absent: number;
    totalDays: number;
    percent: string;
}

export const TeacherPanel: React.FC<TeacherPanelProps> = ({ currentUser, onBackToAdmin }) => {
  // Navigation & View State
  const [currentView, setCurrentView] = useState<'check' | 'dashboard' | 'report'>('check');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop default open
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceState, setAttendanceState] = useState<Record<string, AttendanceStatus>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(currentUser.assignedClass || GRADE_OPTIONS[0]);
  
  // Report State
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<StudentReportStats[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  
  // Multi-Selection State
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // --- Data Loading ---
  useEffect(() => { 
      getDocs(query(collection(db, 'holidays'))).then(snap => {
          setHolidays(snap.docs.map(d => d.data() as Holiday));
      });
  }, []);

  useEffect(() => { 
      if (currentUser.role === Role.TEACHER && currentUser.assignedClass) {
          setSelectedClass(prev => prev !== currentUser.assignedClass ? currentUser.assignedClass! : prev);
      } 
  }, [currentUser.role, currentUser.assignedClass]);

  useEffect(() => { 
      if (!selectedClass) return;
      setLoading(true);
      const q = query(collection(db, 'students'), where('grade', '==', selectedClass));
      getDocs(q).then(snap => {
          const data = snap.docs.map(d => mapStudentData(d.id, d.data()));
          data.sort((a, b) => (a.number || 0) - (b.number || 0));
          setStudents(data);
          setLoading(false);
          // Clear selection when class changes
          setSelectedStudentIds(new Set());
      });
  }, [selectedClass]);

  useEffect(() => { 
      if (students.length === 0 || currentView !== 'check') return;
      const load = async () => {
        const q = query(collection(db, 'attendance'), where('date', '==', selectedDate));
        const snap = await getDocs(q);
        const existing = new Map(snap.docs.map(d => [d.data().studentId, d.data().status]));
        const isHoliday = holidays.find(h => h.date === selectedDate);
        const newState: Record<string, AttendanceStatus> = {};
        students.forEach(s => {
           // Default to null/undefined if not checked yet, or Holiday if it's a holiday
           newState[s.id] = (existing.get(s.id) as AttendanceStatus) || (isHoliday ? AttendanceStatus.HOLIDAY : AttendanceStatus.PRESENT);
        });
        setAttendanceState(newState);
      };
      load();
  }, [selectedDate, students, holidays, currentView]);

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

  const confirmSave = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
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
          timestamp: Date.now()
        });
      });
      await batch.commit();
      
      setShowConfirmModal(false);
      setTimeout(() => setSaving(false), 500); 
    } catch (err) { 
        console.error(err); 
        setSaving(false); 
    }
  };

  // --- Report Logic ---
  const setQuickRange = (type: 'today' | 'week' | 'month') => {
      const end = new Date();
      let start = new Date();

      if (type === 'today') {
          // Start and End are today
      } else if (type === 'week') {
          start.setDate(end.getDate() - 6); // Last 7 days
      } else if (type === 'month') {
          start = new Date(end.getFullYear(), end.getMonth(), 1); // First day of current month
      }

      setReportStartDate(start.toISOString().split('T')[0]);
      setReportEndDate(end.toISOString().split('T')[0]);
  };

  const handleGenerateReport = async () => {
      setGeneratingReport(true);
      setReportGenerated(false);
      try {
          // Query attendance records within range for ALL students
          // Note: We filter by grade manually to avoid requiring a composite index in Firestore (Grade + Date Range)
          // This prevents "The query requires an index" errors without manual console setup.
          const q = query(
              collection(db, 'attendance'), 
              where('date', '>=', reportStartDate),
              where('date', '<=', reportEndDate)
          );
          
          const snapshot = await getDocs(q);
          
          // Filter manually by grade on the client side
          const records = snapshot.docs
            .map(d => d.data() as AttendanceRecord)
            .filter(r => r.grade === selectedClass);

          // Calculate stats per student
          const stats: StudentReportStats[] = students.map(student => {
              const studentRecords = records.filter(r => r.studentId === student.id);
              
              const present = studentRecords.filter(r => r.status === AttendanceStatus.PRESENT).length;
              const late = studentRecords.filter(r => r.status === AttendanceStatus.LATE).length;
              const sick = studentRecords.filter(r => r.status === AttendanceStatus.SICK).length;
              const personal = studentRecords.filter(r => r.status === AttendanceStatus.PERSONAL).length;
              const absent = studentRecords.filter(r => r.status === AttendanceStatus.ABSENT).length;
              
              const totalRecorded = studentRecords.length;
              // Effective present usually includes Late
              const effectivePresent = present + late;
              const percent = totalRecorded > 0 
                  ? ((effectivePresent / totalRecorded) * 100).toFixed(0) 
                  : '0';

              return {
                  student,
                  present, late, sick, personal, absent,
                  totalDays: totalRecorded,
                  percent
              };
          });

          setReportData(stats);
          setReportGenerated(true);
      } catch (error) {
          console.error("Error generating report", error);
      } finally {
          setGeneratingReport(false);
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
      STATUS_CONFIG.forEach(c => breakdown[c.status] = 0);
      students.forEach(s => {
          const status = attendanceState[s.id] || AttendanceStatus.PRESENT;
          if (breakdown[status] !== undefined) breakdown[status]++;
          else breakdown[status] = 1;
      });

      return { 
          total, totalMale, totalFemale,
          presentCount, presentPercent,
          absentCount, absentMale, absentFemale, absentList,
          breakdown 
      };
  }, [students, attendanceState]);


  // --- Render Sub-Components ---

  const SidebarContent = () => (
     <div className="flex flex-col h-full">
        <div className={`flex items-center h-16 px-4 border-b border-gray-100 ${!isSidebarOpen && 'justify-center px-0'}`}>
            {isSidebarOpen ? (
               <div className="flex items-center gap-3 text-brand-700 overflow-hidden whitespace-nowrap w-full">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                    <Contact className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col w-full overflow-hidden pr-2">
                    <span className="font-bold text-sm leading-tight">เมนูจัดการ</span>
                    <span className="text-[10px] text-gray-500">{selectedClass}</span>
                  </div>
               </div>
            ) : (
               <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 shrink-0">
                  <Contact className="w-5 h-5" />
               </div>
            )}
        </div>
        
        <div className="flex-1 py-4 space-y-1 px-2">
           <button 
             onClick={() => { setCurrentView('check'); setIsMobileMenuOpen(false); }}
             className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'check' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'} ${!isSidebarOpen && 'justify-center'}`}
             title="เช็คชื่อ"
           >
              <ClipboardList className={`w-5 h-5 ${currentView === 'check' ? 'text-brand-600' : 'text-gray-400'}`} />
              {isSidebarOpen && <span>เช็คชื่อนักเรียน</span>}
           </button>
           
           <button 
             onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }}
             className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'dashboard' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'} ${!isSidebarOpen && 'justify-center'}`}
             title="แดชบอร์ด"
           >
              <LayoutDashboard className={`w-5 h-5 ${currentView === 'dashboard' ? 'text-brand-600' : 'text-gray-400'}`} />
              {isSidebarOpen && <span>สรุปผลประจำวัน</span>}
           </button>

           <button 
             onClick={() => { setCurrentView('report'); setIsMobileMenuOpen(false); }}
             className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${currentView === 'report' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'} ${!isSidebarOpen && 'justify-center'}`}
             title="รายงาน"
           >
              <FileText className={`w-5 h-5 ${currentView === 'report' ? 'text-brand-600' : 'text-gray-400'}`} />
              {isSidebarOpen && <span>รายงาน</span>}
           </button>
        </div>

        {/* Desktop Collapse Button */}
        <div className="hidden md:flex p-4 border-t border-gray-100 justify-end">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
               {isSidebarOpen ? <ChevronLeft className="w-5 h-5"/> : <ChevronRight className="w-5 h-5"/>}
            </button>
        </div>
     </div>
  );

  const RenderReport = () => (
      <div className="p-4 md:p-6 space-y-6 overflow-y-auto h-full animate-fade-in pb-20">
          <div className="flex items-center gap-2 mb-2">
              <FileText className="w-6 h-6 text-brand-600" />
              <h2 className="text-xl font-bold text-gray-800">รายงานการมาเรียน ({selectedClass})</h2>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
              
              {/* Quick Select Buttons */}
              <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">เลือกช่วงเวลาแบบด่วน</label>
                  <div className="flex flex-wrap gap-3">
                      <button onClick={() => setQuickRange('today')} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-colors">
                          วันนี้
                      </button>
                      <button onClick={() => setQuickRange('week')} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-colors">
                          7 วันล่าสุด
                      </button>
                      <button onClick={() => setQuickRange('month')} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-colors">
                          เดือนนี้
                      </button>
                  </div>
              </div>

              <div className="border-t border-gray-100 my-4"></div>

              {/* Date Range Inputs */}
              <div className="flex flex-col md:flex-row gap-6 items-end">
                  <div className="flex-1 w-full">
                      <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เริ่มต้น</label>
                      <div className="relative">
                          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"/>
                          <input 
                              type="date" 
                              value={reportStartDate}
                              onChange={(e) => setReportStartDate(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all cursor-pointer"
                          />
                      </div>
                  </div>
                  <div className="flex-1 w-full">
                      <label className="block text-sm font-bold text-gray-700 mb-2">วันที่สิ้นสุด</label>
                      <div className="relative">
                          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"/>
                          <input 
                              type="date" 
                              value={reportEndDate}
                              onChange={(e) => setReportEndDate(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all cursor-pointer"
                          />
                      </div>
                  </div>
                  <div className="w-full md:w-auto">
                      <button 
                        onClick={handleGenerateReport}
                        disabled={generatingReport}
                        className="w-full md:w-auto px-6 py-2.5 bg-brand-600 text-white rounded-xl font-bold shadow-md hover:bg-brand-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                      >
                          {generatingReport ? <Loader2 className="w-5 h-5 animate-spin"/> : <Search className="w-5 h-5"/>}
                          ออกรายงาน
                      </button>
                  </div>
              </div>
          </div>

          {/* Report Results */}
          {reportGenerated && (
              <>
                  {/* Desktop View: Table */}
                  <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-slide-up">
                      <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-2">
                          <h3 className="font-bold text-gray-800">ผลลัพธ์: {new Date(reportStartDate).toLocaleDateString('th-TH', {dateStyle:'medium'})} - {new Date(reportEndDate).toLocaleDateString('th-TH', {dateStyle:'medium'})}</h3>
                          <span className="text-xs bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">รวม {students.length} คน</span>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-600 uppercase bg-gray-100/50 border-b border-gray-200">
                                  <tr>
                                      <th className="px-4 py-3 w-16 text-center">เลขที่</th>
                                      <th className="px-4 py-3">ชื่อ-สกุล</th>
                                      <th className="px-4 py-3 text-center">วันเช็ค</th>
                                      <th className="px-4 py-3 text-center text-emerald-600 bg-emerald-50/30">มา</th>
                                      <th className="px-4 py-3 text-center text-yellow-600">สาย</th>
                                      <th className="px-4 py-3 text-center text-blue-600">ลา</th>
                                      <th className="px-4 py-3 text-center text-rose-600 bg-rose-50/30">ขาด</th>
                                      <th className="px-4 py-3 text-center">ร้อยละ</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {reportData.length > 0 ? (
                                      reportData.map((item) => (
                                          <tr key={item.student.id} className="hover:bg-gray-50 transition-colors">
                                              <td className="px-4 py-3 text-center font-mono text-gray-500">{item.student.number}</td>
                                              <td className="px-4 py-3 font-bold text-gray-800">{item.student.name}</td>
                                              <td className="px-4 py-3 text-center font-medium text-gray-600">{item.totalDays}</td>
                                              <td className="px-4 py-3 text-center text-emerald-600 font-bold bg-emerald-50/20">{item.present}</td>
                                              <td className="px-4 py-3 text-center text-yellow-600">{item.late}</td>
                                              <td className="px-4 py-3 text-center text-blue-600">{item.sick + item.personal}</td>
                                              <td className="px-4 py-3 text-center text-rose-600 font-bold bg-rose-50/20">{item.absent}</td>
                                              <td className="px-4 py-3 text-center">
                                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${parseInt(item.percent) < 80 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                      {item.percent}%
                                                  </span>
                                              </td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr>
                                          <td colSpan={8} className="py-8 text-center text-gray-400">
                                              ไม่พบข้อมูลในช่วงเวลาที่เลือก
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  {/* Mobile View: Cards */}
                  <div className="md:hidden space-y-4 animate-slide-up">
                      <div className="flex justify-between items-center px-2">
                         <h3 className="font-bold text-gray-800">ผลลัพธ์การค้นหา</h3>
                         <span className="text-xs text-gray-500">รวม {students.length} คน</span>
                      </div>
                      
                      {reportData.length > 0 ? (
                          reportData.map((item) => (
                              <div key={item.student.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 relative overflow-hidden">
                                  {/* Decorative Background */}
                                  <div className={`absolute right-0 top-0 w-20 h-20 rounded-bl-full opacity-10 -mr-4 -mt-4 ${parseInt(item.percent) < 80 ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                                  
                                  <div className="relative z-10">
                                      <div className="flex justify-between items-start mb-4">
                                          <div className="flex items-center gap-3">
                                              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-600 font-mono">
                                                  {item.student.number}
                                              </div>
                                              <div>
                                                  <h4 className="font-bold text-gray-900 leading-tight">{item.student.name}</h4>
                                                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                      <span>{item.student.gender}</span>
                                                      <span>•</span>
                                                      <span>เช็คชื่อ {item.totalDays} วัน</span>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className={`flex flex-col items-end ${parseInt(item.percent) < 80 ? 'text-red-600' : 'text-emerald-600'}`}>
                                              <span className="text-3xl font-bold leading-none">{item.percent}<span className="text-lg">%</span></span>
                                              <span className="text-[10px] font-bold opacity-80">การมาเรียน</span>
                                          </div>
                                      </div>

                                      {/* Stats Grid */}
                                      <div className="grid grid-cols-4 gap-2">
                                          <div className="bg-emerald-50 rounded-xl p-2 text-center border border-emerald-100">
                                              <div className="text-[10px] text-emerald-600 font-bold mb-0.5">มา</div>
                                              <div className="text-lg font-bold text-emerald-700 leading-none">{item.present}</div>
                                          </div>
                                          <div className="bg-yellow-50 rounded-xl p-2 text-center border border-yellow-100">
                                              <div className="text-[10px] text-yellow-600 font-bold mb-0.5">สาย</div>
                                              <div className="text-lg font-bold text-yellow-700 leading-none">{item.late}</div>
                                          </div>
                                           <div className="bg-blue-50 rounded-xl p-2 text-center border border-blue-100">
                                              <div className="text-[10px] text-blue-600 font-bold mb-0.5">ลา</div>
                                              <div className="text-lg font-bold text-blue-700 leading-none">{item.sick + item.personal}</div>
                                          </div>
                                          <div className="bg-rose-50 rounded-xl p-2 text-center border border-rose-100">
                                              <div className="text-[10px] text-rose-600 font-bold mb-0.5">ขาด</div>
                                              <div className="text-lg font-bold text-rose-700 leading-none">{item.absent}</div>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          ))
                      ) : (
                          <div className="bg-white p-8 rounded-2xl text-center text-gray-400 border border-gray-200 shadow-sm">
                             <p>ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
                          </div>
                      )}
                  </div>
              </>
          )}
      </div>
  );

  const RenderDashboard = () => (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto h-full animate-fade-in pb-20">
        <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-6 h-6 text-brand-600" />
            <h2 className="text-xl font-bold text-gray-800">สรุปผลการมาเรียน ({selectedClass})</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Total */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute right-0 top-0 w-20 h-20 bg-blue-50 rounded-bl-full -mr-4 -mt-4"></div>
                <div className="relative z-10">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-1">นักเรียนทั้งหมด</p>
                    <h3 className="text-3xl font-bold text-gray-900">{stats.total} <span className="text-sm text-gray-400 font-normal">คน</span></h3>
                    <div className="flex gap-2 mt-3">
                        <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md font-bold border border-blue-100">
                           ชาย {stats.totalMale}
                        </span>
                        <span className="text-xs px-2 py-1 bg-pink-50 text-pink-600 rounded-md font-bold border border-pink-100">
                           หญิง {stats.totalFemale}
                        </span>
                    </div>
                </div>
            </div>

            {/* Card 2: Present */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute right-0 top-0 w-20 h-20 bg-emerald-50 rounded-bl-full -mr-4 -mt-4"></div>
                <div className="relative z-10">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-1">มาเรียนวันนี้</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-emerald-600">{stats.presentCount}</h3>
                        <span className="text-lg font-bold text-emerald-500">({stats.presentPercent}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                        <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.presentPercent}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Card 3: Absent */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute right-0 top-0 w-20 h-20 bg-rose-50 rounded-bl-full -mr-4 -mt-4"></div>
                <div className="relative z-10">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-1">ขาด / ลา / ป่วย</p>
                    <h3 className="text-3xl font-bold text-rose-600">{stats.absentCount} <span className="text-sm text-gray-400 font-normal">คน</span></h3>
                    <div className="flex gap-2 mt-3">
                        <span className="text-xs px-2 py-1 bg-rose-50 text-rose-600 rounded-md font-bold border border-rose-100">
                           ช {stats.absentMale}
                        </span>
                        <span className="text-xs px-2 py-1 bg-rose-50 text-rose-600 rounded-md font-bold border border-rose-100">
                           ญ {stats.absentFemale}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        {/* Absent List Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <UserX className="w-4 h-4 text-rose-500" />
                    รายชื่อผู้ไม่มาเรียน
                </h3>
                {stats.absentCount > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded text-xs font-bold">{stats.absentCount} คน</span>}
            </div>
            
            <div className="overflow-x-auto">
                {stats.absentList.length > 0 ? (
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 w-16 text-center">เลขที่</th>
                                <th className="px-4 py-3">ชื่อ - สกุล</th>
                                <th className="px-4 py-3 text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {stats.absentList.sort((a,b) => a.number - b.number).map((student) => {
                                const status = attendanceState[student.id];
                                const config = STATUS_CONFIG.find(c => c.status === status);
                                return (
                                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-center font-mono text-gray-500">{student.number}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-gray-900">{student.name}</div>
                                            <div className="text-xs text-gray-400">{student.gender}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${config?.bg} ${config?.text}`}>
                                                {config?.icon && <config.icon className="w-3 h-3" />}
                                                {status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                            <UserCheck className="w-6 h-6" />
                        </div>
                        <span className="text-sm">เยี่ยมมาก! วันนี้มาเรียนครบทุกคน</span>
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  const RenderCheckList = () => (
    <div className="flex flex-1 overflow-hidden relative h-full">
        {/* LEFT PANEL: STUDENT LIST */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 p-4 pb-32 md:pb-4">
            {/* Tools / Select All */}
            <div className="flex justify-between items-center mb-4 px-2">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={selectAll}
                        className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-brand-600 transition-colors"
                    >
                        {selectedStudentIds.size === students.length && students.length > 0 ? (
                            <CheckSquare className="w-5 h-5 text-brand-600" />
                        ) : (
                            <Square className="w-5 h-5" />
                        )}
                        เลือกทั้งหมด
                    </button>
                    {selectedStudentIds.size > 0 && (
                        <span className="text-sm font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md animate-fade-in">
                            เลือก {selectedStudentIds.size} คน
                        </span>
                    )}
                </div>
                <div className="text-xs text-gray-400 hidden sm:block">แตะรายชื่อเพื่อเลือก</div>
            </div>

            {/* Student List */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-500"/></div>
            ) : (
                <div className="space-y-2">
                    {students.map((student) => {
                        const isSelected = selectedStudentIds.has(student.id);
                        const status = attendanceState[student.id];
                        const statusConfig = STATUS_CONFIG.find(c => c.status === status);

                        return (
                            <div 
                                key={student.id}
                                onClick={() => toggleSelection(student.id)}
                                className={`
                                    relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none
                                    ${isSelected 
                                        ? 'bg-brand-50 border-brand-500 shadow-md scale-[1.01] z-10' 
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'bg-gray-100 border-gray-300 text-transparent'}`}>
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 font-mono">
                                            {student.number}
                                        </div>
                                        <div>
                                            <div className={`font-bold ${isSelected ? 'text-brand-800' : 'text-gray-800'}`}>{student.name}</div>
                                            <div className="text-[10px] text-gray-400">{student.gender}</div>
                                        </div>
                                    </div>
                                </div>
                                {statusConfig && (
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${statusConfig.bg} ${statusConfig.text} text-xs font-bold border border-transparent`}>
                                        <statusConfig.icon className="w-3 h-3" />
                                        <span>{statusConfig.label}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* RIGHT PANEL / BOTTOM ACTION BAR */}
        <div className={`
            fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)] z-30 transition-transform duration-300
            md:relative md:w-80 md:border-t-0 md:border-l md:shadow-none md:bg-white md:flex md:flex-col md:justify-between
            ${selectedStudentIds.size === 0 ? 'translate-y-full md:translate-y-0' : 'translate-y-0'}
        `}>
            <div className="hidden md:block mb-6">
                <h3 className="font-bold text-gray-800 text-lg mb-2">จัดการสถานะ</h3>
                <p className="text-sm text-gray-500 mb-4">เลือกรายชื่อแล้วกดเปลี่ยนสถานะ</p>
                {selectedStudentIds.size > 0 ? (
                    <div className="p-3 bg-brand-50 rounded-xl border border-brand-100 flex justify-between items-center animate-fade-in">
                        <span className="text-brand-700 font-bold">เลือกอยู่ {selectedStudentIds.size} คน</span>
                        <button onClick={() => setSelectedStudentIds(new Set())} className="text-xs text-brand-500 hover:underline">ล้างค่า</button>
                    </div>
                ) : (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-gray-400 text-sm text-center">ยังไม่ได้เลือกรายการ</div>
                )}
            </div>

            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-5 gap-2 md:grid-cols-2">
                    {STATUS_CONFIG.map((item) => (
                        <button
                            key={item.status}
                            onClick={() => applyStatusToSelection(item.status)}
                            disabled={selectedStudentIds.size === 0}
                            className={`
                                flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all
                                ${item.color} text-white shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                            `}
                        >
                            <item.icon className="w-5 h-5 md:w-5 md:h-5" />
                            <span className="text-[10px] md:text-sm font-bold">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="hidden md:block mt-auto pt-6 border-t border-gray-100">
                <button onClick={handleSaveClick} disabled={saving} className="w-full bg-gray-900 hover:bg-black text-white py-4 rounded-xl font-bold text-lg shadow-lg flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-70">
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
            </div>
        </div>

        {/* MOBILE FLOATING SAVE BUTTON */}
        <div className={`
            fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t z-20 flex justify-between items-center md:hidden
            transition-transform duration-300
            ${selectedStudentIds.size > 0 ? 'translate-y-full' : 'translate-y-0'}
        `}>
            <div className="flex flex-col">
                <span className="text-xs text-gray-500 font-bold">มา {stats.presentCount} / ขาด {stats.absentCount}</span>
                <span className="text-sm font-bold text-gray-800">ทั้งหมด {stats.total} คน</span>
            </div>
            <button onClick={handleSaveClick} disabled={saving} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 text-sm disabled:opacity-70">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? '...' : 'บันทึก'}
            </button>
        </div>
    </div>
  );

  const getTitle = () => {
      if (currentView === 'report') return 'รายงาน';
      if (currentView === 'dashboard') return 'แดชบอร์ด';
      return 'เช็คชื่อประจำวัน';
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/50 flex h-[calc(100vh-120px)] overflow-hidden relative">
      
      {/* --- SIDEBAR (DESKTOP & MOBILE) --- */}
      
      {/* Mobile Overlay Sidebar */}
      <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)}></div>
      <div className={`fixed inset-y-0 left-0 w-64 bg-white z-50 transform transition-transform md:hidden shadow-2xl ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarContent />
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
          <SidebarContent />
      </div>


      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative">
          
          {/* HEADER */}
          <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 z-20">
            <div className="flex items-center gap-3 w-full md:w-auto">
                {/* Hamburger Button */}
                <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                    <Menu className="w-6 h-6" />
                </button>

                {onBackToAdmin && (
                    <button onClick={onBackToAdmin} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="กลับหน้า Admin">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                )}
                
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-800 leading-tight">
                        {getTitle()}
                    </h2>
                    {currentUser.role === Role.ADMIN ? (
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
                        <p className="text-xs md:text-sm text-gray-500">{selectedClass} • {students.length} คน</p>
                    )}
                </div>
            </div>

            {currentView === 'check' && (
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
          </div>
          
          {/* VIEW CONTENT */}
          {currentView === 'check' && <RenderCheckList />}
          {currentView === 'dashboard' && <RenderDashboard />}
          {currentView === 'report' && <RenderReport />}

      </div>

      {/* --- CONFIRMATION MODAL --- */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-brand-600"/> ยืนยันการบันทึก
                    </h3>
                    <button onClick={() => setShowConfirmModal(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400"/>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <div className="text-center mb-6">
                        <p className="text-gray-500 text-sm font-medium">สรุปข้อมูลการเช็คชื่อ</p>
                        <h4 className="text-xl font-bold text-brand-700">{selectedClass}</h4>
                        <p className="text-xs text-gray-400 mt-1">วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric'})}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        {STATUS_CONFIG.map((config) => {
                            const count = stats.breakdown[config.status] || 0;
                            if (count === 0) return null; 
                            
                            return (
                                <div key={config.status} className={`flex items-center justify-between p-3 rounded-xl border ${config.bg} border-transparent`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg bg-white/60 ${config.text}`}>
                                            <config.icon className="w-4 h-4"/>
                                        </div>
                                        <span className={`text-sm font-bold ${config.text}`}>{config.label}</span>
                                    </div>
                                    <span className={`text-xl font-bold ${config.text}`}>{count}</span>
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
                        className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-white transition-colors"
                    >
                        แก้ไขข้อมูล
                    </button>
                    <button 
                        onClick={confirmSave}
                        disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-bold shadow-lg hover:bg-brand-700 transition-all flex justify-center items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
                        ยืนยันบันทึก
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};