// API สำหรับส่งข้อความทดสอบ Line (เรียกจาก Admin Panel)

export const config = {
    maxDuration: 10,
};

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const body = await request.json();
        const { token, groupId, message, type } = body;

        if (!token || !groupId) {
            return Response.json({ error: 'Missing token or groupId' }, { status: 400 });
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
            return Response.json({ success: true, message: 'ส่งสำเร็จ' });
        } else {
            const errorData = await response.json();
            return Response.json({
                success: false,
                error: errorData.message || 'ส่งไม่สำเร็จ'
            }, { status: 400 });
        }

    } catch (error) {
        console.error('Send error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
