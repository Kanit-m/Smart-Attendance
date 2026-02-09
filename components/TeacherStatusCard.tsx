import React from 'react';
import { User, Calendar, Printer, ClipboardCheck, Flame, Moon, AlertTriangle, CheckCircle, XCircle, Zap, TrendingUp, Star } from 'lucide-react';
import { AppUser, TeacherXP } from '../types';
import { getXpProgress, getLevelTitle, getLevelColor, calculateLevel, MAX_LEVEL } from '../utils/xpCalculator';

interface TeacherStatusCardProps {
  teacher: AppUser;
  dutyDays: string[]; // ['monday', 'friday']
  attendanceStats: {
    recordedDays: number;
    totalWorkDays: number;
    todayRecorded: boolean;
  };
  printStats: {
    printedDays: number;
    totalDutyDays: number;
    missingPrintDays: string[];
  };
  isTodayDuty: boolean;
  xpData?: TeacherXP; // Optional XP data
}

const DAY_LABELS: Record<string, string> = {
  monday: 'จ.',
  tuesday: 'อ.',
  wednesday: 'พ.',
  thursday: 'พฤ.',
  friday: 'ศ.'
};

const DAY_LABELS_FULL: Record<string, string> = {
  monday: 'จันทร์',
  tuesday: 'อังคาร',
  wednesday: 'พุธ',
  thursday: 'พฤหัสบดี',
  friday: 'ศุกร์'
};

export const TeacherStatusCard: React.FC<TeacherStatusCardProps> = ({
  teacher,
  dutyDays,
  attendanceStats,
  printStats,
  isTodayDuty,
  xpData
}) => {
  // Check if teacher is assistant (support role - doesn't earn XP)
  const isAssistant = teacher.position === 'assistant';

  // Calculate status level from XP if available, otherwise use percentage-based
  const attendancePercent = attendanceStats.totalWorkDays > 0
    ? Math.round((attendanceStats.recordedDays / attendanceStats.totalWorkDays) * 100)
    : 0;
  const printPercent = printStats.totalDutyDays > 0
    ? Math.round((printStats.printedDays / printStats.totalDutyDays) * 100)
    : 100; // If no duty days, consider 100%

  // Calculate XP only for non-assistant teachers
  // Formula: attendance_normal (5 XP per day) + print_duty (15 XP per duty day)
  const calculatedXp = isAssistant ? 0 : (xpData?.totalXp ?? (
    (attendanceStats.recordedDays * 5) + (printStats.printedDays * 15)
  ));

  // Calculate level from XP (starts at Level 1, assistants stay at 1)
  const level = isAssistant ? 1 : (xpData?.level ?? calculateLevel(calculatedXp));
  const xpProgress = getXpProgress(calculatedXp);
  const levelColor = isAssistant ? 'from-amber-400 to-orange-400' : getLevelColor(level);

  // Determine status effect
  type StatusEffect = 'healthy' | 'warning' | 'critical' | 'perfect';
  let statusEffect: StatusEffect = 'healthy';
  let statusColor = 'from-emerald-400 to-teal-500';
  let statusBorder = 'border-emerald-200';
  let statusGlow = 'shadow-emerald-200/50';

  const missingAttendance = attendanceStats.totalWorkDays - attendanceStats.recordedDays;
  const missingPrint = printStats.missingPrintDays.length;

  if (missingAttendance === 0 && missingPrint === 0) {
    statusEffect = 'perfect';
    statusColor = 'from-emerald-400 to-cyan-400';
    statusBorder = 'border-emerald-300';
    statusGlow = 'shadow-emerald-300/60';
  } else if (missingAttendance > 2 || missingPrint > 2) {
    statusEffect = 'critical';
    statusColor = 'from-rose-400 to-red-500';
    statusBorder = 'border-rose-300';
    statusGlow = 'shadow-rose-300/60';
  } else if (missingAttendance > 0 || missingPrint > 0) {
    statusEffect = 'warning';
    statusColor = 'from-amber-400 to-orange-500';
    statusBorder = 'border-amber-300';
    statusGlow = 'shadow-amber-300/50';
  }

  // Progress bar component
  const ProgressBar = ({ value, max, color }: { value: number; max: number; color: string }) => {
    const percent = max > 0 ? (value / max) * 100 : 0;
    return (
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  };

  // Status Icon component
  const StatusIcon = () => {
    if (statusEffect === 'perfect') {
      return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    } else if (statusEffect === 'critical') {
      return <XCircle className="w-5 h-5 text-rose-500 animate-pulse" />;
    } else if (statusEffect === 'warning') {
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    }
    return <CheckCircle className="w-5 h-5 text-emerald-500" />;
  };

  return (
    <div className={`relative bg-gradient-to-br ${statusColor} p-[2px] rounded-2xl ${statusGlow} shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl`}>
      <div className={`bg-white rounded-2xl p-5 border ${statusBorder}`}>
        {/* Header - Character Info */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${statusColor} flex items-center justify-center text-white shadow-md`}>
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800 text-lg leading-tight">{teacher.name}</h3>
                {/* Position Badge */}
                {teacher.position === 'assistant' && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    ผู้ช่วย
                  </span>
                )}
                {teacher.position === 'permanent' && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    ประจำการ
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{teacher.assignedClass || 'ไม่มีห้อง'}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {/* Level Badge with dynamic color */}
            {isAssistant ? (
              <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold shadow-md flex items-center gap-1">
                🛡️ Support
              </div>
            ) : (
              <div className={`px-2.5 py-1 rounded-lg bg-gradient-to-r ${levelColor} text-white text-xs font-bold shadow-md flex items-center gap-1`}>
                {level >= 99 && <Star className="w-3 h-3" />}
                Lv.{level}
              </div>
            )}
            {/* XP Display - Only for non-assistants */}
            {!isAssistant && (
              <div className="flex items-center gap-1 text-purple-600 text-[10px] font-bold">
                <Zap className="w-3 h-3" />
                {calculatedXp.toLocaleString()} XP
              </div>
            )}
            {/* Streak Display */}
            {xpData && xpData.currentStreak > 0 && !isAssistant && (
              <div className="flex items-center gap-1 text-orange-500 text-[10px] font-bold">
                <TrendingUp className="w-3 h-3" />
                {xpData.currentStreak} วันต่อเนื่อง
              </div>
            )}
            {isTodayDuty && (
              <div className="flex items-center gap-1 text-orange-500 text-xs font-bold animate-pulse">
                <Flame className="w-3 h-3" /> เวรวันนี้
              </div>
            )}
          </div>
        </div>

        {/* XP Progress Bar - Only for non-assistant teachers */}
        {isAssistant ? (
          <div className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
            <div className="flex items-center gap-2 text-amber-700">
              <span className="text-lg">🛡️</span>
              <div>
                <p className="text-xs font-bold">Support Role</p>
                <p className="text-[10px] text-amber-600">XP จากการทำงานไปให้ครูเวร/ครูประจำชั้น</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-bold bg-gradient-to-r ${levelColor} bg-clip-text text-transparent`}>
                {getLevelTitle(level)}
              </span>
              <span className="text-[10px] text-gray-400">
                {xpProgress.isMaxLevel ? (
                  <span className="text-amber-500 font-bold">✨ MAX LEVEL!</span>
                ) : (
                  `${xpProgress.progress} / ${xpProgress.nextLevelXp - xpProgress.currentLevelXp} XP`
                )}
              </span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
              <div
                className={`h-full bg-gradient-to-r ${levelColor} rounded-full transition-all duration-700 ease-out relative`}
                style={{ width: `${xpProgress.percent}%` }}
              >
                {/* Shine effect for high levels */}
                {level >= 50 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                )}
              </div>
            </div>
            {/* Next level hint */}
            {!xpProgress.isMaxLevel && level < 99 && (
              <div className="text-[9px] text-gray-400 mt-1 text-right">
                อีก {xpProgress.nextLevelXp - xpProgress.currentLevelXp - xpProgress.progress} XP → Lv.{level + 1}
              </div>
            )}
          </div>
        )}

        {/* Duty Days */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold text-gray-600">วันเวร</span>
          </div>
          <div className="flex gap-1">
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => {
              const isActive = dutyDays.includes(day);
              return (
                <div
                  key={day}
                  title={DAY_LABELS_FULL[day]}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${isActive
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-400'
                    }`}
                >
                  {DAY_LABELS[day]}
                </div>
              );
            })}
            {dutyDays.length === 0 && (
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <Moon className="w-3 h-3" /> ไม่มีเวร
              </div>
            )}
          </div>
        </div>

        {/* Stats Section */}
        <div className="space-y-3 mb-4">
          {/* Attendance Recording */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-gray-600">บันทึกเช็คชื่อ</span>
              </div>
              <span className={`text-xs font-bold ${attendancePercent >= 80 ? 'text-emerald-600' : attendancePercent >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {attendanceStats.recordedDays}/{attendanceStats.totalWorkDays} ({attendancePercent}%)
              </span>
            </div>
            <ProgressBar
              value={attendanceStats.recordedDays}
              max={attendanceStats.totalWorkDays}
              color={attendancePercent >= 80 ? 'bg-gradient-to-r from-blue-400 to-cyan-400' : attendancePercent >= 50 ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-rose-400 to-red-400'}
            />
          </div>

          {/* Print Reports (only if has duty) */}
          {dutyDays.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-gray-600">พิมพ์รายงาน</span>
                </div>
                <span className={`text-xs font-bold ${printPercent >= 80 ? 'text-emerald-600' : printPercent >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {printStats.printedDays}/{printStats.totalDutyDays} ({printPercent}%)
                </span>
              </div>
              <ProgressBar
                value={printStats.printedDays}
                max={printStats.totalDutyDays}
                color={printPercent >= 80 ? 'bg-gradient-to-r from-purple-400 to-pink-400' : printPercent >= 50 ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-rose-400 to-red-400'}
              />
            </div>
          )}
        </div>

        {/* Status Effects */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <StatusIcon />
            <span className={`text-xs font-bold ${statusEffect === 'perfect' ? 'text-emerald-600' :
              statusEffect === 'critical' ? 'text-rose-600' :
                statusEffect === 'warning' ? 'text-amber-600' :
                  'text-emerald-600'
              }`}>
              {statusEffect === 'perfect' && '✨ สถานะสมบูรณ์'}
              {statusEffect === 'healthy' && '✅ สถานะปกติ'}
              {statusEffect === 'warning' && `⚠️ มีงานค้าง ${missingAttendance + missingPrint} รายการ`}
              {statusEffect === 'critical' && `❌ วิกฤต! ค้าง ${missingAttendance + missingPrint} รายการ`}
            </span>
          </div>
          {attendanceStats.todayRecorded && (
            <div className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> เช็ควันนี้แล้ว
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
