// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน
// ทำงานทุก 5 นาที ในวันจันทร์-ศุกร์

export const config = {
    maxDuration: 10,
};

export default async function handler(request: Request): Promise<Response> {
    // Get current time in Thailand timezone
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentHour = thaiTime.getHours();
    const currentMinute = thaiTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    // Check if it's weekend
    const dayOfWeek = thaiTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return Response.json({ message: 'Weekend - skipping', time: currentTime });
    }

    // TODO: Fetch settings from Firestore and check if current time matches any schedule
    return Response.json({
        message: 'Cron check completed',
        time: currentTime,
        dayOfWeek
    });
}
