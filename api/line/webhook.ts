// Line Webhook - รับ Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม

export default async function handler(req: any, res: any) {
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

            // ตอบ Group ID เมื่อพิมพ์ /groupid
            if (event.type === 'message' && event.message?.type === 'text') {
                const text = event.message.text?.toLowerCase() || '';
                const groupId = event.source?.groupId || '';
                const replyToken = event.replyToken;

                if (text === '/groupid' && groupId && replyToken) {
                    // ดึง Channel Token จาก Firestore
                    const projectId = process.env.FIREBASE_PROJECT_ID || 'tester010-1a27e';
                    const profilesUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/notifications/profiles`;

                    try {
                        const profilesResponse = await fetch(profilesUrl);
                        if (profilesResponse.ok) {
                            const profilesData = await profilesResponse.json();
                            const documents = profilesData.documents || [];

                            // ใช้ token จาก profile แรกที่มี
                            const firstProfile = documents[0];
                            const channelToken = firstProfile?.fields?.lineChannelToken?.stringValue;

                            if (channelToken) {
                                await fetch('https://api.line.me/v2/bot/message/reply', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${channelToken}`
                                    },
                                    body: JSON.stringify({
                                        replyToken: replyToken,
                                        messages: [{
                                            type: 'text',
                                            text: `📋 Group ID:\n${groupId}\n\n💡 คัดลอก ID นี้ไปใส่ใน Admin Panel > Notification Settings`
                                        }]
                                    })
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Error replying groupId:', e);
                    }
                }
            }
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
