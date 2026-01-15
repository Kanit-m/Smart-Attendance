// Line Notification API - ส่งข้อความไปกลุ่ม Line
import { db } from '../firebase';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore/lite';

interface NotificationSettings {
    enabled: boolean;
    lineGroupId: string;
    lineChannelToken: string;
    schedules: Array<{ time: string; enabled: boolean; type: 'reminder' | 'summary' }>;
    templates: {
        reminder: string;
        summary: string;
    };
}

interface AttendanceSummary {
    present: number;
    absent: number;
    pendingClasses: string[];
}

// ส่งข้อความไปกลุ่ม Line
export async function sendLineMessage(token: string, groupId: string, message: string): Promise<boolean> {
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                to: groupId,
                messages: [{ type: 'text', text: message }]
            })
        });
        return response.ok;
    } catch (error) {
        console.error('Error sending Line message:', error);
        return false;
    }
}

// ดึง settings จาก Firestore
export async function getNotificationSettings(): Promise<NotificationSettings | null> {
    try {
        const docSnap = await getDoc(doc(db, 'settings', 'notifications'));
        if (docSnap.exists()) {
            return docSnap.data() as NotificationSettings;
        }
        return null;
    } catch (error) {
        console.error('Error getting notification settings:', error);
        return null;
    }
}

// ดึงสรุป attendance วันนี้
export async function getAttendanceSummary(date: string): Promise<AttendanceSummary> {
    const GRADE_OPTIONS = [
        'อนุบาล 2', 'อนุบาล 3',
        'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3',
        'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'
    ];

    try {
        // Query attendance for today
        const q = query(collection(db, 'attendance'), where('date', '==', date));
        const snapshot = await getDocs(q);

        // Count by grade and status
        const gradeCounts: Record<string, { total: number; present: number }> = {};
        GRADE_OPTIONS.forEach(g => gradeCounts[g] = { total: 0, present: 0 });

        snapshot.docs.forEach(d => {
            const data = d.data();
            const grade = data.grade as string;
            const status = data.status as string;
            if (gradeCounts[grade]) {
                gradeCounts[grade].total++;
                if (status === 'มาเรียน' || status === 'สาย') {
                    gradeCounts[grade].present++;
                }
            }
        });

        // Find grades with no records (pending)
        const pendingClasses = GRADE_OPTIONS.filter(g => gradeCounts[g].total === 0);

        // Calculate totals
        let present = 0;
        let total = 0;
        Object.values(gradeCounts).forEach(c => {
            present += c.present;
            total += c.total;
        });

        return {
            present,
            absent: total - present,
            pendingClasses
        };
    } catch (error) {
        console.error('Error getting attendance summary:', error);
        return { present: 0, absent: 0, pendingClasses: GRADE_OPTIONS };
    }
}

// สร้างข้อความจาก template
export function buildMessage(template: string, data: {
    date: string;
    present?: number;
    absent?: number;
    classes?: string;
}): string {
    return template
        .replace('{date}', data.date)
        .replace('{present}', String(data.present || 0))
        .replace('{absent}', String(data.absent || 0))
        .replace('{classes}', data.classes || 'ไม่มี');
}

// ส่งแจ้งเตือนตาม type
export async function sendNotification(type: 'reminder' | 'summary'): Promise<{ success: boolean; message: string }> {
    const settings = await getNotificationSettings();

    if (!settings || !settings.enabled) {
        return { success: false, message: 'การแจ้งเตือนถูกปิดอยู่' };
    }

    if (!settings.lineGroupId || !settings.lineChannelToken) {
        return { success: false, message: 'ยังไม่ได้ตั้งค่า Line' };
    }

    const today = new Date().toLocaleDateString('sv-SE');
    const thaiDate = new Date().toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const summary = await getAttendanceSummary(today);

    let message: string;
    if (type === 'reminder') {
        if (summary.pendingClasses.length === 0) {
            return { success: true, message: 'บันทึกครบทุกห้องแล้ว' };
        }
        message = buildMessage(settings.templates.reminder, {
            date: thaiDate,
            classes: summary.pendingClasses.map(c => `• ${c}`).join('\n')
        });
    } else {
        message = buildMessage(settings.templates.summary, {
            date: thaiDate,
            present: summary.present,
            absent: summary.absent
        });
    }

    const sent = await sendLineMessage(settings.lineChannelToken, settings.lineGroupId, message);

    return {
        success: sent,
        message: sent ? 'ส่งสำเร็จ' : 'ส่งไม่สำเร็จ'
    };
}
