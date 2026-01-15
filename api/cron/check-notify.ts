// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน

export default function handler(req: any, res: any) {
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
    return res.status(200).json({
        message: 'Cron check completed',
        time: currentTime,
        dayOfWeek
    });
}
