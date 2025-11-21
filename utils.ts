import { DocumentData } from 'firebase/firestore';
import { Student, Gender } from './types';

export const mapStudentData = (id: string, data: DocumentData): Student => {
  // Helper to find property value from multiple possible keys
  const getValue = (possibleKeys: string[]) => {
    for (const key of possibleKeys) {
      // Check exact match
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
      
      // Check case-insensitive match
      const lowerKey = key.toLowerCase();
      const foundKey = Object.keys(data).find(k => k.toLowerCase() === lowerKey);
      if (foundKey && data[foundKey] !== undefined && data[foundKey] !== null && data[foundKey] !== '') {
        return data[foundKey];
      }
    }
    return undefined;
  };

  // 1. Student ID Mappings
  // Priority: Check specific fields, otherwise fallback to Document ID
  // User note: Document ID is used as Student ID
  const studentIdVal = getValue(['studentId', 'student_id', 'id', 'stdId', 'code', 'รหัสนักเรียน', 'รหัส']);
  const studentId = studentIdVal ? String(studentIdVal).trim() : id;
  
  // 2. Number Mappings
  // Added 'student_number' based on user DB structure
  let numberVal = getValue(['student_number', 'number', 'no', 'num', 'studentNumber', 'เลขที่']);
  const number = numberVal ? parseInt(String(numberVal)) : 0;

  // 3. Name Mappings
  // Added 'full_name' based on user DB structure
  const nameVal = getValue(['full_name', 'name', 'fullname', 'studentName', 'stdName', 'ชื่อ', 'ชื่อ-นามสกุล', 'ชื่อสกุล']);
  const name = nameVal ? String(nameVal).trim() : 'ไม่ระบุชื่อ';
  
  // 4. Grade Mappings
  // Added 'grade_level' based on user DB structure
  const gradeVal = getValue(['grade_level', 'grade', 'class', 'level', 'stdClass', 'ชั้น', 'ระดับชั้น', 'ห้อง']);
  // Important: Trim whitespace (e.g., "ป.3 " -> "ป.3") to ensure filters work correctly
  const grade = gradeVal ? String(gradeVal).trim() : 'ไม่ระบุ';
  
  // 5. Gender Mappings & Normalization
  let genderVal = getValue(['gender', 'sex', 'เพศ']);
  let gender = Gender.MALE; // Default
  
  if (genderVal) {
      const gStr = String(genderVal).trim().toLowerCase();
      if (['หญิง', 'female', 'f', 'girl', 'ญ'].includes(gStr)) {
          gender = Gender.FEMALE;
      } else {
          // Default to Male for 'ชาย', 'male', 'm', etc.
          gender = Gender.MALE;
      }
  }

  return {
    id,
    studentId,
    number,
    name,
    grade,
    gender
  };
};
