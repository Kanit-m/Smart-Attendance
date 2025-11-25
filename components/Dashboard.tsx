
import React, { useEffect, useState } from 'react';
import { 
  Users, UserCheck, UserX, Sun, 
  ChevronRight, ChevronLeft, LayoutGrid, 
  Baby, BookOpen, Activity, CalendarDays, Sparkles, Download,
  ClipboardCheck, AlertTriangle, Clock
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AttendanceStatus, Gender, Holiday } from '../types';
import { mapStudentData } from '../utils';

interface DashboardProps {
  embedded?: boolean;
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

export const Dashboard: React.FC<DashboardProps> = ({ embedded = false }) => {
  // Initialize with Today's date
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayHoliday, setTodayHoliday] = useState<Holiday | null>(null);
  
  // Carousel State for Kindergarten (K) and Primary (P)
  const [kIndex, setKIndex] = useState(0);
  const [pIndex, setPIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  // Absent Details State
  const [showAbsentDetails, setShowAbsentDetails] = useState(false);

  // Touch State for Swipe
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  useEffect(() => {
    fetchData(currentDate);
  }, [currentDate]);

  const fetchData = async (targetDate: string) => {
    setLoading(true);
    try {
      const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
      const holidays = holidaysSnapshot.docs.map(doc => doc.data() as Holiday);
      const holiday = holidays.find(h => h.date === targetDate);
      setTodayHoliday(holiday || null);

      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const studentsData = studentsSnapshot.docs.map(doc => mapStudentData(doc.id, doc.data()));
      setStudents(studentsData);

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

  const getStudentStatsByGrade = (): GradeStats[] => {
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
  };

  const allStats = getStudentStatsByGrade();
  const kStats = allStats.filter(s => s.grade.includes('อนุบาล'));
  const pStats = allStats.filter(s => !s.grade.includes('อนุบาล'));
  
  // Missing Data Logic
  const totalClasses = allStats.length;
  const submittedClasses = allStats.filter(s => s.isSubmitted).length;
  const missingClasses = allStats.filter(s => !s.isSubmitted);
  const isAllSubmitted = totalClasses > 0 && submittedClasses === totalClasses;
  
  // Carousel Auto-Scroll Logic
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      if (kStats.length > 0) setKIndex(prev => (prev + 1) % kStats.length);
      if (pStats.length > 0) setPIndex(prev => (prev + 1) % pStats.length);
    }, 5000); 

    return () => clearInterval(interval);
  }, [kStats.length, pStats.length, isPaused]);

  const totalStudents = students.length;
  const totalMale = students.filter(s => s.gender === Gender.MALE).length;
  const totalFemale = students.filter(s => s.gender === Gender.FEMALE).length;

  const absentRecords = attendances.filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status));
  const totalAbsent = absentRecords.length;
  
  const totalPresent = attendances.filter(a => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
  
  const percentPresent = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : '0.0';

  // Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const handleTouchEnd = (type: 'K' | 'P', length: number, setIndex: React.Dispatch<React.SetStateAction<number>>) => {
      if (!touchStart || !touchEnd) return;
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > 50;
      const isRightSwipe = distance < -50;

      if (isLeftSwipe) {
          setIndex(prev => (prev + 1) % length);
      } else if (isRightSwipe) {
          setIndex(prev => (prev - 1 + length) % length);
      }
      // Reset
      setTouchStart(0);
      setTouchEnd(0);
  };

  // Export CSV Function
  const handleExportCSV = () => {
    if (loading || allStats.length === 0) return;

    // Define CSV Headers based on report structure with 'Total' columns set to 0
    const headers = [
      'ชั้น',
      'เต็ม ชาย',
      'เต็ม หญิง',
      'เต็ม รวม',
      'มา ชาย',
      'มา หญิง',
      'มา รวม',
      'ขาด ชาย',
      'ขาด หญิง',
      'ขาด รวม'
    ];

    // Map data to rows
    const rows = allStats.map((stat, index) => {
        return [
            `"${stat.grade}"`,
            stat.male,
            stat.female,
            0, // Request: Show 0
            stat.presentMale,
            stat.presentFemale,
            0, // Request: Show 0
            stat.absentMale,
            stat.absentFemale,
            0  // Request: Show 0
        ].join(',');
    });

    // Calculate Summary Row
    const grandTotal = allStats.reduce((acc, curr) => ({
        male: acc.male + curr.male,
        female: acc.female + curr.female,
        presentMale: acc.presentMale + curr.presentMale,
        presentFemale: acc.presentFemale + curr.presentFemale,
        absentMale: acc.absentMale + curr.absentMale,
        absentFemale: acc.absentFemale + curr.absentFemale
    }), { 
        male: 0, female: 0, 
        presentMale: 0, presentFemale: 0, 
        absentMale: 0, absentFemale: 0 
    });

    const summaryRow = [
        '"รวมทั้งสิ้น"',
        grandTotal.male,
        grandTotal.female,
        0, // Request: Show 0
        grandTotal.presentMale,
        grandTotal.presentFemale,
        0, // Request: Show 0
        grandTotal.absentMale,
        grandTotal.absentFemale,
        0  // Request: Show 0
    ].join(',');

    // Combine all parts
    const csvContent = [headers.join(','), ...rows, summaryRow].join('\n');

    // Create Blob with BOM for Excel UTF-8 support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance_report_${currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
  };

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
        className={`rounded-3xl p-1 shadow-lg overflow-hidden relative group bg-white border border-gray-200 h-full flex flex-col min-h-[320px]`}
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
        
        <div className="relative flex-1">
             {stats.length > 0 ? (
                 <div className="absolute inset-0">
                     {stats.map((stat, idx) => (
                        <div 
                            key={idx} 
                            className={`absolute inset-0 p-4 flex flex-col transition-all duration-500 ease-in-out transform ${
                                idx === index ? 'opacity-100 translate-x-0' : idx < index ? 'opacity-0 -translate-x-full' : 'opacity-0 translate-x-full'
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
                                        <UserCheck className="w-3 h-3 text-emerald-500"/>
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
                                        <UserX className="w-3 h-3 text-rose-500"/>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-rose-600">{stat.absent}</span>
                                        <div className="text-[10px] font-medium text-rose-400">
                                           (ช {stat.absentMale} / ญ {stat.absentFemale})
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Section: Absent List (Filling the space) */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 rounded-xl border border-gray-100 p-2">
                                <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-amber-500"/> รายชื่อคนขาด/ลา ({stat.absentList.length})
                                </div>
                                <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-1.5">
                                    {stat.absentList.length > 0 ? (
                                        stat.absentList.map((rec, i) => (
                                            <div key={i} className="flex justify-between items-center bg-white p-1.5 rounded shadow-sm border border-gray-100 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${rec.gender === Gender.MALE ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                                                        {rec.gender === Gender.MALE ? 'ช' : 'ญ'}
                                                    </div>
                                                    <span className="font-medium text-gray-700 truncate max-w-[80px] sm:max-w-[100px]">{rec.studentName}</span>
                                                </div>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                                    rec.status === AttendanceStatus.ABSENT ? 'bg-red-100 text-red-600' :
                                                    rec.status === AttendanceStatus.SICK ? 'bg-blue-100 text-blue-600' :
                                                    'bg-purple-100 text-purple-600'
                                                }`}>
                                                    {rec.status}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-emerald-600 text-xs gap-2 opacity-90">
                                            <div className="bg-emerald-100 p-2 rounded-full">
                                                <UserCheck className="w-5 h-5 text-emerald-600"/>
                                            </div>
                                            <span className="font-bold">มาครบทุกคน</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
             ) : (
                <div className="flex items-center justify-center h-full text-gray-400">ไม่มีข้อมูล</div>
             )}

             {/* Waiting for Data Overlay */}
             {stats.length > 0 && !stats[index].isSubmitted && (
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
             {/* Export Button */}
             <button 
                onClick={handleExportCSV}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all font-bold text-sm active:scale-95 border border-transparent"
             >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
             </button>

             {/* DATE PICKER COMPONENT */}
             <div className="relative group w-full sm:w-auto">
                 <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-xl shadow-sm border border-gray-200 hover:border-brand-400 hover:shadow-md transition-all cursor-pointer">
                     <CalendarDays className="w-5 h-5 text-brand-600 group-hover:text-brand-700" />
                     <div className="flex flex-col items-start">
                         <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">วันที่ข้อมูล</span>
                         <span className="text-sm font-bold text-black group-hover:text-brand-800 leading-none">
                            {new Date(currentDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                         </span>
                     </div>
                     {/* Invisible Date Input covering the area */}
                     <input 
                        type="date" 
                        value={currentDate}
                        onChange={(e) => setCurrentDate(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                     />
                 </div>
             </div>
         </div>
      </div>

      {/* Holiday Alert */}
      {todayHoliday && (
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 text-amber-800 px-6 py-4 rounded-2xl shadow-sm flex items-center gap-4 animate-slide-up">
              <div className="bg-white/50 p-3 rounded-full shadow-sm backdrop-blur-sm">
                 <Sun className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                  <h3 className="font-bold text-lg leading-tight">{todayHoliday.description}</h3>
                  <p className="text-xs text-amber-700 font-medium">วันหยุดของโรงเรียน</p>
              </div>
          </div>
      )}

      {/* Missing Data Alert Box */}
      {missingClasses.length > 0 && (
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {/* Card 0: Submission Status (NEW) */}
         <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all">
             <div className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110 ${isAllSubmitted ? 'bg-emerald-50' : 'bg-amber-50'}`}></div>
             <div className="relative z-10">
                 <p className="text-gray-500 text-sm font-bold mb-1">สถานะการบันทึก</p>
                 <div className="flex items-baseline gap-2">
                    <h3 className={`text-4xl font-bold ${isAllSubmitted ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {submittedClasses}<span className="text-2xl text-gray-400">/{totalClasses}</span>
                    </h3>
                 </div>
                 <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div 
                        className={`h-1.5 rounded-full transition-all duration-1000 ${isAllSubmitted ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                        style={{ width: `${totalClasses > 0 ? (submittedClasses / totalClasses) * 100 : 0}%` }}
                    ></div>
                 </div>
             </div>
             <div className={`relative z-10 p-3 rounded-xl ${isAllSubmitted ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                 <ClipboardCheck className="w-8 h-8" />
             </div>
         </div>
         {/* Card 1: Total Students */}
         <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all">
             <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
             <div className="relative z-10">
                 <p className="text-gray-500 text-sm font-bold mb-1">นักเรียนทั้งหมด</p>
                 <h3 className="text-4xl font-bold text-black">{totalStudents}</h3>
                 <div className="flex gap-2 mt-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">ชาย {totalMale}</span>
                    <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2 py-1 rounded-md">หญิง {totalFemale}</span>
                 </div>
             </div>
             <div className="relative z-10 bg-blue-100 p-3 rounded-xl text-blue-600">
                 <Users className="w-8 h-8" />
             </div>
         </div>

         {/* Card 2: Present */}
         <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all">
             <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
             <div className="relative z-10">
                 <p className="text-gray-500 text-sm font-bold mb-1">มาเรียน</p>
                 <div className="flex items-baseline gap-2">
                    <h3 className="text-4xl font-bold text-emerald-600">{totalPresent}</h3>
                    <span className="text-sm font-bold text-emerald-500">({percentPresent}%)</span>
                 </div>
                 <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${percentPresent}%` }}></div>
                 </div>
             </div>
             <div className="relative z-10 bg-emerald-100 p-3 rounded-xl text-emerald-600">
                 <UserCheck className="w-8 h-8" />
             </div>
         </div>

         {/* Card 3: Absent */}
         <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all">
             <div className="absolute right-0 top-0 w-24 h-24 bg-rose-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
             <div className="relative z-10">
                 <p className="text-gray-500 text-sm font-bold mb-1">ขาด / ลา / ป่วย</p>
                 <h3 className="text-4xl font-bold text-rose-600">{totalAbsent}</h3>
                 <p className="text-xs text-gray-400 mt-2">คน</p>
             </div>
             <div className="relative z-10 bg-rose-100 p-3 rounded-xl text-rose-600">
                 <UserX className="w-8 h-8" />
             </div>
         </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Carousels */}
        <div className="lg:col-span-7 flex flex-col gap-6">
             <h3 className="text-lg font-bold text-black flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-brand-500" /> 
                ข้อมูลรายระดับชั้น
             </h3>
            
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                {kStats.length > 0 && (
                    <div className="md:col-span-1 h-full">
                        {renderCarousel(
                            "ระดับปฐมวัย", 
                            <Baby className="w-4 h-4"/>, 
                            kStats, 
                            kIndex, 
                            setKIndex, 
                            'K', 
                            "bg-gradient-to-r from-orange-400 to-amber-400"
                        )}
                    </div>
                )}
                <div className={kStats.length > 0 ? "md:col-span-1 h-full" : "md:col-span-2 h-full"}>
                    {renderCarousel(
                        "ระดับประถมศึกษา", 
                        <BookOpen className="w-4 h-4"/>, 
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

             <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden flex-1 flex flex-col max-h-[380px]">
                {/* Header of List */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-600">รายชื่อนักเรียน</span>
                    <button 
                        onClick={() => setShowAbsentDetails(!showAbsentDetails)}
                        className="text-xs text-brand-600 font-bold hover:underline"
                    >
                        {showAbsentDetails ? 'ซ่อนรายละเอียด' : 'แสดงทั้งหมด'}
                    </button>
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
                         <div className="space-y-2">
                             {attendances
                                .filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status))
                                .sort((a, b) => a.grade.localeCompare(b.grade))
                                .map((student, idx) => (
                                    <div key={`${student.studentId}-${idx}`} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${student.gender === Gender.MALE ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                                                {student.gender === Gender.MALE ? 'ช' : 'ญ'}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{student.studentName}</div>
                                                <div className="text-xs text-gray-500">{student.grade}</div>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                            student.status === AttendanceStatus.ABSENT ? 'bg-red-100 text-red-600' :
                                            student.status === AttendanceStatus.SICK ? 'bg-blue-100 text-blue-600' :
                                            'bg-purple-100 text-purple-600'
                                        }`}>
                                            {student.status}
                                        </span>
                                    </div>
                                ))
                             }
                         </div>
                     )}
                </div>
             </div>
        </div>

      </div>
    </div>
  );
};
