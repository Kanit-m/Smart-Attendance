// Vercel Cron Job - ตรวจสอบเวลาและส่งแจ้งเตือน
// รองรับ Multi-Profile: ส่งไปหลายกลุ่ม Line ด้วยข้อความต่างกัน

interface Profile {
    id: string;
    name: string;
    enabled: boolean;
    lineGroupId: string;
    lineChannelToken: string;
    schedules: Array<{ time: string; enabled: boolean; type: string }>;
    templates: { reminder: string; summary: string };
}

export default async function handler(req: any, res: any) {
    // Test mode: ?date=YYYY-MM-DD&test=true
    const testDate = req.query?.date as string | undefined;
    const isTestMode = req.query?.test === 'true';

    // Get current time in Thailand timezone
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentHour = thaiTime.getHours();
    const currentMinute = thaiTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    // Use test date if provided, otherwise use today
    const today = testDate || thaiTime.toLocaleDateString('sv-SE');
    const dateForDisplay = testDate ? new Date(testDate) : thaiTime;
    const thaiDate = dateForDisplay.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Check if it's weekend (skip in test mode)
    const dayOfWeek = dateForDisplay.getDay();
    if (!isTestMode && (dayOfWeek === 0 || dayOfWeek === 6)) {
        return res.status(200).json({ message: 'Weekend - skipping', time: currentTime });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || 'tester010-1a27e';
    const results: any[] = [];

    try {
        // Fetch all notification profiles
        const profilesUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/notifications/profiles`;
        const profilesResponse = await fetch(profilesUrl);

        let profiles: Profile[] = [];

        if (profilesResponse.ok) {
            const profilesData = await profilesResponse.json();
            const documents = profilesData.documents || [];

            profiles = documents.map((doc: any) => {
                const fields = doc.fields || {};
                return {
                    id: doc.name.split('/').pop(),
                    name: fields.name?.stringValue || '',
                    enabled: fields.enabled?.booleanValue || false,
                    lineGroupId: fields.lineGroupId?.stringValue || '',
                    lineChannelToken: fields.lineChannelToken?.stringValue || '',
                    schedules: (fields.schedules?.arrayValue?.values || []).map((s: any) => ({
                        time: s.mapValue?.fields?.time?.stringValue || '',
                        enabled: s.mapValue?.fields?.enabled?.booleanValue || false,
                        type: s.mapValue?.fields?.type?.stringValue || 'reminder'
                    })),
                    templates: {
                        reminder: fields.templates?.mapValue?.fields?.reminder?.stringValue || '',
                        summary: fields.templates?.mapValue?.fields?.summary?.stringValue || ''
                    }
                };
            });
        }

        // Fallback to old single-profile structure
        if (profiles.length === 0) {
            const oldSettingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/notifications`;
            const oldResponse = await fetch(oldSettingsUrl);

            if (oldResponse.ok) {
                const oldData = await oldResponse.json();
                const fields = oldData.fields || {};

                profiles = [{
                    id: 'default',
                    name: 'Default',
                    enabled: fields.enabled?.booleanValue || false,
                    lineGroupId: fields.lineGroupId?.stringValue || '',
                    lineChannelToken: fields.lineChannelToken?.stringValue || '',
                    schedules: (fields.schedules?.arrayValue?.values || []).map((s: any) => ({
                        time: s.mapValue?.fields?.time?.stringValue || '',
                        enabled: s.mapValue?.fields?.enabled?.booleanValue || false,
                        type: s.mapValue?.fields?.type?.stringValue || 'reminder'
                    })),
                    templates: {
                        reminder: fields.templates?.mapValue?.fields?.reminder?.stringValue || '',
                        summary: fields.templates?.mapValue?.fields?.summary?.stringValue || ''
                    }
                }];
            }
        }

        if (profiles.length === 0) {
            return res.status(200).json({ message: 'No profiles found', time: currentTime });
        }

        // Fetch attendance data once (shared across all profiles)
        let presentCount = 0;
        let absentCount = 0;
        let uncheckedClasses: string[] = [];
        let printStatus = '⏳ ยังไม่พิมพ์รายงาน';

        try {
            // Get students (pageSize=1000 to get all students, default is only 20)
            const studentsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/students?pageSize=1000`;
            const studentsResponse = await fetch(studentsUrl);

            // Get attendance
            const attendanceUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/attendance/${today}`;
            const attendanceResponse = await fetch(attendanceUrl);

            // Get print log
            const printLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/print_logs/${today}`;
            const printLogResponse = await fetch(printLogUrl);

            if (studentsResponse.ok) {
                const studentsData = await studentsResponse.json();
                const students = studentsData.documents || [];

                const allClasses = new Set<string>();
                const activeStudents: any[] = [];

                students.forEach((doc: any) => {
                    const fields = doc.fields || {};
                    const isActive = fields.isActive?.booleanValue !== false;
                    // Use 'grade' field to match Dashboard.tsx (was using 'class' incorrectly)
                    const gradeName = fields.grade?.stringValue || '';

                    if (isActive && gradeName) {
                        allClasses.add(gradeName);
                        activeStudents.push({
                            id: doc.name.split('/').pop(),
                            grade: gradeName
                        });
                    }
                });

                const checkedClasses = new Set<string>();

                if (attendanceResponse.ok) {
                    const attendanceData = await attendanceResponse.json();
                    const records = attendanceData.fields?.records?.mapValue?.fields || {};

                    Object.entries(records).forEach(([studentId, record]: [string, any]) => {
                        const status = record?.mapValue?.fields?.status?.stringValue || '';
                        const student = activeStudents.find(s => s.id === studentId);

                        if (student) {
                            checkedClasses.add(student.grade);
                            if (status === 'present' || status === 'late') {
                                presentCount++;
                            } else if (status === 'absent' || status === 'leave' || status === 'sick') {
                                absentCount++;
                            }
                        }
                    });
                }

                allClasses.forEach(className => {
                    if (!checkedClasses.has(className)) {
                        uncheckedClasses.push(className);
                    }
                });

                // Store debug info for test mode
                if (isTestMode) {
                    (res as any).debugInfo = {
                        allClasses: Array.from(allClasses),
                        checkedClasses: Array.from(checkedClasses),
                        uncheckedClasses,
                        activeStudentCount: activeStudents.length,
                        presentCount,
                        absentCount
                    };
                }
            }

            if (printLogResponse.ok) {
                const printLogData = await printLogResponse.json();
                if (printLogData.fields) {
                    const printedBy = printLogData.fields.printedBy?.stringValue || 'ไม่ระบุ';
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
            console.error('Error fetching data:', e);
        }

        const classesText = uncheckedClasses.length > 0
            ? uncheckedClasses.join(', ')
            : '✅ ทุกห้องบันทึกครบแล้ว';

        // Process each profile
        const currentMinutes = currentHour * 60 + currentMinute;

        for (const profile of profiles) {
            if (!profile.enabled || !profile.lineGroupId || !profile.lineChannelToken) {
                results.push({ profile: profile.name, status: 'skipped', reason: 'disabled or missing config' });
                continue;
            }

            // Check schedules (skip in test mode - use first summary schedule or default)
            let matchedSchedule: { time: string; enabled: boolean; type: string } | null = null;

            if (isTestMode) {
                // In test mode, use first enabled schedule or create a summary one
                matchedSchedule = profile.schedules.find(s => s.enabled && s.type === 'summary')
                    || profile.schedules.find(s => s.enabled)
                    || { time: currentTime, enabled: true, type: 'summary' };
            } else {
                for (const schedule of profile.schedules) {
                    if (!schedule.enabled || !schedule.time) continue;

                    const [schedHour, schedMin] = schedule.time.split(':').map(Number);
                    const schedMinutes = schedHour * 60 + schedMin;

                    if (Math.abs(currentMinutes - schedMinutes) <= 2) {
                        matchedSchedule = schedule;
                        break;
                    }
                }
            }

            if (!matchedSchedule) {
                results.push({
                    profile: profile.name,
                    status: 'no match',
                    schedules: profile.schedules.map(s => s.time)
                });
                continue;
            }

            // Build message
            const messageTemplate = matchedSchedule.type === 'reminder'
                ? profile.templates.reminder
                : profile.templates.summary;

            const message = messageTemplate
                .replace('{date}', thaiDate)
                .replace('{present}', presentCount.toString())
                .replace('{absent}', absentCount.toString())
                .replace('{classes}', classesText)
                .replace('{printStatus}', printStatus)
                .replace('{total}', (presentCount + absentCount).toString());

            // Send to Line
            try {
                const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${profile.lineChannelToken}`
                    },
                    body: JSON.stringify({
                        to: profile.lineGroupId,
                        messages: [{ type: 'text', text: message }]
                    })
                });

                if (lineResponse.ok) {
                    results.push({ profile: profile.name, status: 'sent', type: matchedSchedule.type });
                } else {
                    const error = await lineResponse.json();
                    results.push({ profile: profile.name, status: 'failed', error });
                }
            } catch (e: any) {
                results.push({ profile: profile.name, status: 'error', error: e.message });
            }
        }

        return res.status(200).json({
            message: 'Cron completed',
            time: currentTime,
            date: today,
            profileCount: profiles.length,
            results,
            ...(isTestMode && (res as any).debugInfo ? { debug: (res as any).debugInfo } : {})
        });

    } catch (error: any) {
        console.error('Cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}
