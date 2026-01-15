// Line Webhook - รับ Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม

export const config = {
    maxDuration: 10,
};

export default async function handler(request: Request): Promise<Response> {
    if (request.method === 'GET') {
        // Line webhook verification
        return Response.json({ status: 'ok' });
    }

    if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const body = await request.json();
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

        return Response.json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
