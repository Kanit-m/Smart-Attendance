import { useState, useCallback } from 'react';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { TeacherXP, XPAction, XPHistoryEntry, AppUser } from '../types';
import {
    calculateLevel,
    createEmptyTeacherXP,
    limitXpHistory,
    XP_VALUES,
    calculateStreakMultiplier
} from '../utils/xpCalculator';

const XP_COLLECTION = 'teacher_xp';

export function useTeacherXP() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Get XP data for a single teacher
     */
    const getTeacherXP = useCallback(async (teacherId: string): Promise<TeacherXP | null> => {
        try {
            const docRef = doc(db, XP_COLLECTION, teacherId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as TeacherXP;
            }
            return null;
        } catch (e) {
            console.error('Error getting teacher XP:', e);
            return null;
        }
    }, []);

    /**
     * Get all teachers' XP data
     */
    const getAllTeacherXP = useCallback(async (): Promise<TeacherXP[]> => {
        setLoading(true);
        try {
            const q = query(collection(db, XP_COLLECTION), orderBy('totalXp', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => d.data() as TeacherXP);
        } catch (e) {
            console.error('Error getting all teacher XP:', e);
            setError('ไม่สามารถโหลดข้อมูล XP ได้');
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Add XP to a teacher (with delegation logic)
     * @param recipientTeacherId - ครูที่จะได้รับ XP (ครูประจำชั้น/ครูเวร)
     * @param recipientTeacherName - ชื่อครูผู้รับ XP
     * @param action - ประเภท action
     * @param description - คำอธิบาย
     * @param fromTeacher - ครูผู้ช่วยที่ช่วยทำ (ถ้ามี)
     */
    const addXP = useCallback(async (
        recipientTeacherId: string,
        recipientTeacherName: string,
        action: XPAction,
        description: string,
        fromTeacher?: string
    ): Promise<{ success: boolean; newXp?: number; levelUp?: boolean }> => {
        try {
            const docRef = doc(db, XP_COLLECTION, recipientTeacherId);
            const docSnap = await getDoc(docRef);

            let teacherXP: TeacherXP;
            if (docSnap.exists()) {
                teacherXP = docSnap.data() as TeacherXP;
            } else {
                teacherXP = createEmptyTeacherXP(recipientTeacherId, recipientTeacherName);
            }

            const oldLevel = teacherXP.level;
            const today = new Date().toLocaleDateString('sv-SE');

            // Calculate streak
            if (teacherXP.lastActionDate) {
                const lastDate = new Date(teacherXP.lastActionDate);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toLocaleDateString('sv-SE');

                if (teacherXP.lastActionDate === today) {
                    // Same day, don't increment streak
                } else if (teacherXP.lastActionDate === yesterdayStr) {
                    // Consecutive day, increment streak
                    teacherXP.currentStreak += 1;
                } else {
                    // Streak broken, reset to 1
                    teacherXP.currentStreak = 1;
                }
            } else {
                teacherXP.currentStreak = 1;
            }

            // Update longest streak
            if (teacherXP.currentStreak > teacherXP.longestStreak) {
                teacherXP.longestStreak = teacherXP.currentStreak;
            }

            // Calculate XP with streak multiplier
            const baseXp = XP_VALUES[action];
            const multiplier = calculateStreakMultiplier(teacherXP.currentStreak);
            const earnedXp = Math.round(baseXp * multiplier);

            // Create history entry
            const historyEntry: XPHistoryEntry = {
                date: today,
                xp: earnedXp,
                action,
                fromTeacher,
                description
            };

            // Update teacher XP data
            teacherXP.totalXp += earnedXp;
            teacherXP.level = calculateLevel(teacherXP.totalXp);
            teacherXP.lastActionDate = today;
            teacherXP.xpHistory = limitXpHistory([...teacherXP.xpHistory, historyEntry]);
            teacherXP.updatedAt = Date.now();

            // Save to Firestore
            await setDoc(docRef, teacherXP);

            return {
                success: true,
                newXp: earnedXp,
                levelUp: teacherXP.level > oldLevel
            };
        } catch (e) {
            console.error('Error adding XP:', e);
            return { success: false };
        }
    }, []);

    /**
     * Get the teacher who should receive XP based on position
     * @param recorder - ครูผู้บันทึก
     * @param classTeacher - ครูประจำชั้น
     * @param dutyTeachers - ครูเวรวันนั้น
     * @param actionType - 'attendance' or 'print'
     */
    const getXpRecipient = useCallback((
        recorder: AppUser,
        classTeacher: AppUser | null,
        dutyTeachers: AppUser[],
        actionType: 'attendance' | 'print'
    ): { recipientId: string; recipientName: string; fromTeacher?: string } | null => {
        // If recorder is permanent teacher, they get XP
        if (recorder.position === 'permanent') {
            return {
                recipientId: recorder.id,
                recipientName: recorder.name
            };
        }

        // If recorder is assistant teacher, delegate XP
        if (recorder.position === 'assistant') {
            if (actionType === 'attendance' && classTeacher && classTeacher.position === 'permanent') {
                // Attendance XP goes to class teacher
                return {
                    recipientId: classTeacher.id,
                    recipientName: classTeacher.name,
                    fromTeacher: recorder.name
                };
            } else if (actionType === 'print') {
                // Print XP goes to first permanent duty teacher
                const permanentDuty = dutyTeachers.find(t => t.position === 'permanent');
                if (permanentDuty) {
                    return {
                        recipientId: permanentDuty.id,
                        recipientName: permanentDuty.name,
                        fromTeacher: recorder.name
                    };
                }
            }
        }

        // No position set - treat as permanent (default behavior)
        if (!recorder.position) {
            return {
                recipientId: recorder.id,
                recipientName: recorder.name
            };
        }

        return null;
    }, []);

    return {
        loading,
        error,
        getTeacherXP,
        getAllTeacherXP,
        addXP,
        getXpRecipient
    };
}
