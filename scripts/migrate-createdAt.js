/**
 * SIMPLE Migration Script - Run in Console
 * 
 * วิธีใช้:
 * 1. เปิดหน้า Admin Panel  
 * 2. F12 → Console → พิมพ์ "allow pasting" → Enter
 * 3. Copy โค้ดข้างล่างนี้วาง → Enter
 */

// ใช้ db ที่มีอยู่แล้วในหน้าเว็บ (ผ่าน importmap)
const DEFAULT_DATE = new Date('2025-11-17').getTime();

import('firebase/firestore').then(async ({ collection, getDocs, updateDoc, doc }) => {
    const { db } = await import('/firebase.js');

    console.log('🚀 Starting migration...');
    const snapshot = await getDocs(collection(db, 'students'));

    let updated = 0, skipped = 0;

    for (const docSnap of snapshot.docs) {
        if (docSnap.data().createdAt) { skipped++; continue; }
        await updateDoc(doc(db, 'students', docSnap.id), { createdAt: DEFAULT_DATE });
        updated++;
        console.log('✅', docSnap.data().name);
    }

    console.log(`\n✅ Done! Updated: ${updated}, Skipped: ${skipped}`);
}).catch(e => console.error('❌ Error:', e));
