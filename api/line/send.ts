// API สำหรับส่งข้อความทดสอบ Line (เรียกจาก Admin Panel)
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { token, groupId, message, type } = req.body;

        if (!token || !groupId) {
            return res.status(400).json({ error: 'Missing token or groupId' });
        }

        // ถ้าส่ง type มา ให้สร้างข้อความตาม template
        let finalMessage = message;
        if (type === 'test') {
            finalMessage = '🧪 ทดสอบการแจ้งเตือน\n━━━━━━━━━━\n✅ เชื่อมต่อสำเร็จ!';
        }

        // ส่งไป Line
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                to: groupId,
                messages: [{ type: 'text', text: finalMessage }]
            })
        });

        if (response.ok) {
            return res.status(200).json({ success: true, message: 'ส่งสำเร็จ' });
        } else {
            const errorData = await response.json();
            return res.status(400).json({
                success: false,
                error: errorData.message || 'ส่งไม่สำเร็จ'
            });
        }

    } catch (error) {
        console.error('Send error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
