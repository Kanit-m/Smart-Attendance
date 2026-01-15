// Notification Settings Component for Admin Panel
import React, { useState, useEffect } from 'react';
import { Bell, Send, Plus, Trash2, Loader2, Check, X, Clock, MessageSquare, Settings } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { db } from '../firebase';

interface Schedule {
    id: string;
    time: string;
    enabled: boolean;
    type: 'reminder' | 'summary';
    label: string;
}

interface NotificationSettings {
    enabled: boolean;
    lineGroupId: string;
    lineChannelToken: string;
    schedules: Schedule[];
    templates: {
        reminder: string;
        summary: string;
    };
}

const DEFAULT_SETTINGS: NotificationSettings = {
    enabled: false,
    lineGroupId: '',
    lineChannelToken: '',
    schedules: [
        { id: '1', time: '12:00', enabled: true, type: 'reminder', label: 'เตือนเช็คชื่อ' },
        { id: '2', time: '15:30', enabled: true, type: 'summary', label: 'สรุปประจำวัน' }
    ],
    templates: {
        reminder: '🔔 แจ้งเตือนการเช็คชื่อ\n━━━━━━━━━━\n📅 {date}\n❌ ยังไม่บันทึก:\n{classes}',
        summary: '📊 สรุปประจำวัน\n━━━━━━━━━━\n📅 {date}\n✅ มา: {present} คน\n❌ ขาด/ลา: {absent} คน'
    }
};

const INPUT_STYLE = "border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all w-full text-sm text-black bg-white placeholder-gray-400 shadow-sm";
const BTN_PRIMARY = "bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 font-medium shadow-sm hover:shadow-md transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2";

export const NotificationSettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeSection, setActiveSection] = useState<'connection' | 'schedules' | 'templates'>('connection');

    // Load settings from Firestore
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'settings', 'notifications'));
                if (docSnap.exists()) {
                    setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() as NotificationSettings });
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Save settings to Firestore
    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'notifications'), settings);
            showToast('บันทึกสำเร็จ', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('บันทึกไม่สำเร็จ', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Test send message
    const handleTestSend = async () => {
        if (!settings.lineChannelToken || !settings.lineGroupId) {
            showToast('กรุณากรอก Token และ Group ID ก่อน', 'error');
            return;
        }

        setTesting(true);
        try {
            const response = await fetch('/api/line/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: settings.lineChannelToken,
                    groupId: settings.lineGroupId,
                    type: 'test'
                })
            });

            const data = await response.json();
            if (data.success) {
                showToast('ส่งทดสอบสำเร็จ! ตรวจสอบในกลุ่ม Line', 'success');
            } else {
                showToast(data.error || 'ส่งไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('Test send error:', error);
            showToast('เกิดข้อผิดพลาด', 'error');
        } finally {
            setTesting(false);
        }
    };

    // Add new schedule
    const addSchedule = () => {
        const newSchedule: Schedule = {
            id: Date.now().toString(),
            time: '08:00',
            enabled: true,
            type: 'reminder',
            label: 'แจ้งเตือนใหม่'
        };
        setSettings(prev => ({
            ...prev,
            schedules: [...prev.schedules, newSchedule]
        }));
    };

    // Remove schedule
    const removeSchedule = (id: string) => {
        setSettings(prev => ({
            ...prev,
            schedules: prev.schedules.filter(s => s.id !== id)
        }));
    };

    // Update schedule
    const updateSchedule = (id: string, field: keyof Schedule, value: any) => {
        setSettings(prev => ({
            ...prev,
            schedules: prev.schedules.map(s =>
                s.id === id ? { ...s, [field]: value } : s
            )
        }));
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

            {/* Header */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-black">การแจ้งเตือน Line</h3>
                            <p className="text-sm text-gray-500">ส่งแจ้งเตือนไปกลุ่ม Line อัตโนมัติ</p>
                        </div>
                    </div>

                    {/* Toggle */}
                    <button
                        onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative w-14 h-8 rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                    >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${settings.enabled ? 'translate-x-7' : 'translate-x-1'
                            }`} />
                    </button>
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex gap-2">
                {[
                    { id: 'connection', label: 'เชื่อมต่อ Line', icon: Settings },
                    { id: 'schedules', label: 'ตั้งเวลา', icon: Clock },
                    { id: 'templates', label: 'ข้อความ', icon: MessageSquare }
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
                                value={settings.lineChannelToken}
                                onChange={(e) => setSettings(prev => ({ ...prev, lineChannelToken: e.target.value }))}
                                placeholder="จาก LINE Developers Console"
                                className={INPUT_STYLE}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Group ID
                            </label>
                            <input
                                type="text"
                                value={settings.lineGroupId}
                                onChange={(e) => setSettings(prev => ({ ...prev, lineGroupId: e.target.value }))}
                                placeholder="จะได้เมื่อเชิญ Bot เข้ากลุ่ม"
                                className={INPUT_STYLE}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                เชิญ Bot เข้ากลุ่ม Line แล้วดู logs ใน Vercel เพื่อคัดลอก Group ID
                            </p>
                        </div>

                        <button
                            onClick={handleTestSend}
                            disabled={testing || !settings.lineChannelToken || !settings.lineGroupId}
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
                        {settings.schedules.map(schedule => (
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                ข้อความเตือนเช็คชื่อ
                            </label>
                            <textarea
                                value={settings.templates.reminder}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    templates: { ...prev.templates, reminder: e.target.value }
                                }))}
                                rows={5}
                                className={INPUT_STYLE}
                                placeholder="ใช้ {date}, {classes} เป็นตัวแปร"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                ข้อความสรุปประจำวัน
                            </label>
                            <textarea
                                value={settings.templates.summary}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    templates: { ...prev.templates, summary: e.target.value }
                                }))}
                                rows={5}
                                className={INPUT_STYLE}
                                placeholder="ใช้ {date}, {present}, {absent} เป็นตัวแปร"
                            />
                        </div>

                        <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                            <strong>ตัวแปรที่ใช้ได้:</strong><br />
                            • {'{date}'} = วันที่<br />
                            • {'{classes}'} = รายชื่อห้องที่ยังไม่เช็คชื่อ<br />
                            • {'{present}'} = จำนวนคนมา<br />
                            • {'{absent}'} = จำนวนคนขาด/ลา<br />
                            • {'{total}'} = จำนวนที่บันทึกทั้งหมด<br />
                            • {'{printStatus}'} = สถานะพิมพ์รายงาน
                        </div>
                    </div>
                </div>
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
