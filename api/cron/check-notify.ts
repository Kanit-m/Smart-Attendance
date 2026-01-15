// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน
// เรียกจาก cron-job.org ทุก 5 นาที
// ตรวจสอบเวลาจาก Firestore settings

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
if (getApps().length === 0) {
    // Use environment variables for Firebase Admin credentials
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
        initializeApp({
            projectId: projectId,
        });
    }
}

interface NotificationSettings {
    enabled: boolean;
    lineGroupId: string;
    lineChannelToken: string;
    schedules: Array<{ time: string; enabled: boolean; type: string }>;
    templates: { reminder: string; summary: string };
    lastSent?: { [time: string]: string }; // Track last sent date per time slot
}

export default async function handler(req: any, res: any) {
    // Get current time in Thailand timezone
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentHour = thaiTime.getHours();
    const currentMinute = thaiTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const today = thaiTime.toLocaleDateString('sv-SE');

    // Check if it's weekend
    const dayOfWeek = thaiTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return res.status(200).json({ message: 'Weekend - skipping', time: currentTime });
    }

    try {
        // Get Firestore instance
        const db = getFirestore();

        // Get notification settings from Firestore
        const settingsDoc = await db.collection('settings').doc('notifications').get();

        if (!settingsDoc.exists) {
            return res.status(200).json({ message: 'No settings found', time: currentTime });
        }

        const settings = settingsDoc.data() as NotificationSettings;

        if (!settings.enabled) {
            return res.status(200).json({ message: 'Notifications disabled', time: currentTime });
        }

        // Check if current time matches any schedule (with 5-minute tolerance)
        const currentMinutes = currentHour * 60 + currentMinute;
        let matchedSchedule = null;

        for (const schedule of settings.schedules) {
            if (!schedule.enabled) continue;

            const [schedHour, schedMin] = schedule.time.split(':').map(Number);
            const schedMinutes = schedHour * 60 + schedMin;

            // Check if within 5-minute window
            if (Math.abs(currentMinutes - schedMinutes) <= 2) {
                // Check if already sent today for this time slot
                const lastSentKey = schedule.time;
                if (settings.lastSent?.[lastSentKey] === today) {
                    continue; // Already sent today
                }
                matchedSchedule = schedule;
                break;
            }
        }

        if (!matchedSchedule) {
            return res.status(200).json({
                message: 'No matching schedule',
                time: currentTime,
                schedules: settings.schedules.map(s => s.time)
            });
        }

        // Send notification
        const message = matchedSchedule.type === 'reminder'
            ? settings.templates.reminder
            : settings.templates.summary;

        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.lineChannelToken}`
            },
            body: JSON.stringify({
                to: settings.lineGroupId,
                messages: [{ type: 'text', text: message.replace('{date}', today) }]
            })
        });

        if (lineResponse.ok) {
            // Update lastSent in Firestore to prevent duplicate sends
            await db.collection('settings').doc('notifications').update({
                [`lastSent.${matchedSchedule.time}`]: today
            });

            return res.status(200).json({
                message: 'Notification sent!',
                time: currentTime,
                type: matchedSchedule.type
            });
        } else {
            const error = await lineResponse.json();
            return res.status(500).json({ error: 'Failed to send', details: error });
        }

    } catch (error: any) {
        console.error('Cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}
