// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน
// ทำงานทุก 5 นาที ในวันจันทร์-ศุกร์
// Cron: */5 5-10 * * 1-5 (UTC = 12:00-17:00 Thailand)

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    runtime: 'edge',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify cron secret (optional security)
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Get current time in Thailand timezone
        const now = new Date();
        const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const currentHour = thaiTime.getHours();
        const currentMinute = thaiTime.getMinutes();
        const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        // Check if it's weekend
        const dayOfWeek = thaiTime.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return res.status(200).json({ message: 'Weekend - skipping', time: currentTime });
        }

        // TODO: Fetch settings from Firestore and check if current time matches any schedule
        // For now, return success
        return res.status(200).json({
            message: 'Cron check completed',
            time: currentTime,
            dayOfWeek
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
