import React from 'react';
import { AttendanceStatus } from '../types';

interface AttendanceHeatmapProps {
    records: { date: string; status: AttendanceStatus }[];
    days: number; // Total days to show (e.g., last 30 days)
    className?: string;
}

export const AttendanceHeatmap: React.FC<AttendanceHeatmapProps> = ({ records, days, className = '' }) => {
    // Create an array of the last 'days' dates
    const dateArray = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        return d.toISOString().split('T')[0];
    });

    const getStatusColor = (status?: AttendanceStatus) => {
        switch (status) {
            case AttendanceStatus.PRESENT: return 'bg-emerald-400';
            case AttendanceStatus.LATE: return 'bg-yellow-400';
            case AttendanceStatus.SICK: return 'bg-blue-400';
            case AttendanceStatus.PERSONAL: return 'bg-purple-400';
            case AttendanceStatus.ABSENT: return 'bg-rose-400';
            default: return 'bg-gray-100';
        }
    };

    const getStatusTitle = (date: string, status?: AttendanceStatus) => {
        const dateStr = new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        if (!status) return `${dateStr}: ไม่มีข้อมูล`;

        switch (status) {
            case AttendanceStatus.PRESENT: return `${dateStr}: มา`;
            case AttendanceStatus.LATE: return `${dateStr}: สาย`;
            case AttendanceStatus.SICK: return `${dateStr}: ป่วย`;
            case AttendanceStatus.PERSONAL: return `${dateStr}: ลา`;
            case AttendanceStatus.ABSENT: return `${dateStr}: ขาด`;
            default: return `${dateStr}: -`;
        }
    };

    return (
        <div className={`flex gap-1 ${className}`}>
            {dateArray.map(date => {
                const record = records.find(r => r.date === date);
                return (
                    <div
                        key={date}
                        className={`w-2 h-4 sm:w-3 sm:h-6 rounded-sm ${getStatusColor(record?.status)} transition-all hover:scale-125 hover:z-10`}
                        title={getStatusTitle(date, record?.status)}
                    />
                );
            })}
        </div>
    );
};
