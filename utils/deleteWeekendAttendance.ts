/**
 * Utility script to delete weekend attendance records from Firestore
 * 
 * Usage: 
 * 1. Import this function in browser console or create a temporary button in AdminPanel
 * 2. Call deleteWeekendAttendance('2026-01-10') to delete all records for that date
 * 
 * Example dates with weekend records:
 * - 2026-01-10 (Saturday)
 */

import { collection, query, where, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore/lite';
import { db } from '../firebase';

/**
 * Delete all attendance records for a specific date
 * @param dateStr - The date string in format 'YYYY-MM-DD'
 * @returns Promise with deleted count
 */
export async function deleteAttendanceByDate(dateStr: string): Promise<{ deletedCount: number; deletedGrades: string[] }> {
    // Validate date is weekend
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        throw new Error(`${dateStr} is not a weekend day. Only weekend (Saturday/Sunday) records can be deleted with this utility.`);
    }

    try {
        // Query all attendance records for this date
        const q = query(collection(db, 'attendance'), where('date', '==', dateStr));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return { deletedCount: 0, deletedGrades: [] };
        }

        // Group by grade for logging
        const gradeSet = new Set<string>();
        snapshot.docs.forEach(d => {
            const data = d.data();
            if (data.grade) gradeSet.add(data.grade);
        });

        // Delete all documents in batch
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => {
            batch.delete(doc(db, 'attendance', d.id));
        });
        await batch.commit();

        return {
            deletedCount: snapshot.docs.length,
            deletedGrades: Array.from(gradeSet)
        };
    } catch (error) {
        console.error('Error deleting weekend attendance:', error);
        throw error;
    }
}

/**
 * Find all weekend dates that have attendance records (should not exist)
 * @param startDate - Start date in 'YYYY-MM-DD' format
 * @param endDate - End date in 'YYYY-MM-DD' format
 * @returns Promise with list of weekend dates that have records
 */
export async function findWeekendAttendanceRecords(startDate: string, endDate: string): Promise<{ date: string; count: number }[]> {
    try {
        const q = query(
            collection(db, 'attendance'),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
        const snapshot = await getDocs(q);

        // Group by date and filter weekends
        const dateCount = new Map<string, number>();
        snapshot.docs.forEach(d => {
            const data = d.data();
            const date = new Date(data.date);
            const dayOfWeek = date.getDay();

            // Only count weekend days
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                dateCount.set(data.date, (dateCount.get(data.date) || 0) + 1);
            }
        });

        return Array.from(dateCount.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
        console.error('Error finding weekend attendance:', error);
        throw error;
    }
}
