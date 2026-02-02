import { TeacherXP, XPAction, XPHistoryEntry } from '../types';

// XP amounts for each action
export const XP_VALUES: Record<XPAction, number> = {
    attendance_ontime: 10,    // บันทึกก่อน 09:00
    attendance_normal: 5,     // บันทึกภายในวัน
    attendance_late: 2,       // บันทึกย้อนหลัง
    print_duty: 15,           // พิมพ์รายงาน (เวรตัวเอง)
    print_substitute: 10,     // พิมพ์แทน
    bonus_week: 50,           // Perfect Week
    bonus_month: 200          // Perfect Month
};

/**
 * Calculate level from total XP
 * Formula: Level = floor(sqrt(XP / 100))
 * Starts at Level 0 when XP = 0
 */
export function calculateLevel(xp: number): number {
    if (xp <= 0) return 0;
    return Math.floor(Math.sqrt(xp / 100));
}

/**
 * Get total XP required to reach a specific level
 * Formula: XP = level^2 * 100
 */
export function getXpForLevel(level: number): number {
    if (level <= 0) return 0;
    return Math.pow(level, 2) * 100;
}

/**
 * Get XP required for next level
 */
export function getXpForNextLevel(currentLevel: number): number {
    return getXpForLevel(currentLevel + 1);
}

/**
 * Get XP progress towards next level
 */
export function getXpProgress(xp: number): {
    currentLevelXp: number;
    nextLevelXp: number;
    progress: number;
    percent: number;
} {
    const level = calculateLevel(xp);
    const currentLevelXp = getXpForLevel(level);
    const nextLevelXp = getXpForLevel(level + 1);
    const progress = xp - currentLevelXp;
    const required = nextLevelXp - currentLevelXp;
    const percent = required > 0 ? Math.round((progress / required) * 100) : 100;

    return {
        currentLevelXp,
        nextLevelXp,
        progress,
        percent
    };
}

/**
 * Calculate streak multiplier
 * Formula: 1 + (streak_days / 100), max 2x
 */
export function calculateStreakMultiplier(streak: number): number {
    return Math.min(2, 1 + (streak / 100));
}

/**
 * Get XP for attendance recording based on time
 */
export function getAttendanceXpType(recordDate: string, recordTimestamp: number): XPAction {
    const recordDateObj = new Date(recordDate + 'T00:00:00');
    const now = new Date(recordTimestamp);

    // Check if recording is on a different day (late/retroactive)
    const recordDateStr = recordDateObj.toLocaleDateString('sv-SE');
    const nowDateStr = now.toLocaleDateString('sv-SE');

    if (recordDateStr !== nowDateStr) {
        return 'attendance_late';
    }

    // Check if before 09:00
    const hour = now.getHours();
    if (hour < 9) {
        return 'attendance_ontime';
    }

    return 'attendance_normal';
}

/**
 * Create a new XP history entry
 */
export function createXpEntry(
    action: XPAction,
    description: string,
    fromTeacher?: string
): XPHistoryEntry {
    const now = new Date();
    return {
        date: now.toLocaleDateString('sv-SE'),
        xp: XP_VALUES[action],
        action,
        fromTeacher,
        description
    };
}

/**
 * Calculate XP with streak multiplier and create entry
 */
export function calculateXpWithStreak(
    action: XPAction,
    streak: number
): number {
    const baseXp = XP_VALUES[action];
    const multiplier = calculateStreakMultiplier(streak);
    return Math.round(baseXp * multiplier);
}

/**
 * Create empty TeacherXP object for new teacher
 */
export function createEmptyTeacherXP(teacherId: string, teacherName: string): TeacherXP {
    return {
        teacherId,
        teacherName,
        totalXp: 0,
        level: 0,  // Start at Level 0
        currentStreak: 0,
        longestStreak: 0,
        lastActionDate: '',
        xpHistory: [],
        updatedAt: Date.now()
    };
}

/**
 * Limit XP history to 50 entries
 */
export function limitXpHistory(history: XPHistoryEntry[]): XPHistoryEntry[] {
    return history.slice(-50);
}

/**
 * Get level title/rank
 */
export function getLevelTitle(level: number): string {
    if (level >= 10) return '🏆 ตำนาน';
    if (level >= 8) return '⭐ ผู้เชี่ยวชาญ';
    if (level >= 6) return '🎯 มืออาชีพ';
    if (level >= 4) return '📈 ก้าวหน้า';
    if (level >= 2) return '🌱 เริ่มต้น';
    if (level >= 1) return '🆕 มือใหม่';
    return '👤 ยังไม่มี XP';
}
