import React from 'react';
import { Student, AttendanceRecord, AttendanceStatus, Gender } from '../types';

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

export const DailyReportPreview: React.FC<DailyReportPreviewProps> = ({ students, attendances, date, dutyLog }) => {
    // Helper to get stats for a specific grade or list of grades
    const getStats = (gradePattern: string | string[]) => {
        const targetGrades = Array.isArray(gradePattern) ? gradePattern : [gradePattern];

        // Filter students belonging to these grades
        const gradeStudents = students.filter(s => {
            if (Array.isArray(gradePattern)) {
                return gradePattern.includes(s.grade);
            }
            return s.grade === gradePattern;
        });

        const totalMale = gradeStudents.filter(s => s.gender === Gender.MALE).length;
        const totalFemale = gradeStudents.filter(s => s.gender === Gender.FEMALE).length;
        const total = totalMale + totalFemale;

        // Filter attendance for these students
        const gradeAttendance = attendances.filter(a => {
            if (Array.isArray(gradePattern)) {
                return gradePattern.includes(a.grade);
            }
            return a.grade === gradePattern;
        });

        // Count Absences (Absent, Sick, Personal)
        const absentRecs = gradeAttendance.filter(a =>
            [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(a.status)
        );

        const absentMale = absentRecs.filter(a => a.gender === Gender.MALE).length;
        const absentFemale = absentRecs.filter(a => a.gender === Gender.FEMALE).length;
        const absentTotal = absentMale + absentFemale;

        // Present = Total - Absent
        const presentMale = totalMale - absentMale;
        const presentFemale = totalFemale - absentFemale;
        const presentTotal = total - absentTotal;

        return {
            totalMale, totalFemale, total,
            presentMale, presentFemale, presentTotal,
            absentMale, absentFemale, absentTotal
        };
    };

    // Define Grade Groups
    const k2Stats = getStats('อนุบาล 2');
    const k3Stats = getStats('อนุบาล 3');
    const kTotalStats = {
        totalMale: k2Stats.totalMale + k3Stats.totalMale,
        totalFemale: k2Stats.totalFemale + k3Stats.totalFemale,
        total: k2Stats.total + k3Stats.total,
        presentMale: k2Stats.presentMale + k3Stats.presentMale,
        presentFemale: k2Stats.presentFemale + k3Stats.presentFemale,
        presentTotal: k2Stats.presentTotal + k3Stats.presentTotal,
        absentMale: k2Stats.absentMale + k3Stats.absentMale,
        absentFemale: k2Stats.absentFemale + k3Stats.absentFemale,
        absentTotal: k2Stats.absentTotal + k3Stats.absentTotal,
    };

    const p1Stats = getStats('ประถมศึกษาปีที่ 1');
    const p2Stats = getStats('ประถมศึกษาปีที่ 2');
    const p3Stats = getStats('ประถมศึกษาปีที่ 3');
    const p4Stats = getStats('ประถมศึกษาปีที่ 4');
    const p5Stats = getStats('ประถมศึกษาปีที่ 5');
    const p6Stats = getStats('ประถมศึกษาปีที่ 6');

    const pTotalStats = {
        totalMale: p1Stats.totalMale + p2Stats.totalMale + p3Stats.totalMale + p4Stats.totalMale + p5Stats.totalMale + p6Stats.totalMale,
        totalFemale: p1Stats.totalFemale + p2Stats.totalFemale + p3Stats.totalFemale + p4Stats.totalFemale + p5Stats.totalFemale + p6Stats.totalFemale,
        total: p1Stats.total + p2Stats.total + p3Stats.total + p4Stats.total + p5Stats.total + p6Stats.total,
        presentMale: p1Stats.presentMale + p2Stats.presentMale + p3Stats.presentMale + p4Stats.presentMale + p5Stats.presentMale + p6Stats.presentMale,
        presentFemale: p1Stats.presentFemale + p2Stats.presentFemale + p3Stats.presentFemale + p4Stats.presentFemale + p5Stats.presentFemale + p6Stats.presentFemale,
        presentTotal: p1Stats.presentTotal + p2Stats.presentTotal + p3Stats.presentTotal + p4Stats.presentTotal + p5Stats.presentTotal + p6Stats.presentTotal,
        absentMale: p1Stats.absentMale + p2Stats.absentMale + p3Stats.absentMale + p4Stats.absentMale + p5Stats.absentMale + p6Stats.absentMale,
        absentFemale: p1Stats.absentFemale + p2Stats.absentFemale + p3Stats.absentFemale + p4Stats.absentFemale + p5Stats.absentFemale + p6Stats.absentFemale,
        absentTotal: p1Stats.absentTotal + p2Stats.absentTotal + p3Stats.absentTotal + p4Stats.absentTotal + p5Stats.absentTotal + p6Stats.absentTotal,
    };

    const grandTotal = {
        totalMale: kTotalStats.totalMale + pTotalStats.totalMale,
        totalFemale: kTotalStats.totalFemale + pTotalStats.totalFemale,
        total: kTotalStats.total + pTotalStats.total,
        presentMale: kTotalStats.presentMale + pTotalStats.presentMale,
        presentFemale: kTotalStats.presentFemale + pTotalStats.presentFemale,
        presentTotal: kTotalStats.presentTotal + pTotalStats.presentTotal,
        absentMale: kTotalStats.absentMale + pTotalStats.absentMale,
        absentFemale: kTotalStats.absentFemale + pTotalStats.absentFemale,
        absentTotal: kTotalStats.absentTotal + pTotalStats.absentTotal,
    };

    const percentPresent = grandTotal.total > 0
        ? ((grandTotal.presentTotal / grandTotal.total) * 100).toFixed(2)
        : "0.00";

    // Date Formatting
    const dateObj = new Date(date);
    const thaiMonths = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const year = dateObj.getFullYear() + 543;
    const dateString = dateObj.toLocaleDateString('th-TH', { weekday: 'long' });

    // Helper for rendering text or empty space (no dots)
    const RenderText = ({ text, center = false, width = "w-full" }: { text: string, center?: boolean, width?: string }) => (
        <div className={`inline-block ${width} ${center ? 'text-center' : ''} border-b border-transparent px-[3px]`}>
            {text || "\u00A0"}
        </div>
    );

    return (
        <div className="bg-white w-[210mm] min-h-[297mm] p-[5mm] relative daily-report-preview mx-auto shadow-lg print:shadow-none print:m-0 print:w-full">

            {/* CONTENT START */}
            <div className="font-sarabun text-black leading-[1] text-[15pt]">

                {/* Header */}
                <div className="text-center mb-0 leading-[1]">
                    <h1 className="text-[15pt]">สถิตินักเรียนและการปฏิบัติหน้าที่ของครูเวรประจำวัน</h1>
                    <h2 className="text-[15pt] mb-0">โรงเรียนประชาสามัคคี สำนักงานเขตพื้นที่การศึกษาประถมศึกษาพระนครศรีอยุธยา เขต 1</h2>
                    <div className="text-[15pt]">
                        ประจำวัน {dateString} ที่ {day} เดือน {month} พ.ศ. {year}
                    </div>
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
                            <th className="border border-black py-1 w-12">ชาย</th>
                            <th className="border border-black py-1 w-12">หญิง</th>
                            <th className="border border-black py-1 w-12">รวม</th>
                            <th className="border border-black py-1 w-12">ชาย</th>
                            <th className="border border-black py-1 w-12">หญิง</th>
                            <th className="border border-black py-1 w-12">รวม</th>
                            <th className="border border-black py-1 w-12">ชาย</th>
                            <th className="border border-black py-1 w-12">หญิง</th>
                            <th className="border border-black py-1 w-12">รวม</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Kindergarten */}
                        <tr>
                            <td className="border border-black py-1">1</td>
                            <td className="border border-black py-1 text-left px-2 whitespace-nowrap">อนุบาลปีที่ 2 (4 ขวบ)</td>
                            <td className="border border-black py-1">{k2Stats.totalMale}</td>
                            <td className="border border-black py-1">{k2Stats.totalFemale}</td>
                            <td className="border border-black py-1">{k2Stats.total}</td>
                            <td className="border border-black py-1">{k2Stats.presentMale}</td>
                            <td className="border border-black py-1">{k2Stats.presentFemale}</td>
                            <td className="border border-black py-1">{k2Stats.presentTotal}</td>
                            <td className="border border-black py-1">{k2Stats.absentMale}</td>
                            <td className="border border-black py-1">{k2Stats.absentFemale}</td>
                            <td className="border border-black py-1">{k2Stats.absentTotal}</td>
                            <td className="border border-black py-1"></td>
                        </tr>
                        <tr>
                            <td className="border border-black py-1">2</td>
                            <td className="border border-black py-1 text-left px-2 whitespace-nowrap">อนุบาลปีที่ 3 (5 ขวบ)</td>
                            <td className="border border-black py-1">{k3Stats.totalMale}</td>
                            <td className="border border-black py-1">{k3Stats.totalFemale}</td>
                            <td className="border border-black py-1">{k3Stats.total}</td>
                            <td className="border border-black py-1">{k3Stats.presentMale}</td>
                            <td className="border border-black py-1">{k3Stats.presentFemale}</td>
                            <td className="border border-black py-1">{k3Stats.presentTotal}</td>
                            <td className="border border-black py-1">{k3Stats.absentMale}</td>
                            <td className="border border-black py-1">{k3Stats.absentFemale}</td>
                            <td className="border border-black py-1">{k3Stats.absentTotal}</td>
                            <td className="border border-black py-1"></td>
                        </tr>
                        <tr className="bg-orange-50 print:bg-gray-100">
                            <td className="border border-black py-1" colSpan={2}>รวมอนุบาล</td>
                            <td className="border border-black py-1">{kTotalStats.totalMale}</td>
                            <td className="border border-black py-1">{kTotalStats.totalFemale}</td>
                            <td className="border border-black py-1">{kTotalStats.total}</td>
                            <td className="border border-black py-1">{kTotalStats.presentMale}</td>
                            <td className="border border-black py-1">{kTotalStats.presentFemale}</td>
                            <td className="border border-black py-1">{kTotalStats.presentTotal}</td>
                            <td className="border border-black py-1">{kTotalStats.absentMale}</td>
                            <td className="border border-black py-1">{kTotalStats.absentFemale}</td>
                            <td className="border border-black py-1">{kTotalStats.absentTotal}</td>
                            <td className="border border-black py-1"></td>
                        </tr>

                        {/* Primary */}
                        {[p1Stats, p2Stats, p3Stats, p4Stats, p5Stats, p6Stats].map((stat, idx) => (
                            <tr key={idx}>
                                <td className="border border-black py-1">{idx + 3}</td>
                                <td className="border border-black py-1 text-left px-2 whitespace-nowrap">ประถมศึกษาปีที่ {idx + 1}</td>
                                <td className="border border-black py-1">{stat.totalMale}</td>
                                <td className="border border-black py-1">{stat.totalFemale}</td>
                                <td className="border border-black py-1">{stat.total}</td>
                                <td className="border border-black py-1">{stat.presentMale}</td>
                                <td className="border border-black py-1">{stat.presentFemale}</td>
                                <td className="border border-black py-1">{stat.presentTotal}</td>
                                <td className="border border-black py-1">{stat.absentMale}</td>
                                <td className="border border-black py-1">{stat.absentFemale}</td>
                                <td className="border border-black py-1">{stat.absentTotal}</td>
                                <td className="border border-black py-1"></td>
                            </tr>
                        ))}

                        <tr className="bg-orange-50 print:bg-gray-100">
                            <td className="border border-black py-1" colSpan={2}>รวมประถมศึกษา</td>
                            <td className="border border-black py-1">{pTotalStats.totalMale}</td>
                            <td className="border border-black py-1">{pTotalStats.totalFemale}</td>
                            <td className="border border-black py-1">{pTotalStats.total}</td>
                            <td className="border border-black py-1">{pTotalStats.presentMale}</td>
                            <td className="border border-black py-1">{pTotalStats.presentFemale}</td>
                            <td className="border border-black py-1">{pTotalStats.presentTotal}</td>
                            <td className="border border-black py-1">{pTotalStats.absentMale}</td>
                            <td className="border border-black py-1">{pTotalStats.absentFemale}</td>
                            <td className="border border-black py-1">{pTotalStats.absentTotal}</td>
                            <td className="border border-black py-1"></td>
                        </tr>

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
                        <div className="flex items-start gap-1">
                            <span className="whitespace-nowrap w-24">เวลา 07.30 น.</span>
                            <div className="flex-1">
                                <span>ควบคุม แนะนำการทำความสะอาดอาคารเรียน บริเวณโรงเรียนและอื่น</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-1">
                                <span className="whitespace-nowrap w-24">เวลา 08.00 น.</span>
                                <div className="flex-1">
                                    <span>ให้สัญญาณเข้าแถว ควบคุมการเข้าแถว เคารพธงชาติ ทำกิจกรรมประจำวัน</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-1">
                                <span className="whitespace-nowrap w-auto">อบรมนักเรียนหน้าเสาธง</span>
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="flex items-end gap-1">
                                        <span className="w-16 text-right whitespace-nowrap">เรื่อง 1</span>
                                        <RenderText text={dutyLog.topic1} />
                                    </div>
                                    <div className="flex items-end gap-1">
                                        <span className="w-16 text-right">2</span>
                                        <RenderText text={dutyLog.topic2} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-1">
                            <span className="whitespace-nowrap w-24">เวลา 08.30 น.</span>
                            <div className="flex-1">
                                <span>เข้าห้องเรียน</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-1">
                            <span className="whitespace-nowrap w-24">เวลา 11.30 น.</span>
                            <div className="flex-1">
                                <span>พักกลางวัน / ทำกิจกรรม</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-1">
                            <span className="whitespace-nowrap w-24">เวลา 12.15 น.</span>
                            <div className="flex-1">
                                <span>ให้สัญญาณตีระฆังเข้าเรียนช่วงบ่ายและอบรมเพิ่มเติม</span>
                                <div className="flex items-end gap-1 mt-1">
                                    <span>เรื่อง</span>
                                    <RenderText text={dutyLog.afternoonTopic} />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-1">
                                <span className="whitespace-nowrap w-24">เวลา 15.20 น.</span>
                                <div className="flex-1">
                                    <span>ให้สัญญาณตีระฆังกลับบ้าน / ควบคุมการเดินแถวกลับบ้าน</span>
                                </div>
                            </div>
                            <div className="flex items-end gap-1">
                                <span className="whitespace-nowrap w-24">เรื่องอื่น ๆ (ถ้ามี)</span>
                                <RenderText text={dutyLog.otherTopic} />
                            </div>
                        </div>
                    </div>

                    {/* Signatures */}
                    <div className="mt-4 flex justify-end px-16">
                        <div className="flex flex-col gap-2 w-[360px]">
                            <div className="flex items-end gap-2">
                                <span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span>
                                <div className="w-48 border-b border-black h-6"></div>
                                <span className="whitespace-nowrap">ครูเวรประจำวัน</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="w-[35px]"></span>
                                <div className="w-48 flex items-center justify-between">
                                    <span>(</span>
                                    <RenderText text={dutyLog.teacherName} center width="w-full" />
                                    <span>)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-1 flex justify-end px-16">
                        <div className="flex flex-col gap-2 w-[360px]">
                            <div className="flex items-end gap-2">
                                <span className="w-[35px] text-right whitespace-nowrap">ลงชื่อ</span>
                                <div className="w-48 border-b border-black h-6"></div>
                                <span className="whitespace-nowrap">ผู้อำนวยการ</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="w-[35px]"></span>
                                <div className="w-48 text-center">
                                    (นางสาวจินดา พลีรักษ์)
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>

            {/* Print Styles */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                
                .font-sarabun {
                    font-family: 'TH Sarabun New', 'Sarabun', sans-serif;
                }

                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .daily-report-preview, .daily-report-preview * {
                        visibility: visible;
                    }
                    .daily-report-preview {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 5mm !important;
                        background: white;
                        overflow: visible !important;
                        box-sizing: border-box;
                        z-index: 9999;
                        box-shadow: none !important;
                    }
                }
            `}</style>
        </div>
    );
};
