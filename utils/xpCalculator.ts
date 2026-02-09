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

// Max level cap (Ragnarok style!)
export const MAX_LEVEL = 99;

/**
 * Calculate level from total XP
 * Formula: Level = floor(sqrt(XP / 4)), capped at 99
 * ~40,000 XP to reach level 99 (3-5 years of consistent work)
 */
export function calculateLevel(xp: number): number {
    if (xp <= 0) return 1; // Start at Level 1 like RO
    const level = Math.floor(Math.sqrt(xp / 4));
    return Math.min(MAX_LEVEL, Math.max(1, level));
}

/**
 * Get total XP required to reach a specific level
 * Formula: XP = level^2 * 4
 */
export function getXpForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.pow(level, 2) * 4;
}

/**
 * Get XP required for next level
 */
export function getXpForNextLevel(currentLevel: number): number {
    if (currentLevel >= MAX_LEVEL) return getXpForLevel(MAX_LEVEL);
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
    isMaxLevel: boolean;
} {
    const level = calculateLevel(xp);
    const isMaxLevel = level >= MAX_LEVEL;
    const currentLevelXp = getXpForLevel(level);
    const nextLevelXp = isMaxLevel ? getXpForLevel(MAX_LEVEL) : getXpForLevel(level + 1);
    const progress = xp - currentLevelXp;
    const required = nextLevelXp - currentLevelXp;
    const percent = isMaxLevel ? 100 : (required > 0 ? Math.round((progress / required) * 100) : 100);

    return {
        currentLevelXp,
        nextLevelXp,
        progress,
        percent,
        isMaxLevel
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
        level: 1,  // Start at Level 1 like RO
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
 * Get level title/rank (Ragnarok Online inspired!)
 */
export function getLevelTitle(level: number): string {
    if (level >= 99) return '👑 ตำนานแห่งโรงเรียน';
    if (level >= 90) return '🌟 Transcendent';
    if (level >= 80) return '⚔️ High Master';
    if (level >= 70) return '🏆 Master';
    if (level >= 60) return '💎 Expert';
    if (level >= 50) return '⭐ Veteran';
    if (level >= 40) return '🎯 Professional';
    if (level >= 30) return '📈 Advanced';
    if (level >= 20) return '🌱 Intermediate';
    if (level >= 10) return '🆕 Beginner';
    return '👤 Novice';
}

/**
 * Get level color gradient based on level
 */
export function getLevelColor(level: number): string {
    if (level >= 99) return 'from-yellow-400 via-amber-500 to-orange-500'; // Legendary gold
    if (level >= 90) return 'from-purple-500 via-pink-500 to-rose-500';    // Transcendent
    if (level >= 80) return 'from-red-500 to-rose-600';                     // High Master
    if (level >= 70) return 'from-orange-500 to-amber-500';                 // Master
    if (level >= 60) return 'from-cyan-500 to-blue-500';                    // Expert
    if (level >= 50) return 'from-emerald-500 to-teal-500';                 // Veteran
    if (level >= 40) return 'from-blue-500 to-indigo-500';                  // Professional
    if (level >= 30) return 'from-violet-500 to-purple-500';                // Advanced
    if (level >= 20) return 'from-green-500 to-emerald-500';                // Intermediate
    if (level >= 10) return 'from-sky-500 to-blue-500';                     // Beginner
    return 'from-gray-400 to-gray-500';                                      // Novice
}
