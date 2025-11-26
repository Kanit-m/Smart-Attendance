import React from 'react';
import { Student, AttendanceRecord, AttendanceStatus, Gender } from '../types';
import { AttendanceHeatmap } from './AttendanceHeatmap';
import { User, ChevronRight } from 'lucide-react';

interface StudentHistoryCardProps {
    student: Student;
    records: AttendanceRecord[];
    stats: {
        present: number;
        absent: number;
        late: number;
        sick: number;
        personal: number;
        total: number;
    };
    onClick: () => void;
}

export const StudentHistoryCard: React.FC<StudentHistoryCardProps> = ({ student, records, stats, onClick }) => {
    const percent = stats.total > 0
        ? Math.round(((stats.present + stats.late) / stats.total) * 100)
        : 0;

    const getPercentColor = (p: number) => {
        if (p >= 80) return 'text-emerald-600 bg-emerald-50';
        if (p >= 60) return 'text-yellow-600 bg-yellow-50';
        return 'text-rose-600 bg-rose-50';
    };

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 active:scale-98 transition-all cursor-pointer hover:shadow-md"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${student.gender === Gender.MALE ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                        {student.number}
                    </div>
                    <div>
                        <div className="font-bold text-gray-800">{student.name}</div>
                        <div className="text-xs text-gray-400">{student.studentId}</div>
                    </div>
                </div>
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${getPercentColor(percent)}`}>
                    {percent}%
                </div>
            </div>

            {/* Mini Stats Grid */}
            <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                    <div className="text-[10px] text-gray-400">มา</div>
                    <div className="font-bold text-emerald-600">{stats.present}</div>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                    <div className="text-[10px] text-gray-400">สาย</div>
                    <div className="font-bold text-yellow-600">{stats.late}</div>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                    <div className="text-[10px] text-gray-400">ลา</div>
                    <div className="font-bold text-blue-600">{stats.sick + stats.personal}</div>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded-lg">
                    <div className="text-[10px] text-gray-400">ขาด</div>
                    <div className="font-bold text-rose-600">{stats.absent}</div>
                </div>
            </div>

            {/* Heatmap & Action */}
            <div className="flex items-center justify-between gap-4">
                <AttendanceHeatmap
                    records={records.map(r => ({ date: r.date, status: r.status }))}
                    days={14} // Show last 2 weeks on mobile card
                    className="opacity-80"
                />
                <ChevronRight className="w-5 h-5 text-gray-300" />
            </div>
        </div>
    );
};
