import React from 'react';
import { Student, AttendanceRecord, AttendanceStatus, Gender, StudentStatus } from '../types';

interface DailyReportPreviewProps {
    students: Student[];
    attendances: AttendanceRecord[];
    date: string;
    dutyLog: {
        topic1: string;
        topic2: string;
        afternoonTopic: string;
        otherTopic: string;
        teacherName: string;
    };
}

// Stats type
type GradeStats = { totalMale: number; totalFemale: number; total: number; presentMale: number; presentFemale: number; presentTotal: number; absentMale: number; absentFemale: number; absentTotal: number; };

// Helper to sum multiple stats
const sumStats = (...statsArray: GradeStats[]): GradeStats => statsArray.reduce((acc, s) => ({
    totalMale: acc.totalMale + s.totalMale, totalFemale: acc.totalFemale + s.totalFemale, total: acc.total + s.total,
    presentMale: acc.presentMale + s.presentMale, presentFemale: acc.presentFemale + s.presentFemale, presentTotal: acc.presentTotal + s.presentTotal,
    absentMale: acc.absentMale + s.absentMale, absentFemale: acc.absentFemale + s.absentFemale, absentTotal: acc.absentTotal + s.absentTotal,
}), { totalMale: 0, totalFemale: 0, total: 0, presentMale: 0, presentFemale: 0, presentTotal: 0, absentMale: 0, absentFemale: 0, absentTotal: 0 });

export const DailyReportPreview: React.FC<DailyReportPreviewProps> = ({ students, attendances, date, dutyLog }) => {
    // Filter students based on report date - include students who were active at that time
    // Students who withdrew AFTER the report date should be included
    const reportDate = new Date(date);
    reportDate.setHours(23, 59, 59, 999); // End of day

    const activeStudents = students.filter(s => {
        // Include ACTIVE students
        if (s.status !== StudentStatus.WITHDRAWN) return true;
        // Include WITHDRAWN students if they withdrew AFTER the report date
        if (s.withdrawnAt) {
            const withdrawnDate = new Date(s.withdrawnAt);
            return withdrawnDate > reportDate;
        }
        return false;
    });

    // Filter attendances to only include records for active students (exclude deleted students)
    const activeStudentIds = new Set(activeStudents.map(s => s.id));
    const validAttendances = attendances.filter(a => activeStudentIds.has(a.studentId));

    // Helper to get stats for a specific grade
    const getStats = (gradePattern: string | string[]): GradeStats => {
        const targetGrades = Array.isArray(gradePattern) ? gradePattern : [gradePattern];
        const gradeStudents = activeStudents.filter(s => targetGrades.includes(s.grade));
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

    // Helper for rendering text or empty space
    const RenderText = ({ text, center = false, width = "w-full" }: { text: string, center?: boolean, width?: string }) => (
        <div className={`inline-block ${width} ${center ? 'text-center' : ''} border-b border-transparent px-[3px]`}>{text || "\u00A0"}</div>
    );

    // Row renderer
    const StatRow = ({ num, label, stats }: { key?: number; num: number; label: string; stats: GradeStats }) => (
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
            <td className="border border-black py-1"></td>
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
        <div className="bg-white w-[210mm] min-h-[297mm] pt-[calc(10mm+1px)] pb-[calc(10mm+1px)] pl-[calc(20mm-1px)] pr-[calc(20mm-2px)] relative daily-report-preview mx-auto shadow-lg print:shadow-none print:m-0 print:w-full">
            {/* CONTENT */}
            <div className="font-sarabun text-black leading-[1.5] text-[16pt]">
                {/* Header */}
                <div className="text-center mb-6 leading-[1.2] mt-[1.5em]">
                    <h1 className="text-[16pt]">สถิตินักเรียนและการปฏิบัติหน้าที่ของครูเวรประจำวัน</h1>
                    <h2 className="text-[16pt] mb-0">โรงเรียนประชาสามัคคี สำนักงานเขตพื้นที่การศึกษาประถมศึกษาพระนครศรีอยุธยา เขต 1</h2>
                    <div className="text-[16pt]">ประจำวัน {dateString} ที่ {day} เดือน {month} พ.ศ. {year}</div>
                </div>

                {/* Table */}
                <table className="w-full border-collapse border border-black mb-0 text-center text-[16pt] leading-[1.05]">
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
                                <th key={i} className="border border-black py-1 w-10">{h}</th>
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
                            <td className="border border-black py-1 underline">{grandTotal.totalMale}</td>
                            <td className="border border-black py-1 underline">{grandTotal.totalFemale}</td>
                            <td className="border border-black py-1 underline">{grandTotal.total}</td>
                            <td className="border border-black py-1">{grandTotal.presentMale}</td>
                            <td className="border border-black py-1">{grandTotal.presentFemale}</td>
                            <td className="border border-black py-1">{grandTotal.presentTotal}</td>
                            <td className="border border-black py-1">{grandTotal.absentMale}</td>
                            <td className="border border-black py-1">{grandTotal.absentFemale}</td>
                            <td className="border border-black py-1">{grandTotal.absentTotal}</td>
                            <td className="border border-black py-1 text-center px-0 whitespace-nowrap">ร้อยละ {percentPresent}</td>
                        </tr>
                    </tbody>
                </table>

                {/* Duty Log Section */}
                <div className="mt-2 leading-[1.0]">
                    <h3 className="text-[16pt] mb-0">• บันทึกครูเวรประจำวัน</h3>
                    <div className="space-y-1 pl-4">
                        <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 07.30 น.</span><span className="flex-1">ควบคุม แนะนำการทำความสะอาดอาคารเรียน บริเวณโรงเรียนและอื่น</span></div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 08.00 น.</span><span className="flex-1">ให้สัญญาณเข้าแถว ควบคุมการเข้าแถว เคารพธงชาติ ทำกิจกรรมประจำวัน</span></div>
                            <div className="flex items-start gap-1">
                                <span className="whitespace-nowrap">อบรมนักเรียนหน้าเสาธง</span>
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="flex items-end gap-1"><span className="w-16 text-right whitespace-nowrap">เรื่อง 1</span><RenderText text={dutyLog.topic1} /></div>
                                    <div className="flex items-end gap-1"><span className="w-16 text-right">2</span><RenderText text={dutyLog.topic2} /></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 08.30 น.</span><span className="flex-1">เข้าห้องเรียน</span></div>
                        <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 11.30 น.</span><span className="flex-1">พักกลางวัน / ทำกิจกรรม</span></div>
                        <div className="flex items-start gap-1">
                            <span className="whitespace-nowrap w-24">เวลา 12.15 น.</span>
                            <div className="flex-1">
                                <span>ให้สัญญาณตีระฆังเข้าเรียนช่วงบ่ายและอบรมเพิ่มเติม</span>
                                <div className="flex items-end gap-1 mt-1"><span>เรื่อง</span><RenderText text={dutyLog.afternoonTopic} /></div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-1"><span className="whitespace-nowrap w-24">เวลา 15.20 น.</span><span className="flex-1">ให้สัญญาณตีระฆังกลับบ้าน / ควบคุมการเดินแถวกลับบ้าน</span></div>
                            <div className="flex items-end gap-1"><span className="whitespace-nowrap w-24">เรื่องอื่น ๆ (ถ้ามี)</span><RenderText text={dutyLog.otherTopic} /></div>
                        </div>
                    </div>

                    {/* Signatures */}
                    <div className="mt-8 flex justify-end pr-8">
                        <div className="flex flex-col gap-2 w-[360px]">
                            <div className="flex items-end gap-2"><span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span><div className="w-48 border-b border-black h-6"></div><span className="whitespace-nowrap">ครูเวรประจำวัน</span></div>
                            <div className="flex items-end gap-2"><span className="w-[35px]"></span><div className="w-48 flex items-center justify-between"><span>(</span><RenderText text={dutyLog.teacherName} center width="w-full" /><span>)</span></div></div>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end pr-8">
                        <div className="flex flex-col gap-2 w-[360px]">
                            <div className="flex items-end gap-2"><span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span><div className="w-48 border-b border-black h-6"></div><span className="whitespace-nowrap">ผู้อำนวยการ</span></div>
                            <div className="flex items-end gap-2"><span className="w-[35px]"></span><div className="w-48 text-center">(นางสาวจินดา พลีรักษ์)</div></div>
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
                    .daily-report-preview, .daily-report-preview * { visibility: visible; }
                    .daily-report-preview { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; height: auto !important; margin: 0 !important; padding: calc(10mm + 1px) calc(20mm - 2px) calc(10mm + 1px) calc(20mm - 1px) !important; background: white; overflow: visible !important; box-sizing: border-box; z-index: 9999; box-shadow: none !important; }
                }
            `}</style>
        </div>
    );
};
