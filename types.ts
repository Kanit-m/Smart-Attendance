
export enum Role {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  GUEST = 'GUEST'
}

export enum Gender {
  MALE = 'ชาย',
  FEMALE = 'หญิง'
}

export enum AttendanceStatus {
  PRESENT = 'มาเรียน',
  ABSENT = 'ขาด',
  LATE = 'สาย',
  SICK = 'ลาป่วย',
  PERSONAL = 'ลากิจ',
  HOLIDAY = 'วันหยุด'
}

export enum StudentStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn'
}

export interface Student {
  id: string; // Firebase Document ID
  studentId: string; // รหัสนักเรียน
  number: number; // เลขที่
  name: string;
  grade: string; // ชั้น
  gender: Gender;
  status?: StudentStatus; // สถานะนักเรียน (default: ACTIVE)
  withdrawnAt?: number; // timestamp ที่ลาออก
  createdAt?: number; // timestamp ที่เพิ่มนักเรียนเข้าระบบ
}

// Unified User Interface for Firestore 'users' collection
export interface AppUser {
  id: string; // Matches Auth UID
  username: string; // e.g. 'tps001'
  name: string;
  role: Role;
  assignedClass?: string; // Only for teachers
}

// Interface for the form input
export interface TeacherForm {
  name: string;
  assignedClass: string;
  username: string;
  password?: string;
}

export interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  studentId: string; // Reference to Student ID (doc id or student code)
  studentName: string;
  studentNumber: number;
  grade: string;
  gender: Gender;
  status: AttendanceStatus;
  timestamp: number;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
}


export interface SchoolSettings {
  logoUrl: string;
}

export interface SchoolActivity {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  createdAt: number;
}

export interface DutySchedule {
  id: string;          // 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'
  teachers: string[];  // ชื่อครูเวร 2 คน
}
