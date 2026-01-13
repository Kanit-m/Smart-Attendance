import React from 'react';
import { X, Printer } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AttendanceStatus, Gender } from '../types';

interface DailyReportProps {
    students: Student[];
    attendances: AttendanceRecord[];
    date: string;
    onClose: () => void;
}

// Editable Input Component
const DottedInput = ({ width = "w-full", value = "", center = false, transparent = false, solid = false, className = "", ...props }: { width?: string, value?: string, center?: boolean, transparent?: boolean, solid?: boolean, className?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="text" className={`${transparent ? '' : (solid ? 'border-b border-black' : 'border-b border-dotted border-black')} outline-none bg-transparent px-[3px] font-sarabun text-black ${width} ${center ? 'text-center' : ''} ${className}`} defaultValue={value} {...props} />
);

// Stats type
type GradeStats = { totalMale: number; totalFemale: number; total: number; presentMale: number; presentFemale: number; presentTotal: number; absentMale: number; absentFemale: number; absentTotal: number; };

// Helper to sum multiple stats
const sumStats = (...statsArray: GradeStats[]): GradeStats => statsArray.reduce((acc, s) => ({
    totalMale: acc.totalMale + s.totalMale, totalFemale: acc.totalFemale + s.totalFemale, total: acc.total + s.total,
    presentMale: acc.presentMale + s.presentMale, presentFemale: acc.presentFemale + s.presentFemale, presentTotal: acc.presentTotal + s.presentTotal,
    absentMale: acc.absentMale + s.absentMale, absentFemale: acc.absentFemale + s.absentFemale, absentTotal: acc.absentTotal + s.absentTotal,
}), { totalMale: 0, totalFemale: 0, total: 0, presentMale: 0, presentFemale: 0, presentTotal: 0, absentMale: 0, absentFemale: 0, absentTotal: 0 });

export const DailyReport: React.FC<DailyReportProps> = ({ students, attendances, date, onClose }) => {
    // Filter attendances to only include records for students that exist in the students prop
    const studentIds = new Set(students.map(s => s.id));
    const validAttendances = attendances.filter(a => studentIds.has(a.studentId));

    // Helper to get stats for a specific grade
    const getStats = (gradePattern: string | string[]): GradeStats => {
        const targetGrades = Array.isArray(gradePattern) ? gradePattern : [gradePattern];
        const gradeStudents = students.filter(s => targetGrades.includes(s.grade));
        const totalMale = gradeStudents.filter(s => s.gender === Gender.MALE).length;
        const totalFemale = gradeStudents.filter(s => s.gender === Gender.FEMALE).length;
        const total = totalMale + totalFemale;

        const gradeAttendance = validAttendances.filter(a => targetGrades.includes(a.grade));
        const absentRecs = gradeAttendance.filter(a => [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status));
        const absentMale = absentRecs.filter(a => a.gender === Gender.MALE).length;
        const absentFemale = absentRecs.filter(a => a.gender === Gender.FEMALE).length;

        return {
            totalMale, totalFemale, total,
            presentMale: totalMale - absentMale, presentFemale: totalFemale - absentFemale, presentTotal: total - absentMale - absentFemale,
            absentMale, absentFemale, absentTotal: absentMale + absentFemale
        };
    };

    // Grade Stats
    const k2Stats = getStats('อนุบาล 2'), k3Stats = getStats('อนุบาล 3');
    const pStats = ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'].map(g => getStats(g));
    const kTotalStats = sumStats(k2Stats, k3Stats);
    const pTotalStats = sumStats(...pStats);
    const grandTotal = sumStats(kTotalStats, pTotalStats);
    const percentPresent = grandTotal.total > 0 ? ((grandTotal.presentTotal / grandTotal.total) * 100).toFixed(2) : "0.00";

    // Date Formatting
    const dateObj = new Date(date);
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const day = dateObj.getDate(), month = thaiMonths[dateObj.getMonth()], year = dateObj.getFullYear() + 543;
    const dateString = dateObj.toLocaleDateString('th-TH', { weekday: 'long' });

    // Row renderer
    const StatRow = ({ num, label, stats, showInput = true }: { key?: number; num: number; label: string; stats: GradeStats; showInput?: boolean }) => (
        <tr>
            <td className="border border-black py-1">{num}</td>
            <td className="border border-black py-1 text-left px-2 whitespace-nowrap">{label}</td>
            <td className="border border-black py-1">{stats.totalMale}</td>
            <td className="border border-black py-1">{stats.totalFemale}</td>
            <td className="border border-black py-1">{stats.total}</td>
            <td className="border border-black py-1">{stats.presentMale}</td>
            <td className="border border-black py-1">{stats.presentFemale}</td>
            <td className="border border-black py-1">{stats.presentTotal}</td>
            <td className="border border-black py-1">{stats.absentMale}</td>
            <td className="border border-black py-1">{stats.absentFemale}</td>
            <td className="border border-black py-1">{stats.absentTotal}</td>
            <td className="border border-black py-1">{showInput ? <DottedInput transparent /> : null}</td>
        </tr>
    );

    const SubtotalRow = ({ label, stats }: { label: string; stats: GradeStats }) => (
        <tr className="bg-orange-50 print:bg-gray-100">
            <td className="border border-black py-1" colSpan={2}>{label}</td>
            <td className="border border-black py-1">{stats.totalMale}</td>
            <td className="border border-black py-1">{stats.totalFemale}</td>
            <td className="border border-black py-1">{stats.total}</td>
            <td className="border border-black py-1">{stats.presentMale}</td>
            <td className="border border-black py-1">{stats.presentFemale}</td>
            <td className="border border-black py-1">{stats.presentTotal}</td>
            <td className="border border-black py-1">{stats.absentMale}</td>
            <td className="border border-black py-1">{stats.absentFemale}</td>
            <td className="border border-black py-1">{stats.absentTotal}</td>
            <td className="border border-black py-1"></td>
        </tr>
    );

    return (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex justify-center overflow-y-auto print:contents">
            <div className="bg-white w-[210mm] min-h-[297mm] p-[5mm] shadow-2xl my-8 print:shadow-none print:m-0 print:w-full relative daily-report-container">
                {/* Close / Print Buttons */}
                <div className="absolute top-4 right-4 flex gap-2 print:hidden">
                    <button onClick={async () => {
                        // Log print action to Firestore with user info (use date as doc ID to prevent duplicates)
                        try {
                            const printedBy = localStorage.getItem('currentUserName') || 'ไม่ทราบ';
                            const role = localStorage.getItem('currentUserRole') || 'unknown';
                            await setDoc(doc(db, 'print_logs', date), {
                                date,
                                timestamp: Date.now(),
                                printedBy,
                                role
                            });
                        } catch (err) {
                            console.error('Failed to log print action:', err);
                        }
                        window.print();
                    }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold shadow-sm">
                        <Printer className="w-4 h-4" /> พิมพ์
                    </button>
                    <button onClick={onClose} className="bg-gray-200 text-gray-700 p-2 rounded-lg hover:bg-gray-300"><X className="w-5 h-5" /></button>
                </div>

                {/* CONTENT */}
                <div className="font-sarabun text-black leading-[1] text-[15pt]">
                    {/* Header */}
                    <div className="text-center mb-0 leading-[1]">
                        <h1 className="text-[15pt]">สถิตินักเรียนและการปฏิบัติหน้าที่ของครูเวรประจำวัน</h1>
                        <h2 className="text-[15pt] mb-0">โรงเรียนประชาสามัคคี สำนักงานเขตพื้นที่การศึกษาประถมศึกษาพระนครศรีอยุธยา เขต 1</h2>
                        <div className="text-[15pt]">ประจำวัน {dateString} ที่ {day} เดือน {month} พ.ศ. {year}</div>
                    </div>

                    {/* Table */}
                    <table className="w-full border-collapse border border-black mb-0 text-center text-[15pt]">
                        <thead>
                            <tr className="bg-white">
                                <th className="border border-black py-2 w-10" rowSpan={2}>ที่</th>
                                <th className="border border-black py-2 w-40" rowSpan={2}>ชั้น</th>
                                <th className="border border-black py-1" colSpan={3}>จำนวนเต็ม</th>
                                <th className="border border-black py-1" colSpan={3}>มาเรียน</th>
                                <th className="border border-black py-1" colSpan={3}>ขาดเรียน</th>
                                <th className="border border-black py-2" rowSpan={2}>หมายเหตุ</th>
                            </tr>
                            <tr>
                                {['ชาย', 'หญิง', 'รวม', 'ชาย', 'หญิง', 'รวม', 'ชาย', 'หญิง', 'รวม'].map((h, i) => (
                                    <th key={i} className="border border-black py-1 w-12">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <StatRow num={1} label="อนุบาลปีที่ 2 (4 ขวบ)" stats={k2Stats} />
                            <StatRow num={2} label="อนุบาลปีที่ 3 (5 ขวบ)" stats={k3Stats} />
                            <SubtotalRow label="รวมอนุบาล" stats={kTotalStats} />
                            {pStats.map((stat, idx) => (
                                <StatRow key={idx} num={idx + 3} label={`ประถมศึกษาปีที่ ${idx + 1}`} stats={stat} />
                            ))}
                            <SubtotalRow label="รวมประถมศึกษา" stats={pTotalStats} />
                            {/* Grand Total */}
                            <tr className="border-t-2 border-black">
                                <td className="border border-black py-1" colSpan={2}>รวมนักเรียนทั้งสิ้น</td>
                                <td className="border border-black py-1 underline decoration-double">{grandTotal.totalMale}</td>
                                <td className="border border-black py-1 underline decoration-double">{grandTotal.totalFemale}</td>
                                <td className="border border-black py-1 underline decoration-double">{grandTotal.total}</td>
                                <td className="border border-black py-1">{grandTotal.presentMale}</td>
                                <td className="border border-black py-1">{grandTotal.presentFemale}</td>
                                <td className="border border-black py-1">{grandTotal.presentTotal}</td>
                                <td className="border border-black py-1">{grandTotal.absentMale}</td>
                                <td className="border border-black py-1">{grandTotal.absentFemale}</td>
                                <td className="border border-black py-1">{grandTotal.absentTotal}</td>
                                <td className="border border-black py-1 text-center px-1">ร้อยละ {percentPresent}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Duty Log Section */}
                    <div className="mt-0">
                        <h3 className="text-[15pt] mb-0">• บันทึกครูเวรประจำวัน</h3>
                        <div className="space-y-1 pl-4">
                            <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 07.30 น.</span><span className="flex-1">ควบคุม แนะนำการทำความสะอาดอาคารเรียน บริเวณโรงเรียนและอื่น</span></div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 08.00 น.</span><span className="flex-1">ให้สัญญาณเข้าแถว ควบคุมการเข้าแถว เคารพธงชาติ ทำกิจกรรมประจำวัน</span></div>
                                <div className="flex items-start gap-1">
                                    <span className="whitespace-nowrap">อบรมนักเรียนหน้าเสาธง</span>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="flex items-end gap-1"><span className="w-16 text-right whitespace-nowrap">เรื่อง 1</span><DottedInput solid /></div>
                                        <div className="flex items-end gap-1"><span className="w-16 text-right">2</span><DottedInput solid /></div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 08.30 น.</span><span className="flex-1">เข้าห้องเรียน</span></div>
                            <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 11.30 น.</span><span className="flex-1">พักกลางวัน / ทำกิจกรรม</span></div>
                            <div className="flex items-start gap-1">
                                <span className="whitespace-nowrap w-24">เวลา 12.15 น.</span>
                                <div className="flex-1">
                                    <span>ให้สัญญาณตีระฆังเข้าเรียนช่วงบ่ายและอบรมเพิ่มเติม</span>
                                    <div className="flex items-end gap-1 mt-1"><span>เรื่อง</span><DottedInput solid /></div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 15.20 น.</span><span className="flex-1">ให้สัญญาณตีระฆังกลับบ้าน / ควบคุมการเดินแถวกลับบ้าน</span></div>
                                <div className="flex items-end gap-1"><span className="whitespace-nowrap w-24">เรื่องอื่น ๆ (ถ้ามี)</span><DottedInput solid /></div>
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="mt-4 flex justify-end px-16">
                            <div className="flex flex-col gap-2 w-[360px]">
                                <div className="flex items-end gap-2"><span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span><DottedInput center width="w-48" /><span className="whitespace-nowrap">ครูเวรประจำวัน</span></div>
                                <div className="flex items-end gap-2"><span className="w-[35px]"></span><div className="w-48 flex items-center justify-between"><span>(</span><DottedInput center width="w-full" transparent /><span>)</span></div></div>
                            </div>
                        </div>
                        <div className="mt-1 flex justify-end px-16">
                            <div className="flex flex-col gap-2 w-[360px]">
                                <div className="flex items-end gap-2"><span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span><DottedInput center width="w-48" /><span className="whitespace-nowrap">ผู้อำนวยการ</span></div>
                                <div className="flex items-end gap-2"><span className="w-[35px]"></span><div className="w-48 text-center">(นางสาวจินดา พลีรักษ์)</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Styles */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                .font-sarabun { font-family: 'TH Sarabun New', 'Sarabun', sans-serif; }
                @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden; }
                    .daily-report-container, .daily-report-container * { visibility: visible; }
                    .daily-report-container { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; height: auto !important; margin: 0 !important; padding: 5mm !important; background: white; overflow: visible !important; box-sizing: border-box; z-index: 9999; }
                    .shadow-2xl { box-shadow: none !important; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
};
