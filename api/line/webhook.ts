// Line Webhook - รับ Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        // Line webhook verification
        return res.status(200).json({ status: 'ok' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body;
        const events = body.events || [];

        for (const event of events) {
            // Bot ถูกเชิญเข้ากลุ่ม
            if (event.type === 'join' && event.source?.type === 'group') {
                const groupId = event.source.groupId;
                console.log('Bot joined group:', groupId);

                // TODO: Save groupId to Firestore settings
                // For now, just log it - admin will need to copy from logs
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
