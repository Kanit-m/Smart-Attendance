// Notification Settings Component for Admin Panel - Multi Profile Support
import React, { useState, useEffect } from 'react';
import { Bell, Send, Plus, Trash2, Loader2, Check, X, Clock, MessageSquare, Settings, Users, Copy } from 'lucide-react';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore/lite';
import { db } from '../firebase';

interface Schedule {
    id: string;
    time: string;
    enabled: boolean;
    type: 'reminder' | 'summary';
    label: string;
}

interface NotificationProfile {
    id: string;
    name: string;
    enabled: boolean;
    lineGroupId: string;
    lineChannelToken: string;
    schedules: Schedule[];
    templates: {
        reminder: string;
        summary: string;
    };
    selectedGrades?: string[]; // ชั้นที่ต้องการรับแจ้งเตือนรายชื่อขาด
}

const ALL_GRADES = ['อนุบาล 2', 'อนุบาล 3', 'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6'];

const DEFAULT_PROFILE: Omit<NotificationProfile, 'id'> = {
    name: 'กลุ่มใหม่',
    enabled: false,
    lineGroupId: '',
    lineChannelToken: '',
    schedules: [
        { id: '1', time: '12:00', enabled: true, type: 'reminder', label: 'เตือนเช็คชื่อ' },
        { id: '2', time: '15:30', enabled: true, type: 'summary', label: 'สรุปประจำวัน' }
    ],
    templates: {
        reminder: '🔔 แจ้งเตือนการเช็คชื่อ\n━━━━━━━━━━\n📅 {date}\n❌ ยังไม่บันทึก:\n{classes}',
        summary: '📊 สรุปประจำวัน\n━━━━━━━━━━\n📅 {date}\n✅ มา: {present} คน\n❌ ขาด/ลา: {absent} คน\n\n{absentList}\n{printStatus}'
    },
    selectedGrades: [] // ไม่เลือกชั้นไหนเลย = ไม่แจ้งรายชื่อ
};

const INPUT_STYLE = "border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all w-full text-sm text-black bg-white placeholder-gray-400 shadow-sm";
const BTN_PRIMARY = "bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2";
const BTN_SECONDARY = "bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium transition-all text-sm flex items-center gap-2";

export const NotificationSettingsPanel: React.FC = () => {
    const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeSection, setActiveSection] = useState<'connection' | 'schedules' | 'templates' | 'grades'>('connection');

    const selectedProfile = profiles.find(p => p.id === selectedProfileId);

    // Load profiles from Firestore
    useEffect(() => {
        const loadProfiles = async () => {
            try {
                // Try new multi-profile structure first
                const profilesSnap = await getDocs(collection(db, 'settings', 'notifications', 'profiles'));

                if (!profilesSnap.empty) {
                    const loadedProfiles: NotificationProfile[] = [];
                    profilesSnap.forEach(doc => {
                        loadedProfiles.push({ id: doc.id, ...doc.data() } as NotificationProfile);
                    });
                    setProfiles(loadedProfiles);
                    if (loadedProfiles.length > 0) {
                        setSelectedProfileId(loadedProfiles[0].id);
                    }
                } else {
                    // Migrate from old single-profile structure
                    const oldSettingsSnap = await getDoc(doc(db, 'settings', 'notifications'));
                    if (oldSettingsSnap.exists()) {
                        const oldData = oldSettingsSnap.data();
                        const migratedProfile: NotificationProfile = {
                            id: 'default',
                            name: 'กลุ่มหลัก',
                            enabled: oldData.enabled || false,
                            lineGroupId: oldData.lineGroupId || '',
                            lineChannelToken: oldData.lineChannelToken || '',
                            schedules: oldData.schedules || DEFAULT_PROFILE.schedules,
                            templates: oldData.templates || DEFAULT_PROFILE.templates
                        };
                        setProfiles([migratedProfile]);
                        setSelectedProfileId('default');
                        // Save migrated profile
                        await setDoc(doc(db, 'settings', 'notifications', 'profiles', 'default'), migratedProfile);
                    } else {
                        // No data, create default profile
                        const defaultProfile: NotificationProfile = { id: 'default', name: 'กลุ่มหลัก', ...DEFAULT_PROFILE };
                        setProfiles([defaultProfile]);
                        setSelectedProfileId('default');
                    }
                }
            } catch (error) {
                console.error('Error loading profiles:', error);
            } finally {
                setLoading(false);
            }
        };
        loadProfiles();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Add new profile
    const addProfile = async () => {
        const newId = `profile_${Date.now()}`;
        const newProfile: NotificationProfile = {
            id: newId,
            name: `กลุ่มใหม่ ${profiles.length + 1}`,
            ...DEFAULT_PROFILE
        };
        setProfiles(prev => [...prev, newProfile]);
        setSelectedProfileId(newId);
    };

    // Delete profile
    const deleteProfile = async (id: string) => {
        if (profiles.length <= 1) {
            showToast('ต้องมีอย่างน้อย 1 กลุ่ม', 'error');
            return;
        }
        try {
            await deleteDoc(doc(db, 'settings', 'notifications', 'profiles', id));
            setProfiles(prev => prev.filter(p => p.id !== id));
            if (selectedProfileId === id) {
                setSelectedProfileId(profiles.find(p => p.id !== id)?.id || null);
            }
            showToast('ลบกลุ่มแล้ว', 'success');
        } catch (error) {
            showToast('ลบไม่สำเร็จ', 'error');
        }
    };

    // Update profile
    const updateProfile = (field: keyof NotificationProfile, value: any) => {
        setProfiles(prev => prev.map(p =>
            p.id === selectedProfileId ? { ...p, [field]: value } : p
        ));
    };

    // Save all profiles
    const handleSave = async () => {
        setSaving(true);
        try {
            for (const profile of profiles) {
                await setDoc(doc(db, 'settings', 'notifications', 'profiles', profile.id), profile);
            }
            showToast('บันทึกสำเร็จ', 'success');
        } catch (error) {
            console.error('Error saving profiles:', error);
            showToast('บันทึกไม่สำเร็จ', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Test send message
    const handleTestSend = async () => {
        if (!selectedProfile?.lineChannelToken || !selectedProfile?.lineGroupId) {
            showToast('กรุณากรอก Token และ Group ID ก่อน', 'error');
            return;
        }

        setTesting(true);
        try {
            const response = await fetch('/api/line/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: selectedProfile.lineChannelToken,
                    groupId: selectedProfile.lineGroupId,
                    type: 'test'
                })
            });

            const data = await response.json();
            if (data.success) {
                showToast('ส่งทดสอบสำเร็จ!', 'success');
            } else {
                showToast(data.error || 'ส่งไม่สำเร็จ', 'error');
            }
            showToast('เกิดข้อผิดพลาด', 'error');
        } finally {
            setTesting(false);
        }
    };

    // Test send template (via cron)
    const handleTemplateTest = async (type: 'reminder' | 'summary') => {
        if (!selectedProfile?.id) return;

        // Show warning if dirty? (Complex to track dirty state here, so just warn to save)

        setTesting(true);
        try {
            // Use today's date
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`/api/cron/check-notify?date=${today}&test=true&type=${type}`);
            const data = await response.json();

            if (response.ok) {
                showToast('ส่งข้อความทดสอบแล้ว (ใช้ค่าที่บันทึกล่าสุด)', 'success');
            } else {
                showToast('ส่งไม่สำเร็จ', 'error');
            }
        } catch (error) {
            showToast('เกิดข้อผิดพลาดในการเรียก API', 'error');
        } finally {
            setTesting(false);
        }
    };

    // Schedule management
    const addSchedule = () => {
        if (!selectedProfile) return;
        const newSchedule: Schedule = {
            id: Date.now().toString(),
            time: '08:00',
            enabled: true,
            type: 'reminder',
            label: 'แจ้งเตือนใหม่'
        };
        updateProfile('schedules', [...selectedProfile.schedules, newSchedule]);
    };

    const removeSchedule = (id: string) => {
        if (!selectedProfile) return;
        updateProfile('schedules', selectedProfile.schedules.filter(s => s.id !== id));
    };

    const updateSchedule = (id: string, field: keyof Schedule, value: any) => {
        if (!selectedProfile) return;
        updateProfile('schedules', selectedProfile.schedules.map(s =>
            s.id === id ? { ...s, [field]: value } : s
        ));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                    {toast.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                    {toast.message}
                </div>
            )}

            {/* Header with Profile Selector */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-black">การแจ้งเตือน Line</h3>
                            <p className="text-sm text-gray-500">จัดการหลายกลุ่มได้</p>
                        </div>
                    </div>
                    <button onClick={addProfile} className={BTN_SECONDARY}>
                        <Plus className="w-4 h-4" />
                        เพิ่มกลุ่ม
                    </button>
                </div>

                {/* Profile Tabs */}
                <div className="flex gap-2 flex-wrap">
                    {profiles.map(profile => (
                        <button
                            key={profile.id}
                            onClick={() => setSelectedProfileId(profile.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedProfileId === profile.id
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            <Users className="w-4 h-4" />
                            {profile.name}
                            {profile.enabled && <span className="w-2 h-2 bg-emerald-400 rounded-full" />}
                        </button>
                    ))}
                </div>
            </div>

            {selectedProfile && (
                <>
                    {/* Profile Settings Header */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                                <input
                                    type="text"
                                    value={selectedProfile.name}
                                    onChange={(e) => updateProfile('name', e.target.value)}
                                    className="text-lg font-bold text-black bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 outline-none px-1"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                {profiles.length > 1 && (
                                    <button
                                        onClick={() => deleteProfile(selectedProfile.id)}
                                        className="text-gray-400 hover:text-rose-500"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => updateProfile('enabled', !selectedProfile.enabled)}
                                    className={`relative w-14 h-8 rounded-full transition-colors ${selectedProfile.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                                        }`}
                                >
                                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${selectedProfile.enabled ? 'translate-x-7' : 'translate-x-1'
                                        }`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section Tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { id: 'connection', label: 'เชื่อมต่อ Line', icon: Settings },
                            { id: 'schedules', label: 'ตั้งเวลา', icon: Clock },
                            { id: 'templates', label: 'ข้อความ', icon: MessageSquare },
                            { id: 'grades', label: 'รายชื่อขาด', icon: Users }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSection(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === tab.id
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Connection Section */}
                    {activeSection === 'connection' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <h4 className="font-bold text-black flex items-center gap-2">
                                <Settings className="w-5 h-5 text-gray-400" />
                                ตั้งค่าการเชื่อมต่อ Line
                            </h4>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Channel Access Token
                                    </label>
                                    <input
                                        type="password"
                                        value={selectedProfile.lineChannelToken}
                                        onChange={(e) => updateProfile('lineChannelToken', e.target.value)}
                                        placeholder="จาก LINE Developers Console"
                                        className={INPUT_STYLE}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Group ID
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={selectedProfile.lineGroupId}
                                            onChange={(e) => updateProfile('lineGroupId', e.target.value)}
                                            placeholder="จะได้เมื่อเชิญ Bot เข้ากลุ่ม"
                                            className={INPUT_STYLE}
                                        />
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(selectedProfile.lineGroupId);
                                                showToast('คัดลอกแล้ว', 'success');
                                            }}
                                            className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                                        >
                                            <Copy className="w-4 h-4 text-gray-600" />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={handleTestSend}
                                    disabled={testing || !selectedProfile.lineChannelToken || !selectedProfile.lineGroupId}
                                    className={BTN_PRIMARY}
                                >
                                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    ทดสอบส่ง
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Schedules Section */}
                    {activeSection === 'schedules' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-black flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    ตั้งเวลาแจ้งเตือน
                                </h4>
                                <button
                                    onClick={addSchedule}
                                    className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                                >
                                    <Plus className="w-4 h-4" />
                                    เพิ่มเวลา
                                </button>
                            </div>

                            <div className="space-y-3">
                                {selectedProfile.schedules.map(schedule => (
                                    <div
                                        key={schedule.id}
                                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                                    >
                                        <input
                                            type="time"
                                            value={schedule.time}
                                            onChange={(e) => updateSchedule(schedule.id, 'time', e.target.value)}
                                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                                        />

                                        <select
                                            value={schedule.type}
                                            onChange={(e) => updateSchedule(schedule.id, 'type', e.target.value)}
                                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex-1"
                                        >
                                            <option value="reminder">เตือนเช็คชื่อ</option>
                                            <option value="summary">สรุปประจำวัน</option>
                                        </select>

                                        <button
                                            onClick={() => updateSchedule(schedule.id, 'enabled', !schedule.enabled)}
                                            className={`w-10 h-6 rounded-full transition-colors ${schedule.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                                                }`}
                                        >
                                            <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${schedule.enabled ? 'translate-x-4' : 'translate-x-0'
                                                }`} />
                                        </button>

                                        <button
                                            onClick={() => removeSchedule(schedule.id)}
                                            className="text-gray-400 hover:text-rose-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Templates Section */}
                    {activeSection === 'templates' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <h4 className="font-bold text-black flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-gray-400" />
                                ข้อความแจ้งเตือน
                            </h4>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-700">
                                            ข้อความเตือนเช็คชื่อ
                                        </label>
                                        <button
                                            onClick={() => handleTemplateTest('reminder')}
                                            disabled={testing}
                                            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 disabled:opacity-50"
                                        >
                                            <Send className="w-3 h-3" />
                                            ทดสอบส่ง
                                        </button>
                                    </div>
                                    <textarea
                                        value={selectedProfile.templates.reminder}
                                        onChange={(e) => updateProfile('templates', {
                                            ...selectedProfile.templates,
                                            reminder: e.target.value
                                        })}
                                        rows={5}
                                        className={INPUT_STYLE}
                                    />
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-700">
                                            ข้อความสรุปประจำวัน
                                        </label>
                                        <button
                                            onClick={() => handleTemplateTest('summary')}
                                            disabled={testing}
                                            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 disabled:opacity-50"
                                        >
                                            <Send className="w-3 h-3" />
                                            ทดสอบส่ง
                                        </button>
                                    </div>
                                    <textarea
                                        value={selectedProfile.templates.summary}
                                        onChange={(e) => updateProfile('templates', {
                                            ...selectedProfile.templates,
                                            summary: e.target.value
                                        })}
                                        rows={5}
                                        className={INPUT_STYLE}
                                    />
                                </div>

                                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                    <strong>ตัวแปรที่ใช้ได้:</strong><br />
                                    • {'{date}'} = วันที่<br />
                                    • {'{classes}'} = รายชื่อห้องที่ยังไม่เช็คชื่อ<br />
                                    • {'{present}'} = จำนวนคนมา<br />
                                    • {'{absent}'} = จำนวนคนขาด/ลา<br />
                                    • {'{total}'} = จำนวนที่บันทึกทั้งหมด<br />
                                    • {'{absentList}'} = รายชื่อนักเรียนขาด (ตามชั้นที่เลือก)<br />
                                    • {'{printStatus}'} = สถานะพิมพ์รายงาน
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Grades Section - Select which grades to show absent list */}
                    {activeSection === 'grades' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <h4 className="font-bold text-black flex items-center gap-2">
                                <Users className="w-5 h-5 text-gray-400" />
                                เลือกชั้นที่ต้องการรับแจ้งรายชื่อขาด
                            </h4>
                            <p className="text-sm text-gray-500">
                                เลือกชั้นที่ต้องการให้แสดงรายชื่อนักเรียนที่ขาดในข้อความ (ใช้ตัวแปร {'{absentList}'})
                            </p>

                            {/* Select All / Deselect All */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => updateProfile('selectedGrades', [...ALL_GRADES])}
                                    className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                                >
                                    เลือกทั้งหมด
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                    onClick={() => updateProfile('selectedGrades', [])}
                                    className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                                >
                                    ยกเลิกทั้งหมด
                                </button>
                            </div>

                            {/* Grade Checkboxes */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {ALL_GRADES.map(grade => {
                                    const isSelected = selectedProfile.selectedGrades?.includes(grade) || false;
                                    return (
                                        <label
                                            key={grade}
                                            className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${isSelected
                                                ? 'bg-brand-50 border-brand-300 text-brand-700'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    const current = selectedProfile.selectedGrades || [];
                                                    if (e.target.checked) {
                                                        updateProfile('selectedGrades', [...current, grade]);
                                                    } else {
                                                        updateProfile('selectedGrades', current.filter(g => g !== grade));
                                                    }
                                                }}
                                                className="w-4 h-4 text-brand-600 rounded"
                                            />
                                            <span className="text-sm font-medium">{grade}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Info */}
                            <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                                <strong>หมายเหตุ:</strong> ถ้าไม่เลือกชั้นไหนเลย ตัวแปร {'{absentList}'} จะแสดงค่าว่าง
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={BTN_PRIMARY}
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    บันทึกการตั้งค่า
                </button>
            </div>
        </div>
    );
};
