// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน
// เรียกจาก cron-job.org ทุก 5 นาที
// ตรวจสอบเวลาจาก Firestore settings

export default async function handler(req: any, res: any) {
    // Get current time in Thailand timezone
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentHour = thaiTime.getHours();
    const currentMinute = thaiTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const today = thaiTime.toLocaleDateString('sv-SE');
    const thaiDate = thaiTime.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Check if it's weekend
    const dayOfWeek = thaiTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return res.status(200).json({ message: 'Weekend - skipping', time: currentTime });
    }

    try {
        // Use Firebase REST API to get settings
        const projectId = process.env.FIREBASE_PROJECT_ID || 'tester010-1a27e';
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/notifications`;

        const settingsResponse = await fetch(firestoreUrl);

        if (!settingsResponse.ok) {
            const errorText = await settingsResponse.text();
            return res.status(200).json({
                message: 'No settings found',
                time: currentTime,
                projectId: projectId,
                error: errorText,
                status: settingsResponse.status
            });
        }

        const settingsData = await settingsResponse.json();
        const fields = settingsData.fields || {};

        // Parse settings from Firestore REST response
        const enabled = fields.enabled?.booleanValue || false;
        const lineGroupId = fields.lineGroupId?.stringValue || '';
        const lineChannelToken = fields.lineChannelToken?.stringValue || '';
        const schedulesArray = fields.schedules?.arrayValue?.values || [];
        const templates = {
            reminder: fields.templates?.mapValue?.fields?.reminder?.stringValue || '',
            summary: fields.templates?.mapValue?.fields?.summary?.stringValue || ''
        };
        const lastSent = fields.lastSent?.mapValue?.fields || {};

        if (!enabled) {
            return res.status(200).json({ message: 'Notifications disabled', time: currentTime });
        }

        if (!lineGroupId || !lineChannelToken) {
            return res.status(200).json({ message: 'Missing Line config', time: currentTime });
        }

        // Parse schedules
        const schedules = schedulesArray.map((s: any) => ({
            time: s.mapValue?.fields?.time?.stringValue || '',
            enabled: s.mapValue?.fields?.enabled?.booleanValue || false,
            type: s.mapValue?.fields?.type?.stringValue || 'reminder'
        }));

        // Check if current time matches any schedule (with 2-minute tolerance)
        const currentMinutes = currentHour * 60 + currentMinute;
        let matchedSchedule = null;

        for (const schedule of schedules) {
            if (!schedule.enabled || !schedule.time) continue;

            const [schedHour, schedMin] = schedule.time.split(':').map(Number);
            const schedMinutes = schedHour * 60 + schedMin;

            // Check if within 2-minute window
            if (Math.abs(currentMinutes - schedMinutes) <= 2) {
                // Check if already sent today for this time slot
                const lastSentDate = lastSent[schedule.time.replace(':', '_')]?.stringValue;
                if (lastSentDate === today) {
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
                schedules: schedules.map((s: any) => s.time)
            });
        }

        // Check print status from print_logs
        let printStatus = '⏳ ยังไม่พิมพ์รายงาน';
        let printedBy = '';
        try {
            const printLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/print_logs/${today}`;
            const printLogResponse = await fetch(printLogUrl);
            if (printLogResponse.ok) {
                const printLogData = await printLogResponse.json();
                if (printLogData.fields) {
                    printedBy = printLogData.fields.printedBy?.stringValue || 'ไม่ระบุ';
                    const printTime = printLogData.fields.timestamp?.timestampValue;
                    const timeStr = printTime ? new Date(printTime).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Bangkok'
                    }) : '';
                    printStatus = `✅ พิมพ์รายงานแล้ว (${printedBy} เวลา ${timeStr})`;
                }
            }
        } catch (e) {
            // Keep default status
        }

        // Fetch attendance data for today
        let presentCount = 0;
        let absentCount = 0;
        let uncheckedClasses: string[] = [];

        try {
            // Get all students
            const studentsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/students`;
            const studentsResponse = await fetch(studentsUrl);

            // Get today's attendance
            const attendanceUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/attendance/${today}`;
            const attendanceResponse = await fetch(attendanceUrl);

            if (studentsResponse.ok) {
                const studentsData = await studentsResponse.json();
                const students = studentsData.documents || [];

                // Get unique class names
                const allClasses = new Set<string>();
                const activeStudents: any[] = [];

                students.forEach((doc: any) => {
                    const fields = doc.fields || {};
                    const isActive = fields.isActive?.booleanValue !== false;
                    const className = fields.class?.stringValue || '';

                    if (isActive && className) {
                        allClasses.add(className);
                        activeStudents.push({
                            id: doc.name.split('/').pop(),
                            class: className
                        });
                    }
                });

                // Check attendance records
                const checkedClasses = new Set<string>();

                if (attendanceResponse.ok) {
                    const attendanceData = await attendanceResponse.json();
                    const records = attendanceData.fields?.records?.mapValue?.fields || {};

                    // Count present/absent and track checked classes
                    Object.entries(records).forEach(([studentId, record]: [string, any]) => {
                        const status = record?.mapValue?.fields?.status?.stringValue || '';
                        const student = activeStudents.find(s => s.id === studentId);

                        if (student) {
                            checkedClasses.add(student.class);

                            if (status === 'present' || status === 'late') {
                                presentCount++;
                            } else if (status === 'absent' || status === 'leave' || status === 'sick') {
                                absentCount++;
                            }
                        }
                    });
                }

                // Find unchecked classes
                allClasses.forEach(className => {
                    if (!checkedClasses.has(className)) {
                        uncheckedClasses.push(className);
                    }
                });
            }
        } catch (e) {
            console.error('Error fetching attendance:', e);
        }

        // Format unchecked classes list
        const classesText = uncheckedClasses.length > 0
            ? uncheckedClasses.join(', ')
            : '✅ ทุกห้องบันทึกครบแล้ว';

        // Build message
        const messageTemplate = matchedSchedule.type === 'reminder'
            ? templates.reminder
            : templates.summary;

        const message = messageTemplate
            .replace('{date}', thaiDate)
            .replace('{present}', presentCount.toString())
            .replace('{absent}', absentCount.toString())
            .replace('{classes}', classesText)
            .replace('{printStatus}', printStatus)
            .replace('{printedBy}', printedBy)
            .replace('{total}', (presentCount + absentCount).toString());

        // Send notification via Line
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineChannelToken}`
            },
            body: JSON.stringify({
                to: lineGroupId,
                messages: [{ type: 'text', text: message }]
            })
        });

        if (lineResponse.ok) {
            // Update lastSent in Firestore via REST API
            const updateUrl = `${firestoreUrl}?updateMask.fieldPaths=lastSent`;
            const timeKey = matchedSchedule.time.replace(':', '_');

            await fetch(updateUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: {
                        ...settingsData.fields,
                        lastSent: {
                            mapValue: {
                                fields: {
                                    ...lastSent,
                                    [timeKey]: { stringValue: today }
                                }
                            }
                        }
                    }
                })
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
