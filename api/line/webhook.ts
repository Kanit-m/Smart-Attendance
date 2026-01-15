// Line Webhook - รับ Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม

export default function handler(req: any, res: any) {
    // Line webhook verification (GET request from LINE)
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const events = body.events || [];

        for (const event of events) {
            // Bot ถูกเชิญเข้ากลุ่ม
            if (event.type === 'join' && event.source?.type === 'group') {
                const groupId = event.source.groupId;
                console.log('Bot joined group:', groupId);
            }

            // Bot ถูกเชิญออกจากกลุ่ม
            if (event.type === 'leave' && event.source?.type === 'group') {
                const groupId = event.source.groupId;
                console.log('Bot left group:', groupId);
            }
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
