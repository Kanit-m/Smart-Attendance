import React, { useState, useEffect } from 'react';
import { doc, getDocs, collection, query, orderBy, where } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AppUser } from '../types';
import { mapStudentData } from '../utils';
import { DailyReportPreview } from './DailyReportPreview';
import { Printer, ArrowLeft } from 'lucide-react';

export const PrintReportPage: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Duty Log State
    const [dutyLog, setDutyLog] = useState({
        topic1: '',
        topic2: '',
        afternoonTopic: '',
        otherTopic: '',
        teacherName: ''
    });

    // Get date from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const dateParam = params.get('date');
        if (dateParam) {
            setDate(dateParam);
        }
    }, []);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Students
                const studentsQuery = query(collection(db, 'students'), orderBy('grade'), orderBy('number'));
                const studentsSnap = await getDocs(studentsQuery);
                const studentsData = studentsSnap.docs.map(doc => mapStudentData(doc.id, doc.data()));
                setStudents(studentsData);

                // 2. Fetch Attendance for the date
                // Correctly query the root 'attendance' collection by date
                const attendanceQuery = query(collection(db, 'attendance'), where('date', '==', date));
                const attendanceSnap = await getDocs(attendanceQuery);
                const attendanceData = attendanceSnap.docs.map(doc => doc.data() as AttendanceRecord);
                setAttendances(attendanceData);

            } catch (error) {
                console.error("Error fetching report data:", error);
            } finally {
                setLoading(false);
            }
        };

        if (date) {
            fetchData();
        }
    }, [date]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">กำลังโหลดข้อมูล...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
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
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />
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
                        onClick={handlePrint}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 flex items-center justify-center gap-2 mt-8"
                    >
                        <Printer className="w-5 h-5" />
                        พิมพ์รายงาน
                    </button>

                    <p className="text-xs text-gray-400 text-center mt-4">
                        * กดพิมพ์แล้วแผงควบคุมนี้จะถูกซ่อนอัตโนมัติ
                    </p>
                </div>
            </div>

            {/* Right: Preview Area */}
            <div className="flex-1 bg-gray-500 p-8 overflow-y-auto h-screen flex justify-center print:p-0 print:h-auto print:overflow-visible">
                <DailyReportPreview
                    students={students}
                    attendances={attendances}
                    date={date}
                    dutyLog={dutyLog}
                />
            </div>
        </div>
    );
};
