
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { TeacherPanel } from './components/TeacherPanel';
import { LoginModal } from './components/LoginModal';
import { Role, AppUser } from './types';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore/lite';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { Student } from './types';
import { mapStudentData } from './utils';

function App() {
  const [view, setView] = useState<'dashboard' | 'admin' | 'teacher'>('dashboard');
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showTeacherLogin, setShowTeacherLogin] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as AppUser;
            setCurrentUser({ ...userData, id: user.uid });
            // Determine view based on role
            if (userData.role === Role.ADMIN) setView('admin');
            else if (userData.role === Role.TEACHER) setView('teacher');
          } else {
            // User exists in Auth but not in Firestore users collection (or deleted)
            console.error("User data not found in Firestore");
            setCurrentUser(null);
          }
        } catch (e) {
          console.error("Error fetching user data", e);
        }
      } else {
        setCurrentUser(null);
        setView('dashboard');
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch school settings
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'school');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setLogoUrl(docSnap.data().logoUrl);
        }
      } catch (e) {
        console.log("Error fetching settings", e);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    // Fetch all students once
    const fetchStudents = async () => {
      try {
        const q = query(collection(db, 'students'), orderBy('grade'), orderBy('number'));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => mapStudentData(doc.id, doc.data()));
        setStudents(data);
      } catch (e) {
        console.error("Error fetching students", e);
      }
    };
    fetchStudents();
  }, []);

  const handleLogin = async (username: string, pass: string, intendedRole: Role) => {
    // Sanitize input: Remove ALL whitespace and convert to lowercase
    const cleanUsername = username.replace(/\s+/g, '').toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanUsername || !cleanPass) {
      throw new Error("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
    }

    try {
      // Check if user entered a full email, if not, append the local domain
      // Note: For 'admin' -> 'admin@school.local'
      const email = cleanUsername.includes('@')
        ? cleanUsername
        : `${cleanUsername}@school.local`;

      await signInWithEmailAndPassword(auth, email, cleanPass);

      // Successful login will trigger onAuthStateChanged
      if (intendedRole === Role.ADMIN) setShowAdminLogin(false);
      if (intendedRole === Role.TEACHER) setShowTeacherLogin(false);

    } catch (error: any) {
      console.error("Login failed", error);
      let errorMessage = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') errorMessage = "ไม่พบชื่อผู้ใช้นี้ หรือรหัสผ่านผิด (หากเพิ่งสมัครและล็อกอินไม่ได้ โปรดติดต่อ Admin)";
      else if (error.code === 'auth/wrong-password') errorMessage = "รหัสผ่านไม่ถูกต้อง";
      else if (error.code === 'auth/invalid-email') errorMessage = "รูปแบบชื่อผู้ใช้ไม่ถูกต้อง";
      else if (error.code === 'auth/too-many-requests') errorMessage = "ทำรายการซ้ำเกินกำหนด กรุณารอสักครู่";

      // Throw error to be caught by the Modal UI
      throw new Error(errorMessage);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('dashboard');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (isLoadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-sans">กำลังโหลดระบบ...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
      <Header
        currentUser={currentUser}
        onLoginAdmin={() => setShowAdminLogin(true)}
        onLoginTeacher={() => setShowTeacherLogin(true)}
        onLogout={handleLogout}
        logoUrl={logoUrl}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'dashboard' && <Dashboard students={students} />}

        {view === 'admin' && currentUser?.role === Role.ADMIN && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ระบบผู้ดูแล</h2>
              <p className="text-gray-500">จัดการข้อมูลนักเรียน ครู และการตั้งค่าระบบ</p>
            </div>
            <AdminPanel onSwitchToTeacherView={() => setView('teacher')} />
          </div>
        )}

        {view === 'teacher' && (
          <div className="animate-fade-in">
            <div className="mb-6 print:hidden">
              <h2 className="text-2xl font-bold text-gray-800">ระบบครู</h2>
              <p className="text-gray-500">บันทึกการมาเรียนและรายงานสถิติ</p>
            </div>
            <TeacherPanel
              currentUser={currentUser!}
              allStudents={students}
              onBackToAdmin={currentUser?.role === Role.ADMIN ? () => setView('admin') : undefined}
            />
          </div>
        )}

        {/* Access Denied / Fallback */}
        {(view !== 'dashboard' && !currentUser) && (
          <div className="text-center mt-20">
            <p className="text-red-500">กรุณาเข้าสู่ระบบ</p>
          </div>
        )}

        {/* Wrong Role Warning (Show only if user is NOT admin trying to access admin, and NOT teacher trying to access teacher) */}
        {(view === 'admin' && currentUser && currentUser.role !== Role.ADMIN) && (
          <div className="text-center mt-20">
            <p className="text-red-500">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (สำหรับผู้ดูแลระบบเท่านั้น)</p>
          </div>
        )}
      </main>

      <LoginModal
        isOpen={showAdminLogin}
        onClose={() => setShowAdminLogin(false)}
        title="เข้าสู่ระบบผู้ดูแล"
        buttonColor="red"
        onLogin={(u, p) => handleLogin(u, p, Role.ADMIN)}
      />

      <LoginModal
        isOpen={showTeacherLogin}
        onClose={() => setShowTeacherLogin(false)}
        title="เข้าสู่ระบบครู"
        buttonColor="green"
        onLogin={(u, p) => handleLogin(u, p, Role.TEACHER)}
      />

      <footer className="bg-white border-t py-6 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} โรงเรียนประชาสามัคคี. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default App;
