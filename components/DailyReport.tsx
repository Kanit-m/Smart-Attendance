
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { db } from '../firebase';
import { Student, AttendanceRecord, AttendanceStatus, Gender } from '../types';
import { mapStudentData } from '../utils';
import { Printer, ArrowLeft, Loader2, Save, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface DailyReportProps {
  date: string;
  onBack: () => void;
}

// Data structure mimicking the user's requirements
interface StatCounts {
  maleTotal: number;
  femaleTotal: number;
  total: number;
  attendedMale: number;
  attendedFemale: number;
  attendedTotal: number;
  absentMale: number;
  absentFemale: number;
  absentTotal: number;
}

interface ReportData {
  grades: Record<string, StatCounts>;
  summaryK: StatCounts;
  summaryP: StatCounts;
  grandTotal: StatCounts & { percent: string };
}

// Mapping from DB Grade values to Report Display Labels
const DB_TO_REPORT_GRADE: Record<string, string> = {
  'อนุบาล 2': 'อนุบาลปีที่ 2 (4 ขวบ)',
  'อนุบาล 3': 'อนุบาลปีที่ 3 (5 ขวบ)',
  'ประถมศึกษาปีที่ 1': 'ประถมศึกษาปีที่ 1',
  'ประถมศึกษาปีที่ 2': 'ประถมศึกษาปีที่ 2',
  'ประถมศึกษาปีที่ 3': 'ประถมศึกษาปีที่ 3',
  'ประถมศึกษาปีที่ 4': 'ประถมศึกษาปีที่ 4',
  'ประถมศึกษาปีที่ 5': 'ประถมศึกษาปีที่ 5',
  'ประถมศึกษาปีที่ 6': 'ประถมศึกษาปีที่ 6',
};

// Styles optimized for 10pt font and specific alignments with 1.8 line height
const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');

  .report-wrapper {
      font-family: 'Sarabun', sans-serif;
      background-color: #525659;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 40px 0;
  }

  .report-container {
      font-family: 'Sarabun', sans-serif;
      width: 210mm;
      min-height: 297mm;
      background-color: white;
      padding: 15mm 20mm;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      box-sizing: border-box;
      position: relative;
      color: black;
      font-size: 10pt; /* Global font size 10pt */
      line-height: 1.3;
  }

  .report-header {
      text-align: center;
      margin-bottom: 10px;
  }

  .report-header h3 {
      margin: 2px 0;
      font-size: 12pt; /* Header slightly larger */
      font-weight: bold;
      line-height: 1.8;
  }

  .report-header p {
      margin: 2px 0;
      font-size: 10pt;
      line-height: 1.8;
  }

  .attendance-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 10pt;
      border-spacing: 0;
  }

  .attendance-table th,
  .attendance-table td {
      border: 1px solid #000000;
      padding: 3px 2px;
      text-align: center;
      height: 20px;
      vertical-align: middle;
      line-height: 1.1;
      font-size: 10pt;
  }

  .attendance-table th {
      font-weight: bold;
      background-color: #fff;
      padding-top: 5px;
      padding-bottom: 5px;
  }

  .summary-row {
      background-color: #fffcf0;
      font-weight: bold;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
  }

  .grand-total-row {
      font-weight: bold;
      background-color: #fff;
  }

  .duty-notes {
      margin-top: 25px;
      font-size: 10pt;
  }

  .note-header {
      font-weight: bold;
      margin-bottom: 12px;
  }

  /* Relaxed line height settings (1.8) */
  .note-content p {
      margin: 8px 0; 
      line-height: 1.8; 
      font-size: 10pt;
  }

  .note-time-row {
      display: flex;
      align-items: baseline;
      margin: 8px 0;
      font-size: 10pt;
      line-height: 1.8;
  }

  /* Form Input Table Styles */
  .form-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      margin-top: 6px;
      font-size: 10pt;
  }
  
  .form-table td {
      padding: 6px 0;
      vertical-align: bottom;
      font-size: 10pt;
      line-height: 1.8;
  }
  
  .input-col {
      width: 99%; /* Take remaining space */
      border-bottom: 1px dotted #000;
      position: relative;
  }

  .dotted-input {
      border: none;
      background: transparent;
      font-family: 'Sarabun', sans-serif;
      font-size: 10pt !important;
      width: 100%;
      outline: none;
      color: #000;
      padding: 0 5px;
      line-height: 1.8;
      height: 28px; /* Increased height to prevent overlap with 1.8 line height */
      margin-bottom: -3px;
  }
  
  .dotted-input:focus {
      background-color: #f0f9ff;
  }

  .signature-area {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-top: 25px;
      padding-right: 20px;
      font-size: 10pt;
  }

  .signature-wrapper {
      display: flex;
      flex-direction: column;
      gap: 15px;
      align-items: flex-start;
  }

  .signature-block {
      display: flex;
      justify-content: center;
      width: 100%;
  }

  .signature-grid {
      display: grid;
      grid-template-columns: max-content minmax(160px, max-content) max-content;
      align-items: baseline;
      column-gap: 10px;
      row-gap: 5px;
  }

  /* Print Styles */
  @media print {
      body {
          background-color: white;
      }
      
      .no-print {
          display: none !important;
      }

      .report-wrapper {
          padding: 0;
          background-color: white;
          display: block;
      }

      .report-container {
          width: 100%;
          min-height: auto;
          box-shadow: none;
          padding: 0;
          margin: 0;
          border: none;
      }

      @page {
          size: A4;
          margin: 10mm 15mm 10mm 15mm;
      }
      
      /* Updated Print Table Styles */
      .report-table th,
      .report-table td {
          border: 1px solid #000 !important;
          vertical-align: middle !important;
          padding: 4px 1px !important;
          font-size: 8pt !important;
          line-height: 1.1 !important;
      }

      /* Adjust specific column widths for print */
      .report-table th:nth-child(1),
      .report-table td:nth-child(1) {
          width: 30% !important; /* Grade column (was 2nd, now 1st) */
      }
      
      .report-table th:last-child,
      .report-table td:last-child {
          width: 10% !important; /* Remarks column */
      }
      
      .input-col {
          border-bottom: 1px dotted #000 !important;
      }
  }
`;

const INITIAL_STATS: StatCounts = {
    maleTotal: 0, femaleTotal: 0, total: 0,
    attendedMale: 0, attendedFemale: 0, attendedTotal: 0,
    absentMale: 0, absentFemale: 0, absentTotal: 0
};

export const DailyReport: React.FC<DailyReportProps> = ({ date, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  
  // Note Inputs State
  const [notes, setNotes] = useState({
      morning1: '',
      morning2: '',
      afternoon: '',
      other: '',
      teacherName: ''
  });

  useEffect(() => {
    fetchData();
  }, [date]);

  const fetchData = async () => {
    setLoading(true);
    try {
        const studentsSnap = await getDocs(collection(db, 'students'));
        const students = studentsSnap.docs.map(doc => mapStudentData(doc.id, doc.data()));

        const q = query(collection(db, 'attendance'), where('date', '==', date));
        const attSnap = await getDocs(q);
        const attendanceRecords = attSnap.docs.map(doc => doc.data() as AttendanceRecord);

        const data: ReportData = {
            grades: {},
            summaryK: { ...INITIAL_STATS },
            summaryP: { ...INITIAL_STATS },
            grandTotal: { ...INITIAL_STATS, percent: '0.00' }
        };

        Object.values(DB_TO_REPORT_GRADE).forEach(reportLabel => {
            data.grades[reportLabel] = { ...INITIAL_STATS };
        });

        students.forEach(s => {
            const reportGrade = DB_TO_REPORT_GRADE[s.grade];
            if (reportGrade && data.grades[reportGrade]) {
                const target = data.grades[reportGrade];
                if (s.gender === Gender.MALE) target.maleTotal++;
                else target.femaleTotal++;
                target.total++;
            }
        });

        attendanceRecords.forEach(att => {
            const reportGrade = DB_TO_REPORT_GRADE[att.grade];
            if (reportGrade && data.grades[reportGrade]) {
                const target = data.grades[reportGrade];
                const isPresent = att.status === AttendanceStatus.PRESENT || att.status === AttendanceStatus.LATE;
                const isAbsent = [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.PERSONAL].includes(att.status);

                if (isPresent) {
                    if (att.gender === Gender.MALE) target.attendedMale++;
                    else target.attendedFemale++;
                    target.attendedTotal++;
                } else if (isAbsent) {
                    if (att.gender === Gender.MALE) target.absentMale++;
                    else target.absentFemale++;
                    target.absentTotal++;
                }
            }
        });

        const sum = (source: StatCounts, target: StatCounts) => {
            target.maleTotal += source.maleTotal;
            target.femaleTotal += source.femaleTotal;
            target.total += source.total;
            target.attendedMale += source.attendedMale;
            target.attendedFemale += source.attendedFemale;
            target.attendedTotal += source.attendedTotal;
            target.absentMale += source.absentMale;
            target.absentFemale += source.absentFemale;
            target.absentTotal += source.absentTotal;
        };

        ['อนุบาล 2', 'อนุบาล 3'].forEach(dbGrade => {
            const label = DB_TO_REPORT_GRADE[dbGrade];
            if (data.grades[label]) sum(data.grades[label], data.summaryK);
        });

        ['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 
         'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'].forEach(dbGrade => {
            const label = DB_TO_REPORT_GRADE[dbGrade];
            if (data.grades[label]) sum(data.grades[label], data.summaryP);
        });

        sum(data.summaryK, data.grandTotal);
        sum(data.summaryP, data.grandTotal);

        if (data.grandTotal.total > 0) {
            data.grandTotal.percent = ((data.grandTotal.attendedTotal / data.grandTotal.total) * 100).toFixed(2);
        }

        setReportData(data);

    } catch (error) {
        console.error("Error generating report", error);
    } finally {
        setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    const input = document.getElementById('report-content');
    if (!input) return;

    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const canvas = await html2canvas(input, {
            scale: 3,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: input.scrollWidth,
            windowHeight: input.scrollHeight
        });
        
        const imgData = canvas.toDataURL('image/png', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const ratio = imgProps.width / imgProps.height;
        const width = pdfWidth;
        const height = width / ratio;
        
        pdf.addImage(imgData, 'PNG', 0, 0, width, height);
        pdf.save(`daily-report-${date}.pdf`);
    } catch (error) {
        console.error("Export failed", error);
        alert("ไม่สามารถสร้างไฟล์ PDF ได้");
    } finally {
        setIsExporting(false);
    }
  };

  if (loading || !reportData) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-brand-600"/>
              <p className="text-gray-500 font-medium">กำลังประมวลผลข้อมูลรายงาน...</p>
          </div>
      );
  }

  const dateObj = new Date(date);
  const thaiDays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  
  const dayStr = thaiDays[dateObj.getDay()];
  const dateStr = dateObj.getDate();
  const monthStr = thaiMonths[dateObj.getMonth()];
  const yearStr = dateObj.getFullYear() + 543;

  return (
    <div className="report-wrapper">
        <style>{REPORT_STYLES}</style>

        {/* Toolbar */}
        <div className="fixed top-0 left-0 right-0 p-4 bg-white/90 backdrop-blur shadow-md flex justify-between items-center z-50 no-print">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-black font-bold transition-colors">
                    <ArrowLeft className="w-5 h-5"/> ย้อนกลับ
                </button>
                <div className="h-6 w-px bg-gray-300"></div>
                <span className="font-bold text-gray-800">รายงานประจำวัน ({date})</span>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={handleExportPDF} 
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-6 py-2 rounded-full font-bold shadow-sm transition-all"
                >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                    บันทึก PDF
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-full font-bold shadow-sm transition-all">
                    <Printer className="w-4 h-4"/> พิมพ์รายงาน
                </button>
            </div>
        </div>

        {/* Paper Container */}
        <div id="report-content" className="report-container">
            <header className="report-header leading-relaxed">
                <h3>สถิตินักเรียนและการปฏิบัติหน้าที่ของครูเวรประจำวัน</h3>
                <p>โรงเรียนประชาสามัคคี สำนักงานเขตพื้นที่การศึกษาประถมศึกษาพระนครศรีอยุธยา เขต 1</p>
                <p>ประจำวัน {dayStr} ที่ {dateStr} เดือน {monthStr} พ.ศ. {yearStr}</p>
            </header>

            <table className="attendance-table report-table">
                <thead>
                    <tr>
                        <th rowSpan={2} style={{ width: '30%' }}>ชั้น</th>
                        <th colSpan={3}>จำนวนเต็ม</th>
                        <th colSpan={3}>มาเรียน</th>
                        <th colSpan={3}>ขาดเรียน</th>
                        <th rowSpan={2} style={{ width: '15%' }}>หมายเหตุ</th>
                    </tr>
                    <tr>
                        <th>ชาย</th>
                        <th>หญิง</th>
                        <th>รวม</th>
                        <th>ชาย</th>
                        <th>หญิง</th>
                        <th>รวม</th>
                        <th>ชาย</th>
                        <th>หญิง</th>
                        <th>รวม</th>
                    </tr>
                </thead>
                <tbody>
                    {/* อนุบาล */}
                    {['อนุบาล 2', 'อนุบาล 3'].map((gradeKey, index) => {
                        const label = DB_TO_REPORT_GRADE[gradeKey];
                        const d = reportData.grades[label];
                        return (
                            <tr key={label}>
                                <td style={{ textAlign: 'left', paddingLeft: '10px' }}>{label}</td>
                                <td>{d.maleTotal || ''}</td>
                                <td>{d.femaleTotal || ''}</td>
                                <td>{d.total || ''}</td>
                                <td>{d.attendedMale || ''}</td>
                                <td>{d.attendedFemale || ''}</td>
                                <td>{d.attendedTotal || ''}</td>
                                <td>{d.absentMale || ''}</td>
                                <td>{d.absentFemale || ''}</td>
                                <td>{d.absentTotal || ''}</td>
                                <td></td>
                            </tr>
                        );
                    })}

                    <tr className="summary-row">
                        <td>รวมอนุบาล</td>
                        <td>{reportData.summaryK.maleTotal}</td>
                        <td>{reportData.summaryK.femaleTotal}</td>
                        <td>{reportData.summaryK.total}</td>
                        <td>{reportData.summaryK.attendedMale || ''}</td>
                        <td>{reportData.summaryK.attendedFemale || ''}</td>
                        <td>{reportData.summaryK.attendedTotal || ''}</td>
                        <td>{reportData.summaryK.absentMale || ''}</td>
                        <td>{reportData.summaryK.absentFemale || ''}</td>
                        <td>{reportData.summaryK.absentTotal || ''}</td>
                        <td></td>
                    </tr>

                    {/* ประถม */}
                    {['ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'].map((gradeKey, index) => {
                        const label = DB_TO_REPORT_GRADE[gradeKey];
                        const d = reportData.grades[label];
                        return (
                            <tr key={label}>
                                <td style={{ textAlign: 'left', paddingLeft: '10px' }}>{label}</td>
                                <td>{d.maleTotal || ''}</td>
                                <td>{d.femaleTotal || ''}</td>
                                <td>{d.total || ''}</td>
                                <td>{d.attendedMale || ''}</td>
                                <td>{d.attendedFemale || ''}</td>
                                <td>{d.attendedTotal || ''}</td>
                                <td>{d.absentMale || ''}</td>
                                <td>{d.absentFemale || ''}</td>
                                <td>{d.absentTotal || ''}</td>
                                <td></td>
                            </tr>
                        );
                    })}

                    <tr className="summary-row">
                        <td>รวมประถมศึกษา</td>
                        <td>{reportData.summaryP.maleTotal}</td>
                        <td>{reportData.summaryP.femaleTotal}</td>
                        <td>{reportData.summaryP.total}</td>
                        <td>{reportData.summaryP.attendedMale || ''}</td>
                        <td>{reportData.summaryP.attendedFemale || ''}</td>
                        <td>{reportData.summaryP.attendedTotal || ''}</td>
                        <td>{reportData.summaryP.absentMale || ''}</td>
                        <td>{reportData.summaryP.absentFemale || ''}</td>
                        <td>{reportData.summaryP.absentTotal || ''}</td>
                        <td></td>
                    </tr>

                    <tr className="grand-total-row">
                        <td>รวมนักเรียนทั้งสิ้น</td>
                        <td>{reportData.grandTotal.maleTotal}</td>
                        <td>{reportData.grandTotal.femaleTotal}</td>
                        <td>{reportData.grandTotal.total}</td>
                        <td>{reportData.grandTotal.attendedMale || ''}</td>
                        <td>{reportData.grandTotal.attendedFemale || ''}</td>
                        <td>{reportData.grandTotal.attendedTotal || ''}</td>
                        <td>{reportData.grandTotal.absentMale || ''}</td>
                        <td>{reportData.grandTotal.absentFemale || ''}</td>
                        <td>{reportData.grandTotal.absentTotal || ''}</td>
                        <td style={{ textAlign: 'left', paddingLeft: '5px' }}>ร้อยละ {reportData.grandTotal.percent}</td>
                    </tr>
                </tbody>
            </table>

            <div className="duty-notes leading-relaxed">
                <p className="note-header">● บันทึกครูเวรประจำวัน</p>
                <div className="note-content leading-relaxed">
                    <p>เวลา 07.30 น. ควบคุม แนะนำการทำความสะอาดอาคารเรียน บริเวณโรงเรียนและอื่น</p>
                    <p>เวลา 08.00 น. ให้สัญญาณเข้าแถว ควบคุมการเข้าแถว เคารพธงชาติ ทำกิจกรรมประจำวัน</p>
                    
                    {/* Notes Section 1: 1 and 2 Alignment */}
                    <table className="form-table">
                        <tbody>
                            <tr>
                                <td style={{ width: '1%', whiteSpace: 'nowrap' }}>อบรมนักเรียนหน้าเสาธง เรื่อง</td>
                                <td style={{ width: '1%', whiteSpace: 'nowrap', padding: '0 5px' }}>1</td>
                                <td className="input-col">
                                    <input 
                                        type="text" 
                                        className="dotted-input"
                                        value={notes.morning1}
                                        onChange={(e) => setNotes({...notes, morning1: e.target.value})}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td></td>
                                <td style={{ width: '1%', whiteSpace: 'nowrap', padding: '0 5px' }}>2</td>
                                <td className="input-col">
                                    <input 
                                        type="text" 
                                        className="dotted-input"
                                        value={notes.morning2}
                                        onChange={(e) => setNotes({...notes, morning2: e.target.value})}
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <p>เวลา 08.30 น. เข้าห้องเรียน</p>
                    <p>เวลา 11.30 น. พักกลางวัน / ทำกิจกรรม</p>
                    
                    {/* Afternoon Time Alignment */}
                    <div className="note-time-row">
                         <div style={{ width: '26mm', flexShrink: 0 }}>เวลา 12.15 น. </div>
                         <div>ให้สัญญาณตีระฆังเข้าเรียนช่วงบ่ายและอบรมเพิ่มเติม</div>
                    </div>

                    <table className="form-table">
                        <tbody>
                            <tr>
                                <td style={{ width: '26mm' }}></td>
                                <td style={{ width: '1%', whiteSpace: 'nowrap', paddingRight: '5px' }}>เรื่อง</td>
                                <td className="input-col">
                                    <input 
                                        type="text" 
                                        className="dotted-input"
                                        value={notes.afternoon}
                                        onChange={(e) => setNotes({...notes, afternoon: e.target.value})}
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <p>เวลา 15.20 น. ให้สัญญาณตีระฆังกลับบ้าน / ควบคุมการเดินแถวกลับบ้าน</p>

                    <table className="form-table">
                        <tbody>
                            <tr>
                                <td style={{ width: '1%', whiteSpace: 'nowrap', paddingRight: '5px' }}>เรื่องอื่น ๆ (ถ้ามี)</td>
                                <td className="input-col">
                                    <input 
                                        type="text" 
                                        className="dotted-input"
                                        value={notes.other}
                                        onChange={(e) => setNotes({...notes, other: e.target.value})}
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="signature-area">
                <div className="signature-wrapper">
                    <div className="signature-block">
                        <div className="signature-grid">
                            <div style={{ textAlign: 'right' }}>ลงชื่อ</div>
                            <div className="border-b border-dotted border-black w-full relative">
                                <input 
                                    type="text" 
                                    className="w-full text-center bg-transparent outline-none border-none font-sarabun text-current p-0 h-auto leading-normal"
                                    style={{ fontSize: 'inherit' }}
                                    placeholder=""
                                    value={notes.teacherName}
                                    onChange={(e) => setNotes({...notes, teacherName: e.target.value})}
                                />
                            </div>
                            <div style={{ textAlign: 'left' }}>ครูเวรประจำวัน</div>

                            <div></div>
                            <div style={{ textAlign: 'center' }}>( {notes.teacherName || '...................................................'} )</div>
                            <div></div>
                        </div>
                    </div>
                    <div className="signature-block">
                        <div className="signature-grid">
                            <div style={{ textAlign: 'right' }}>ลงชื่อ</div>
                            <div style={{ textAlign: 'center' }}>..................................................</div>
                            <div style={{ textAlign: 'left' }}>ผู้อำนวยการ</div>

                            <div></div>
                            <div style={{ textAlign: 'center' }}>(นางสาวจินดา พลีรักษ์)</div>
                            <div></div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
};
